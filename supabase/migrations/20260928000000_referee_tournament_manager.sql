-- =====================================================================
-- PickleMasters Live — v1.2
--   · Trọng tài theo sân: matches.referee + tự gán khi trận lên sân
--   · Quản lý giải đấu: xoá giải (kể cả giải đã khoá, chỉ Admin)
-- Chạy sau 20260927000000_admin_members_lifecycle.sql. Chạy lại nhiều lần không lỗi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Referee (display name, public — never store e-mails here)
alter table public.matches add column if not exists referee text;
alter table public.matches drop constraint if exists matches_referee_len;
alter table public.matches add constraint matches_referee_len check (referee is null or char_length(referee) <= 60);

-- When a match goes live on a court (or moves to another court), take that court's referee
-- from tournaments.rules_config -> 'referees' -> <court name>. An explicit referee set in the
-- same statement wins; a referee left over from another court is replaced.
create or replace function public.tg_match_default_referee()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  if new.status = 'live' and new.court_name is not null and (
       (tg_op = 'INSERT' and new.referee is null)
    or (tg_op = 'UPDATE'
        and (old.status is distinct from 'live' or old.court_name is distinct from new.court_name)
        and new.referee is not distinct from old.referee)
  ) then
    select nullif(trim(t.rules_config -> 'referees' ->> new.court_name), '')
      into r
      from public.tournaments t
     where t.id = new.tournament_id;
    new.referee := r;
  end if;
  return new;
end $$;

drop trigger if exists trg_match_default_referee on public.matches;
create trigger trg_match_default_referee before insert or update on public.matches
  for each row execute function public.tg_match_default_referee();

-- ---------------------------------------------------------------------
-- 2. Delete a tournament (cascade) — the lock guard must let the cascade through
create or replace function public.tg_guard_locked_tournament()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec  record := coalesce(new, old);
  tid  uuid;
begin
  if tg_table_name = 'group_teams' then
    select tournament_id into tid from public.tournament_groups where id = rec.group_id;
  else
    tid := rec.tournament_id;
  end if;
  -- delete_tournament() marks the tournament being removed for this transaction only
  if tid is not null and current_setting('pm.deleting_tournament', true) = tid::text then
    return coalesce(new, old);
  end if;
  if tid is not null and public.tournament_is_locked(tid) then
    raise exception 'TOURNAMENT_LOCKED';
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.delete_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select status into st from public.tournaments where id = p_tournament for update;
  if st is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if st = 'completed' and not public.is_admin() then raise exception 'ADMIN_ONLY_DELETE'; end if;
  perform set_config('pm.deleting_tournament', p_tournament::text, true);
  delete from public.tournaments where id = p_tournament;
  perform set_config('pm.deleting_tournament', '', true);
end $$;

revoke all on function public.delete_tournament(uuid) from public, anon;
grant execute on function public.delete_tournament(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Assign a court's referee atomically (no lost updates when two courts are saved at once)
create or replace function public.set_court_referee(p_tournament uuid, p_court text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  nm  text := nullif(left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60), '');
  st  text;
begin
  if not public.is_organizer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select status into st from public.tournaments where id = p_tournament for update;
  if st is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if st = 'completed' then raise exception 'TOURNAMENT_LOCKED'; end if;

  update public.tournaments
     set rules_config = case
           when nm is null then coalesce(rules_config, '{}'::jsonb) #- array['referees', p_court]
           else jsonb_set(coalesce(rules_config, '{}'::jsonb), '{referees}',
                          coalesce(rules_config -> 'referees', '{}'::jsonb) || jsonb_build_object(p_court, nm))
         end
   where id = p_tournament;

  update public.matches
     set referee = nm
   where tournament_id = p_tournament and status = 'live' and court_name = p_court;
end $$;

revoke all on function public.set_court_referee(uuid, text, text) from public, anon;
grant execute on function public.set_court_referee(uuid, text, text) to authenticated;
