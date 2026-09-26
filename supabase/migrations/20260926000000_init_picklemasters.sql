-- =====================================================================
-- PickleMasters Live — Supabase migration (PostgreSQL 15+)
-- Schema · Roles · RLS · Realtime · Atomic scoring RPCs
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('viewer', 'scorekeeper', 'organizer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tournament_status as enum ('draft', 'ongoing', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_status as enum ('upcoming', 'live', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_type as enum ('group', 'quarterfinal', 'semifinal', 'final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_format as enum ('singles', 'doubles');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- PROFILES (1-1 with auth.users, holds the app role)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        public.app_role not null default 'viewer',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- TOURNAMENTS
-- rules_config: { target, winBy, pointsPerWin, tieBreakers[], courts[] }
-- ---------------------------------------------------------------------
create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 3 and 160),
  venue         text,
  status        public.tournament_status not null default 'draft',
  format        text not null default 'group_knockout'
                check (format in ('round_robin', 'group_knockout')),
  rules_config  jsonb not null default jsonb_build_object(
                  'target', 11,
                  'winBy', 2,
                  'pointsPerWin', 2,
                  'tieBreakers', jsonb_build_array('wins', 'h2h', 'diff', 'pf'),
                  'courts', jsonb_build_array('Sân 1', 'Sân 2')
                ),
  starts_at     timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Events inside a tournament (Đôi Nam, Đôi Nam Nữ, Đơn Nam…)
-- group_config: { groupsEnabled, numGroups, advance }
create table if not exists public.tournament_events (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  code           text not null check (code ~ '^[a-z0-9_-]{1,16}$'),
  name           text not null,
  short_name     text not null,
  match_format   public.match_format not null default 'doubles',
  group_config   jsonb not null default jsonb_build_object('groupsEnabled', true, 'numGroups', 2, 'advance', 2),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (tournament_id, code)
);

-- ---------------------------------------------------------------------
-- PLAYERS (global roster, reused across tournaments)
-- ---------------------------------------------------------------------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  rating      numeric(3,1) not null default 3.0 check (rating between 1.0 and 8.0),
  group_tag   text not null default 'Nhóm Cầu Giấy',
  gender      text not null default 'M' check (gender in ('M', 'F')),
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- GROUPS & TEAMS
-- When group stage is off, an event has exactly one group "Bảng chung".
-- ---------------------------------------------------------------------
create table if not exists public.tournament_groups (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  event_id       uuid not null references public.tournament_events (id) on delete cascade,
  group_name     text not null,               -- 'Bảng A', 'Bảng B', … or 'Bảng chung'
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (event_id, group_name)
);

create table if not exists public.group_teams (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.tournament_groups (id) on delete cascade,
  player_1_id  uuid not null references public.players (id) on delete restrict,
  player_2_id  uuid references public.players (id) on delete restrict,   -- null for singles
  team_name    text not null,
  seed         int,
  created_at   timestamptz not null default now(),
  check (player_2_id is null or player_2_id <> player_1_id)
);

-- ---------------------------------------------------------------------
-- MATCHES
-- server_state: { serving: 'A'|'B', server: 1|2, history: [{a,b,serving,server}] }
-- ---------------------------------------------------------------------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  event_id       uuid not null references public.tournament_events (id) on delete cascade,
  group_id       uuid references public.tournament_groups (id) on delete cascade,   -- null for knockout
  team_a_id      uuid not null references public.group_teams (id) on delete cascade,
  team_b_id      uuid not null references public.group_teams (id) on delete cascade,
  court_name     text,
  score_a        int not null default 0 check (score_a between 0 and 99),
  score_b        int not null default 0 check (score_b between 0 and 99),
  server_state   jsonb not null default jsonb_build_object('serving', 'A', 'server', 2, 'history', '[]'::jsonb),
  status         public.match_status not null default 'upcoming',
  match_type     public.match_type not null default 'group',
  round          int not null default 1,
  match_order    int not null default 0,
  scheduled_at   timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  updated_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (team_a_id <> team_b_id),
  check (status <> 'completed' or score_a <> score_b)
);

-- ---------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------
create index if not exists idx_events_tournament on public.tournament_events (tournament_id, sort_order);
create index if not exists idx_groups_event on public.tournament_groups (event_id, sort_order);
create index if not exists idx_teams_group on public.group_teams (group_id);
create index if not exists idx_matches_tournament on public.matches (tournament_id, match_order);
create index if not exists idx_matches_event_status on public.matches (event_id, status);
create index if not exists idx_matches_group on public.matches (group_id);
-- A court can only host one live match at a time
create unique index if not exists uq_live_match_per_court
  on public.matches (tournament_id, court_name) where status = 'live';

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_tournaments_updated on public.tournaments;
create trigger trg_tournaments_updated before update on public.tournaments
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_matches_updated on public.matches;
create trigger trg_matches_updated before update on public.matches
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- AUTH HELPERS
-- ---------------------------------------------------------------------
create or replace function public.app_role_of_current_user()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'viewer'::public.app_role);
$$;

create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_role_of_current_user() = 'organizer';
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_role_of_current_user() in ('organizer', 'scorekeeper');
$$;

-- Create a profile row for every new Google sign-in
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Public read for everything tournament-related; writes for staff only.
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.tournaments       enable row level security;
alter table public.tournament_events enable row level security;
alter table public.players           enable row level security;
alter table public.tournament_groups enable row level security;
alter table public.group_teams       enable row level security;
alter table public.matches           enable row level security;

-- profiles: users see themselves; organizers see & manage everyone
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_organizer());
drop policy if exists profiles_update_organizer on public.profiles;
create policy profiles_update_organizer on public.profiles for update to authenticated
  using (public.is_organizer()) with check (public.is_organizer());

-- Public read (anon + authenticated)
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_events', 'players', 'tournament_groups', 'group_teams', 'matches'] loop
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
  end loop;
end $$;

-- Organizer-only writes on setup tables
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_events', 'players', 'tournament_groups', 'group_teams'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_organizer())', t || '_org_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_organizer()) with check (public.is_organizer())', t || '_org_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_organizer())', t || '_org_delete', t);
  end loop;
end $$;

-- matches: organizers create/delete; organizers + scorekeepers update
drop policy if exists matches_org_insert on public.matches;
create policy matches_org_insert on public.matches for insert to authenticated
  with check (public.is_organizer());
drop policy if exists matches_staff_update on public.matches;
create policy matches_staff_update on public.matches for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists matches_org_delete on public.matches;
create policy matches_org_delete on public.matches for delete to authenticated
  using (public.is_organizer());

-- ---------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------
alter table public.matches replica identity full;
alter table public.tournaments replica identity full;

do $$
declare t text;
begin
  foreach t in array array['matches', 'tournaments', 'tournament_events', 'tournament_groups', 'group_teams'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- RPCs — all scoring goes through these so concurrent scorekeepers
-- can never overwrite each other (row lock + single statement).
-- =====================================================================

-- Point-by-point actions on a live match
create or replace function public.match_action(p_match uuid, p_action text)
returns public.matches
language plpgsql security definer set search_path = public as $$
declare
  m       public.matches;
  rules   jsonb;
  st      jsonb;
  hist    jsonb;
  snap    jsonb;
  serving text;
  server  int;
  target  int;
  win_by  int;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.status <> 'live' then raise exception 'MATCH_NOT_LIVE'; end if;

  select rules_config into rules from public.tournaments where id = m.tournament_id;
  target := coalesce((rules ->> 'target')::int, 11);
  win_by := coalesce((rules ->> 'winBy')::int, 2);

  st      := coalesce(m.server_state, '{}'::jsonb);
  hist    := coalesce(st -> 'history', '[]'::jsonb);
  serving := coalesce(st ->> 'serving', 'A');
  server  := coalesce((st ->> 'server')::int, 2);

  if p_action = 'undo' then
    if jsonb_array_length(hist) = 0 then return m; end if;
    snap := hist -> -1;
    update public.matches set
      score_a      = (snap ->> 'a')::int,
      score_b      = (snap ->> 'b')::int,
      server_state = jsonb_build_object(
                       'serving', snap ->> 'serving',
                       'server', (snap ->> 'server')::int,
                       'history', hist - (jsonb_array_length(hist) - 1)),
      updated_by   = auth.uid()
    where id = p_match
    returning * into m;
    return m;
  end if;

  if p_action in ('point_a', 'point_b')
     and greatest(m.score_a, m.score_b) >= target
     and abs(m.score_a - m.score_b) >= win_by then
    raise exception 'GAME_OVER';
  end if;

  snap := jsonb_build_object('a', m.score_a, 'b', m.score_b, 'serving', serving, 'server', server);
  hist := hist || jsonb_build_array(snap);
  while jsonb_array_length(hist) > 60 loop
    hist := hist - 0;
  end loop;

  case p_action
    when 'point_a' then m.score_a := m.score_a + 1;
    when 'point_b' then m.score_b := m.score_b + 1;
    when 'toggle_server' then server := case when server = 1 then 2 else 1 end;
    when 'side_out' then
      serving := case when serving = 'A' then 'B' else 'A' end;
      server  := 1;
    else raise exception 'UNKNOWN_ACTION %', p_action;
  end case;

  update public.matches set
    score_a      = m.score_a,
    score_b      = m.score_b,
    server_state = jsonb_build_object('serving', serving, 'server', server, 'history', hist),
    updated_by   = auth.uid()
  where id = p_match
  returning * into m;
  return m;
end $$;

-- Put the next eligible upcoming match on a free court
create or replace function public.call_next_match(p_tournament uuid, p_court text, p_prefer_event uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  next_id uuid;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if exists (select 1 from public.matches
             where tournament_id = p_tournament and court_name = p_court and status = 'live') then
    return null;
  end if;

  select mm.id into next_id
  from public.matches mm
  where mm.tournament_id = p_tournament
    and mm.status = 'upcoming'
    and not exists (
      select 1 from public.matches l
      where l.tournament_id = p_tournament and l.status = 'live'
        and (l.team_a_id in (mm.team_a_id, mm.team_b_id) or l.team_b_id in (mm.team_a_id, mm.team_b_id))
    )
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

-- Finalise (or correct) a match result. Used by both scoring modes.
create or replace function public.finalize_match(p_match uuid, p_score_a int, p_score_b int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m        public.matches;
  was_live boolean;
  next_id  uuid;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'INVALID_SCORE';
  end if;
  if p_score_a = p_score_b then
    raise exception 'TIE_NOT_ALLOWED';
  end if;

  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  was_live := m.status = 'live';

  update public.matches set
    score_a      = p_score_a,
    score_b      = p_score_b,
    status       = 'completed',
    completed_at = coalesce(completed_at, now()),
    server_state = jsonb_set(server_state, '{history}', '[]'::jsonb),
    updated_by   = auth.uid()
  where id = p_match;

  if was_live and m.court_name is not null then
    next_id := public.call_next_match(m.tournament_id, m.court_name, m.event_id);
  end if;

  return jsonb_build_object('completed_id', p_match, 'next_id', next_id);
end $$;

-- Replace an event's groups / teams / schedule in one transaction.
-- payload = {
--   config:  { groupsEnabled, numGroups, advance },
--   groups:  [{ name, teams: [{ key, player_1_id, player_2_id, team_name, seed }] }],
--   matches: [{ a, b, group, round, order, scheduled_at }]
-- }
create or replace function public.apply_event_setup(p_event uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ev        public.tournament_events;
  g         jsonb;
  t         jsonb;
  mm        jsonb;
  group_id  uuid;
  team_id   uuid;
  group_map jsonb := '{}'::jsonb;
  team_map  jsonb := '{}'::jsonb;
  gi        int := 0;
  court     text;
begin
  if not public.is_organizer() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into ev from public.tournament_events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  delete from public.matches where event_id = p_event;
  delete from public.tournament_groups where event_id = p_event;   -- cascades teams

  update public.tournament_events
     set group_config = coalesce(p_payload -> 'config', group_config)
   where id = p_event;

  for g in select * from jsonb_array_elements(p_payload -> 'groups') loop
    insert into public.tournament_groups (tournament_id, event_id, group_name, sort_order)
    values (ev.tournament_id, p_event, g ->> 'name', gi)
    returning id into group_id;
    group_map := group_map || jsonb_build_object(g ->> 'name', group_id);
    gi := gi + 1;

    for t in select * from jsonb_array_elements(g -> 'teams') loop
      insert into public.group_teams (group_id, player_1_id, player_2_id, team_name, seed)
      values (
        group_id,
        (t ->> 'player_1_id')::uuid,
        nullif(t ->> 'player_2_id', '')::uuid,
        t ->> 'team_name',
        nullif(t ->> 'seed', '')::int
      )
      returning id into team_id;
      team_map := team_map || jsonb_build_object(t ->> 'key', team_id);
    end loop;
  end loop;

  for mm in select * from jsonb_array_elements(coalesce(p_payload -> 'matches', '[]'::jsonb)) loop
    insert into public.matches (
      tournament_id, event_id, group_id, team_a_id, team_b_id,
      status, match_type, round, match_order, scheduled_at
    ) values (
      ev.tournament_id, p_event,
      (group_map ->> (mm ->> 'group'))::uuid,
      (team_map ->> (mm ->> 'a'))::uuid,
      (team_map ->> (mm ->> 'b'))::uuid,
      'upcoming', 'group',
      coalesce((mm ->> 'round')::int, 1),
      coalesce((mm ->> 'order')::int, 0),
      nullif(mm ->> 'scheduled_at', '')::timestamptz
    );
  end loop;

  -- Refill any court that became free
  for court in
    select jsonb_array_elements_text(rules_config -> 'courts')
    from public.tournaments where id = ev.tournament_id
  loop
    perform public.call_next_match(ev.tournament_id, court, p_event);
  end loop;
end $$;

-- Only authenticated users may call RPCs (the functions re-check roles)
revoke all on function public.match_action(uuid, text) from public, anon;
revoke all on function public.call_next_match(uuid, text, uuid) from public, anon;
revoke all on function public.finalize_match(uuid, int, int) from public, anon;
revoke all on function public.apply_event_setup(uuid, jsonb) from public, anon;
grant execute on function public.match_action(uuid, text) to authenticated;
grant execute on function public.call_next_match(uuid, text, uuid) to authenticated;
grant execute on function public.finalize_match(uuid, int, int) to authenticated;
grant execute on function public.apply_event_setup(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- After your first Google sign-in, promote yourself to organizer:
--   update public.profiles set role = 'organizer' where id = (
--     select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------------
