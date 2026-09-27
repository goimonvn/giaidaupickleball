-- =====================================================================
-- PickleMasters Live — v1.3: tự động tạo vòng loại trực tiếp + tuỳ chọn Tranh hạng 3
--   rules_config.autoKnockout  (mặc định true)  — tự tạo Bán kết / Chung kết
--   rules_config.bronzeMatch   (mặc định true)  — false: không đá Tranh hạng 3, 2 đội thua BK đồng hạng 3
--   tournament_events.group_config.autoOff      — BTC đã "Huỷ lịch vừa tạo": tạm tắt tự động cho nội dung này
-- Chạy sau 20260928000000_referee_tournament_manager.sql. Chạy lại nhiều lần không lỗi.
-- =====================================================================

-- Is auto-knockout enabled for this event? (tournament switch on, event not paused, tournament not locked)
create or replace function public.auto_knockout_enabled(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (t.rules_config ->> 'autoKnockout') is distinct from 'false'
        and (e.group_config ->> 'autoOff') is distinct from 'true'
        and t.status <> 'completed'
       from public.tournament_events e
       join public.tournaments t on t.id = e.tournament_id
      where e.id = p_event),
    false);
$$;

-- ---------------------------------------------------------------------
-- 1. Finals: internal builder (no auth check) + public wrapper for BTC
create or replace function public._create_finals(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev        public.tournament_events;
  sf        public.matches[];
  w1 uuid; w2 uuid; l1 uuid; l2 uuid;
  base      int;
  final_id  uuid;
  bronze_id uuid := null;
  with_bronze boolean;
begin
  select * into ev from public.tournament_events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if exists (select 1 from public.matches where event_id = p_event and match_type::text in ('final', 'bronze')) then
    raise exception 'FINALS_EXIST';
  end if;

  select array_agg(m order by m.match_order) into sf
  from public.matches m
  where m.event_id = p_event and m.match_type = 'semifinal';

  if sf is null or array_length(sf, 1) <> 2 then raise exception 'NEED_TWO_SEMIFINALS'; end if;
  if sf[1].status <> 'completed' or sf[2].status <> 'completed' then raise exception 'SEMIFINALS_NOT_DONE'; end if;

  w1 := case when sf[1].score_a > sf[1].score_b then sf[1].team_a_id else sf[1].team_b_id end;
  l1 := case when sf[1].score_a > sf[1].score_b then sf[1].team_b_id else sf[1].team_a_id end;
  w2 := case when sf[2].score_a > sf[2].score_b then sf[2].team_a_id else sf[2].team_b_id end;
  l2 := case when sf[2].score_a > sf[2].score_b then sf[2].team_b_id else sf[2].team_a_id end;

  select (t.rules_config ->> 'bronzeMatch') is distinct from 'false' into with_bronze
    from public.tournaments t where t.id = ev.tournament_id;

  select coalesce(max(match_order), 0) into base from public.matches where event_id = p_event;

  if with_bronze then
    insert into public.matches (tournament_id, event_id, group_id, team_a_id, team_b_id, status, match_type, round, match_order)
    values (ev.tournament_id, p_event, null, l1, l2, 'upcoming', 'bronze'::public.match_type, 201, base + 1)
    returning id into bronze_id;
  end if;

  insert into public.matches (tournament_id, event_id, group_id, team_a_id, team_b_id, status, match_type, round, match_order)
  values (ev.tournament_id, p_event, null, w1, w2, 'upcoming', 'final', 202, base + 2)
  returning id into final_id;

  return jsonb_build_object('final_id', final_id, 'bronze_id', bronze_id);
end $$;
revoke all on function public._create_finals(uuid) from public, anon, authenticated;

create or replace function public.create_finals(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return public._create_finals(p_event);
end $$;
revoke all on function public.create_finals(uuid) from public, anon;
grant execute on function public.create_finals(uuid) to authenticated;

-- When the 2nd semifinal gets its result, create Final (+ Tranh hạng 3) right away.
-- Runs inside finalize_match, so call_next_match can put the new match on the freed court.
create or replace function public.tg_auto_finals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.auto_knockout_enabled(new.event_id)
     and not exists (select 1 from public.matches where event_id = new.event_id and match_type::text in ('final', 'bronze'))
     and (select count(*) from public.matches where event_id = new.event_id and match_type = 'semifinal') = 2
     and not exists (select 1 from public.matches where event_id = new.event_id and match_type = 'semifinal' and status <> 'completed')
  then
    perform public._create_finals(new.event_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_auto_finals on public.matches;
create trigger trg_auto_finals after update of status on public.matches
  for each row
  when (new.match_type = 'semifinal' and new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.tg_auto_finals();

-- Put the next waiting match on every free court (used after a stage is created)
create or replace function public._fill_free_courts(p_tournament uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  for c in select jsonb_array_elements_text(coalesce(t.rules_config -> 'courts', '[]'::jsonb))
             from public.tournaments t where t.id = p_tournament and t.status <> 'completed' loop
    if not exists (select 1 from public.matches where tournament_id = p_tournament and status = 'live' and court_name = c) then
      perform public.call_next_match(p_tournament, c);
    end if;
  end loop;
end $$;
revoke all on function public._fill_free_courts(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. First knockout stage (Tứ kết / Bán kết / Chung kết) from the group stage.
-- Seeding needs the standings engine (tie-breaker order), which runs in the app:
-- any staff client that sees "group stage finished" calls this once. Idempotent —
-- if the stage already exists it returns null, so two phones racing is harmless.
create or replace function public.auto_create_knockout(p_event uuid, p_type text, p_pairs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  ev    public.tournament_events;
  base  int;
  n     int := 0;
  pr    jsonb;
  a uuid; b uuid;
  seen  uuid[] := '{}';
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_type not in ('quarterfinal', 'semifinal', 'final') then raise exception 'INVALID_STAGE'; end if;

  select * into ev from public.tournament_events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if not public.auto_knockout_enabled(p_event) then return null; end if;
  if exists (select 1 from public.matches where event_id = p_event and match_type <> 'group') then return null; end if;
  if not exists (select 1 from public.matches where event_id = p_event and match_type = 'group') then return null; end if;
  if exists (select 1 from public.matches where event_id = p_event and match_type = 'group' and status <> 'completed') then return null; end if;
  if jsonb_typeof(p_pairs) <> 'array' or jsonb_array_length(p_pairs) not between 1 and 4 then raise exception 'INVALID_PAIRS'; end if;

  select coalesce(max(match_order), 0) into base from public.matches where event_id = p_event;

  for pr in select * from jsonb_array_elements(p_pairs) loop
    a := (pr ->> 0)::uuid;
    b := (pr ->> 1)::uuid;
    if a is null or b is null or a = b or a = any(seen) or b = any(seen) then raise exception 'INVALID_PAIRS'; end if;
    -- both teams must belong to this event
    if (select count(*) from public.group_teams gt join public.tournament_groups g on g.id = gt.group_id
         where g.event_id = p_event and gt.id in (a, b)) <> 2 then
      raise exception 'INVALID_PAIRS';
    end if;
    seen := seen || a || b;
    n := n + 1;
    insert into public.matches (tournament_id, event_id, group_id, team_a_id, team_b_id, status, match_type, round, match_order)
    values (ev.tournament_id, p_event, null, a, b, 'upcoming', p_type::public.match_type, 100, base + n);
  end loop;
  perform public._fill_free_courts(ev.tournament_id);
  return n;
end $$;
revoke all on function public.auto_create_knockout(uuid, text, jsonb) from public, anon;
grant execute on function public.auto_create_knockout(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. "Huỷ lịch vừa tạo": remove the newest knockout stage while none of it has started,
-- and pause auto-creation for this event so it is not recreated immediately.
create or replace function public.undo_knockout_stage(p_event uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  ev    public.tournament_events;
  stage text;
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into ev from public.tournament_events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  stage := case
    when exists (select 1 from public.matches where event_id = p_event and match_type::text in ('final', 'bronze'))
         and exists (select 1 from public.matches where event_id = p_event and match_type = 'semifinal') then 'finals'
    when exists (select 1 from public.matches where event_id = p_event and match_type = 'semifinal')
         and exists (select 1 from public.matches where event_id = p_event and match_type = 'quarterfinal') then 'semifinal'
    else 'first'
  end;

  if exists (
    select 1 from public.matches
     where event_id = p_event and match_type <> 'group'
       and (case stage
              when 'finals' then match_type::text in ('final', 'bronze')
              when 'semifinal' then match_type = 'semifinal'
              else true end)
       and (status <> 'upcoming' or score_a <> 0 or score_b <> 0)
  ) then
    raise exception 'KNOCKOUT_STARTED';
  end if;

  delete from public.matches
   where event_id = p_event and match_type <> 'group'
     and (case stage
            when 'finals' then match_type::text in ('final', 'bronze')
            when 'semifinal' then match_type = 'semifinal'
            else true end);

  update public.tournament_events
     set group_config = coalesce(group_config, '{}'::jsonb) || '{"autoOff": true}'::jsonb
   where id = p_event;
  return stage;
end $$;
revoke all on function public.undo_knockout_stage(uuid) from public, anon;
grant execute on function public.undo_knockout_stage(uuid) to authenticated;

-- Turn auto-creation back on for one event
create or replace function public.resume_auto_knockout(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.tournament_events set group_config = coalesce(group_config, '{}'::jsonb) - 'autoOff' where id = p_event;
  -- Semis may already be complete: create the finals now instead of waiting for another result
  if public.auto_knockout_enabled(p_event)
     and not exists (select 1 from public.matches where event_id = p_event and match_type::text in ('final', 'bronze'))
     and (select count(*) from public.matches where event_id = p_event and match_type = 'semifinal') = 2
     and not exists (select 1 from public.matches where event_id = p_event and match_type = 'semifinal' and status <> 'completed')
  then
    perform public._create_finals(p_event);
    perform public._fill_free_courts((select tournament_id from public.tournament_events where id = p_event));
  end if;
end $$;
revoke all on function public.resume_auto_knockout(uuid) from public, anon;
grant execute on function public.resume_auto_knockout(uuid) to authenticated;
