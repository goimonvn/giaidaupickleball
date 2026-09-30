-- =====================================================================
-- PickleMasters Live — v1.4: ngày thi đấu
--   · Điểm danh VĐV (tournament_players.checked_in_at) + chỉ gọi trận khi đủ người
--     (rules_config.checkIn = true)
--   · Xử thua do vắng mặt (matches.walkover)
--   · Dời lịch: tính lại giờ dự kiến các trận chưa đấu
-- Chạy sau 20260929000000_auto_knockout.sql. Chạy lại nhiều lần không lỗi.
-- =====================================================================

alter table public.tournament_players add column if not exists checked_in_at timestamptz;
alter table public.matches add column if not exists walkover boolean not null default false;

-- ---------------------------------------------------------------------
-- 1. Điểm danh: BTC or referee marks a player present / absent for this tournament
create or replace function public.set_checkin(p_tournament uuid, p_player uuid, p_present boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if public.tournament_is_locked(p_tournament) then raise exception 'TOURNAMENT_LOCKED'; end if;
  if p_present then
    insert into public.tournament_players (tournament_id, player_id, checked_in_at)
    values (p_tournament, p_player, now())
    on conflict (tournament_id, player_id)
    do update set checked_in_at = coalesce(public.tournament_players.checked_in_at, now());
  else
    -- Unticking never registers someone new
    update public.tournament_players set checked_in_at = null
     where tournament_id = p_tournament and player_id = p_player;
  end if;
end $$;
revoke all on function public.set_checkin(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_checkin(uuid, uuid, boolean) to authenticated;

-- "Có mặt tất cả": one call for a whole list
create or replace function public.set_checkin_many(p_tournament uuid, p_players uuid[], p_present boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  n   int := 0;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  foreach pid in array coalesce(p_players, '{}') loop
    perform public.set_checkin(p_tournament, pid, p_present);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.set_checkin_many(uuid, uuid[], boolean) from public, anon;
grant execute on function public.set_checkin_many(uuid, uuid[], boolean) to authenticated;

-- Merge a few keys into rules_config server-side (no lost updates of referees / slotMinutes)
create or replace function public.patch_rules(p_tournament uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'INVALID_PATCH'; end if;
  update public.tournaments set rules_config = coalesce(rules_config, '{}'::jsonb) || p_patch where id = p_tournament;
end $$;
revoke all on function public.patch_rules(uuid, jsonb) from public, anon;
grant execute on function public.patch_rules(uuid, jsonb) to authenticated;

-- Are all players of a team checked in for the tournament?
create or replace function public.team_present(p_tournament uuid, p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
      from public.group_teams gt
      cross join lateral (values (gt.player_1_id), (gt.player_2_id)) as p(pid)
     where gt.id = p_team and p.pid is not null
       and not exists (select 1 from public.tournament_players tp
                        where tp.tournament_id = p_tournament and tp.player_id = p.pid and tp.checked_in_at is not null)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. call_next_match: same as before, plus — when rules_config.checkIn is on —
--    only matches whose four (or two) players are all checked in
create or replace function public.call_next_match(p_tournament uuid, p_court text, p_prefer_event uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  next_id  uuid;
  need_all boolean;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if exists (select 1 from public.matches
             where tournament_id = p_tournament and court_name = p_court and status = 'live') then
    return null;
  end if;

  select coalesce((rules_config ->> 'checkIn')::boolean, false) into need_all
    from public.tournaments where id = p_tournament;

  select mm.id into next_id
  from public.matches mm
  where mm.tournament_id = p_tournament
    and mm.status = 'upcoming'
    and not exists (
      select 1 from public.matches l
      where l.tournament_id = p_tournament and l.status = 'live'
        and (l.team_a_id in (mm.team_a_id, mm.team_b_id) or l.team_b_id in (mm.team_a_id, mm.team_b_id))
    )
    and (not need_all or (public.team_present(p_tournament, mm.team_a_id) and public.team_present(p_tournament, mm.team_b_id)))
  order by (mm.event_id = p_prefer_event) desc nulls last, mm.match_order, mm.scheduled_at nulls last
  limit 1
  for update skip locked;

  if next_id is null then return null; end if;

  update public.matches set
    status       = 'live',
    court_name   = p_court,
    score_a      = 0,
    score_b      = 0,
    started_at   = now(),
    server_state = jsonb_build_object('serving', 'A', 'server', 2, 'history', '[]'::jsonb),
    updated_by   = auth.uid()
  where id = next_id;

  return next_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Xử thua do vắng mặt: the present side wins <target>–0, match flagged as walkover.
--    If the match was on a court, the next match is called onto it.
create or replace function public.walkover_match(p_match uuid, p_winner text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m       public.matches;
  target  int;
  court   text;
  next_id uuid := null;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_winner not in ('A', 'B') then raise exception 'INVALID_SCORE'; end if;

  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  -- Already has a result: correct it with the normal result entry instead
  if m.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;

  select greatest(1, coalesce((rules_config ->> 'target')::int, 11)) into target
    from public.tournaments where id = m.tournament_id;
  court := case when m.status = 'live' then m.court_name end;

  update public.matches set
    score_a      = case when p_winner = 'A' then target else 0 end,
    score_b      = case when p_winner = 'B' then target else 0 end,
    status       = 'completed',
    walkover     = true,
    completed_at = now(),
    updated_by   = auth.uid()
  where id = p_match;

  if court is not null then
    next_id := public.call_next_match(m.tournament_id, court, m.event_id);
  end if;
  return jsonb_build_object('completed_id', p_match, 'next_id', next_id);
end $$;
revoke all on function public.walkover_match(uuid, text) from public, anon;
grant execute on function public.walkover_match(uuid, text) to authenticated;

-- A result entered normally afterwards clears the walkover flag
create or replace function public.tg_clear_walkover()
returns trigger language plpgsql as $$
begin
  if new.walkover and old.walkover and (new.score_a, new.score_b) is distinct from (old.score_a, old.score_b) then
    new.walkover := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_clear_walkover on public.matches;
create trigger trg_clear_walkover before update of score_a, score_b on public.matches
  for each row execute function public.tg_clear_walkover();

-- ---------------------------------------------------------------------
-- 4. Dời lịch: re-time every upcoming match — the first round of courts starts at p_start,
--    each following round p_slot minutes later. Live matches and results are untouched.
create or replace function public.reschedule_matches(p_tournament uuid, p_start timestamptz, p_slot int)
returns int language plpgsql security definer set search_path = public as $$
declare
  courts int;
  n      int;
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_slot is null or p_slot < 5 or p_slot > 120 then raise exception 'INVALID_SLOT'; end if;
  if public.tournament_is_locked(p_tournament) then raise exception 'TOURNAMENT_LOCKED'; end if;

  select greatest(1, coalesce(jsonb_array_length(rules_config -> 'courts'), 1)) into courts
    from public.tournaments where id = p_tournament;

  with ordered as (
    select id, row_number() over (order by match_order, scheduled_at nulls last, id) - 1 as idx
      from public.matches
     where tournament_id = p_tournament and status = 'upcoming'
  )
  update public.matches m
     set scheduled_at = p_start + make_interval(mins => (o.idx / courts)::int * p_slot)
    from ordered o
   where m.id = o.id;
  get diagnostics n = row_count;

  -- Remember the slot length for the next time
  update public.tournaments
     set rules_config = coalesce(rules_config, '{}'::jsonb) || jsonb_build_object('slotMinutes', p_slot)
   where id = p_tournament;
  return n;
end $$;
revoke all on function public.reschedule_matches(uuid, timestamptz, int) from public, anon;
grant execute on function public.reschedule_matches(uuid, timestamptz, int) to authenticated;
