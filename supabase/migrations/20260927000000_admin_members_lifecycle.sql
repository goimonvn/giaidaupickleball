-- =====================================================================
-- PickleMasters Live — migration 002
-- · Gmail-based RBAC (user_roles, role 'admin')
-- · Member database (full_name, skill_rating, phone in a private table)
-- · Tournament participants
-- · Tournament lifecycle: completion lock, finals & bronze match
-- Run AFTER 20260926000000_init_picklemasters.sql. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. New knockout match type: third-place playoff
-- ---------------------------------------------------------------------
alter type public.match_type add value if not exists 'bronze';

-- ---------------------------------------------------------------------
-- 1. USER ROLES (Gmail → role). Replaces profiles.role as source of truth.
-- ---------------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique
              check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        text not null check (role in ('admin', 'organizer', 'scorekeeper')),
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.tg_user_roles_normalize()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_user_roles_normalize on public.user_roles;
create trigger trg_user_roles_normalize before insert or update on public.user_roles
  for each row execute function public.tg_user_roles_normalize();

-- Email of the signed-in user (from the Supabase JWT)
create or replace function public.current_email()
returns text language sql stable as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.user_roles where email = public.current_email()),
    'viewer'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() = 'admin';
$$;

-- Redefine the helpers every existing RLS policy already calls
create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'organizer');
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('admin', 'organizer', 'scorekeeper');
$$;

-- Role of the caller, for the UI
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select public.current_app_role();
$$;

-- Carry over roles set with the old profiles.role column (organizer → admin)
insert into public.user_roles (email, role)
select lower(u.email), case p.role when 'organizer' then 'admin' else 'scorekeeper' end
from public.profiles p
join auth.users u on u.id = p.id
where p.role in ('organizer', 'scorekeeper') and u.email is not null
on conflict (email) do nothing;

-- Never leave the app without an admin
create or replace function public.tg_user_roles_keep_admin()
returns trigger language plpgsql as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from public.user_roles where role = 'admin' and id <> old.id) then
    raise exception 'LAST_ADMIN';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_user_roles_keep_admin on public.user_roles;
create trigger trg_user_roles_keep_admin before update or delete on public.user_roles
  for each row execute function public.tg_user_roles_keep_admin();

alter table public.user_roles enable row level security;

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (public.is_admin() or email = public.current_email());
drop policy if exists user_roles_admin_insert on public.user_roles;
create policy user_roles_admin_insert on public.user_roles for insert to authenticated
  with check (public.is_admin());
drop policy if exists user_roles_admin_update on public.user_roles;
create policy user_roles_admin_update on public.user_roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists user_roles_admin_delete on public.user_roles;
create policy user_roles_admin_delete on public.user_roles for delete to authenticated
  using (public.is_admin());

-- First-run bootstrap: the first signed-in user may claim admin ONLY while no admin exists.
create or replace function public.claim_first_admin()
returns text language plpgsql security definer set search_path = public as $$
declare
  me text := public.current_email();
begin
  if me is null then raise exception 'NOT_SIGNED_IN'; end if;
  perform pg_advisory_xact_lock(hashtext('picklemasters_claim_admin'));
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'ADMIN_EXISTS';
  end if;
  insert into public.user_roles (email, role, note, created_by)
  values (me, 'admin', 'Admin đầu tiên', auth.uid())
  on conflict (email) do update set role = 'admin';
  return me;
end $$;

create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin');
$$;

revoke all on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.my_role() to anon, authenticated;
grant execute on function public.admin_exists() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. MEMBERS (players): full_name, skill_rating, phone (private)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'players' and column_name = 'name') then
    alter table public.players rename column name to full_name;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'players' and column_name = 'rating') then
    alter table public.players rename column rating to skill_rating;
  end if;
end $$;

alter table public.players alter column group_tag set default 'Nhóm Nhà';
create index if not exists idx_players_name on public.players (lower(full_name));

-- Phone numbers are personal data: separate table, readable by staff only.
create table if not exists public.player_contacts (
  player_id   uuid primary key references public.players (id) on delete cascade,
  phone       text check (phone is null or phone ~ '^[0-9+ .()-]{6,20}$'),
  updated_at  timestamptz not null default now()
);

alter table public.player_contacts enable row level security;
drop policy if exists player_contacts_staff_read on public.player_contacts;
create policy player_contacts_staff_read on public.player_contacts for select to authenticated
  using (public.is_organizer());
drop policy if exists player_contacts_org_insert on public.player_contacts;
create policy player_contacts_org_insert on public.player_contacts for insert to authenticated
  with check (public.is_organizer());
drop policy if exists player_contacts_org_update on public.player_contacts;
create policy player_contacts_org_update on public.player_contacts for update to authenticated
  using (public.is_organizer()) with check (public.is_organizer());
drop policy if exists player_contacts_org_delete on public.player_contacts;
create policy player_contacts_org_delete on public.player_contacts for delete to authenticated
  using (public.is_organizer());

-- ---------------------------------------------------------------------
-- 3. TOURNAMENT PARTICIPANTS (chosen from the member database)
-- ---------------------------------------------------------------------
create table if not exists public.tournament_players (
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (tournament_id, player_id)
);
create index if not exists idx_tournament_players_player on public.tournament_players (player_id);

alter table public.tournament_players enable row level security;
drop policy if exists tournament_players_public_read on public.tournament_players;
create policy tournament_players_public_read on public.tournament_players for select to anon, authenticated using (true);
drop policy if exists tournament_players_org_insert on public.tournament_players;
create policy tournament_players_org_insert on public.tournament_players for insert to authenticated
  with check (public.is_organizer());
drop policy if exists tournament_players_org_delete on public.tournament_players;
create policy tournament_players_org_delete on public.tournament_players for delete to authenticated
  using (public.is_organizer());

-- ---------------------------------------------------------------------
-- 4. LIFECYCLE LOCK: a completed tournament is read-only
-- ---------------------------------------------------------------------
create or replace function public.tournament_is_locked(p_tournament uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'completed' from public.tournaments where id = p_tournament), false);
$$;

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
  if tid is not null and public.tournament_is_locked(tid) then
    raise exception 'TOURNAMENT_LOCKED';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['matches', 'tournament_events', 'tournament_groups', 'group_teams', 'tournament_players'] loop
    execute format('drop trigger if exists trg_guard_locked on public.%I', t);
    execute format('create trigger trg_guard_locked before insert or update or delete on public.%I
                    for each row execute function public.tg_guard_locked_tournament()', t);
  end loop;
end $$;

-- Only an admin may re-open a completed tournament
create or replace function public.tg_tournament_reopen_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'completed' and new.status <> 'completed' and not public.is_admin()
     and auth.uid() is not null then
    raise exception 'ADMIN_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists trg_tournament_reopen_guard on public.tournaments;
create trigger trg_tournament_reopen_guard before update on public.tournaments
  for each row execute function public.tg_tournament_reopen_guard();

-- ---------------------------------------------------------------------
-- 5. FINALS: pair semifinal winners (final) and losers (bronze)
-- ---------------------------------------------------------------------
create or replace function public.create_finals(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev        public.tournament_events;
  sf        public.matches[];
  w1 uuid; w2 uuid; l1 uuid; l2 uuid;
  base      int;
  final_id  uuid;
  bronze_id uuid;
begin
  if not public.is_organizer() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

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

  select coalesce(max(match_order), 0) into base from public.matches where event_id = p_event;

  insert into public.matches (tournament_id, event_id, group_id, team_a_id, team_b_id, status, match_type, round, match_order)
  values (ev.tournament_id, p_event, null, l1, l2, 'upcoming', 'bronze'::public.match_type, 201, base + 1)
  returning id into bronze_id;

  insert into public.matches (tournament_id, event_id, group_id, team_a_id, team_b_id, status, match_type, round, match_order)
  values (ev.tournament_id, p_event, null, w1, w2, 'upcoming', 'final', 202, base + 2)
  returning id into final_id;

  return jsonb_build_object('final_id', final_id, 'bronze_id', bronze_id);
end $$;

revoke all on function public.create_finals(uuid) from public, anon;
grant execute on function public.create_finals(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. REALTIME
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_players') then
    alter publication supabase_realtime add table public.tournament_players;
  end if;
end $$;
