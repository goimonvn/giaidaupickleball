/* =====================================================================
   Database row types (mirror supabase/migrations/*_init_picklemasters.sql)
   Regenerate with `npm run db:types` if you change the schema.
   ===================================================================== */

export type AppRole = 'viewer' | 'scorekeeper' | 'organizer';
export type TournamentStatus = 'draft' | 'ongoing' | 'completed';
export type MatchStatus = 'upcoming' | 'live' | 'completed';
export type MatchType = 'group' | 'quarterfinal' | 'semifinal' | 'final';
export type MatchFormat = 'singles' | 'doubles';
export type TieBreaker = 'wins' | 'h2h' | 'diff' | 'pf';
export type Side = 'A' | 'B';
export type MatchActionType = 'point_a' | 'point_b' | 'toggle_server' | 'side_out' | 'undo';

export interface RulesConfig {
  target: number;
  winBy: number;
  pointsPerWin: number;
  tieBreakers: TieBreaker[];
  courts: string[];
}

export interface GroupConfig {
  groupsEnabled: boolean;
  numGroups: number;
  advance: number;
}

export interface ServerSnapshot {
  a: number;
  b: number;
  serving: Side;
  server: 1 | 2;
}

export interface ServerState {
  serving: Side;
  server: 1 | 2;
  history: ServerSnapshot[];
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  created_at: string;
}

export interface TournamentRow {
  id: string;
  title: string;
  venue: string | null;
  status: TournamentStatus;
  format: 'round_robin' | 'group_knockout';
  rules_config: RulesConfig;
  starts_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentEventRow {
  id: string;
  tournament_id: string;
  code: string;
  name: string;
  short_name: string;
  match_format: MatchFormat;
  group_config: GroupConfig;
  sort_order: number;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  name: string;
  rating: number;
  group_tag: string;
  gender: 'M' | 'F';
  avatar_url: string | null;
  created_at: string;
}

export interface TournamentGroupRow {
  id: string;
  tournament_id: string;
  event_id: string;
  group_name: string;
  sort_order: number;
  created_at: string;
}

export interface GroupTeamRow {
  id: string;
  group_id: string;
  player_1_id: string;
  player_2_id: string | null;
  team_name: string;
  seed: number | null;
  created_at: string;
}

export interface MatchRow {
  id: string;
  tournament_id: string;
  event_id: string;
  group_id: string | null;
  team_a_id: string;
  team_b_id: string;
  court_name: string | null;
  score_a: number;
  score_b: number;
  server_state: ServerState;
  status: MatchStatus;
  match_type: MatchType;
  round: number;
  match_order: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/* =====================================================================
   View models used by the UI (same shape as the approved prototype)
   ===================================================================== */

export type GroupLetter = string; // 'A' | 'B' | 'C' | 'D'

export interface EventVM {
  id: string;
  code: string;
  label: string;
  short: string;
  singles: boolean;
  config: GroupConfig;
  groups: { id: string; name: string; letter: GroupLetter | null }[];
}

export interface TeamVM {
  id: string;
  eventId: string;
  groupId: string;
  group: GroupLetter | null;
  pids: string[];
  name: string;
  seed: number | null;
}

export interface MatchVM {
  id: string;
  eventId: string;
  groupId: string | null;
  group: GroupLetter | null;
  a: string;
  b: string;
  sa: number;
  sb: number;
  status: MatchStatus;
  type: MatchType;
  round: number;
  order: number;
  time: string;
  court: string | null;
  serving: Side;
  server: 1 | 2;
  historyLength: number;
  updatedAt: string;
}

export interface CourtVM {
  name: string;
  matchId: string | null;
}

export interface TournamentVM {
  tournament: TournamentRow;
  rules: RulesConfig;
  events: EventVM[];
  teams: TeamVM[];
  matches: MatchVM[];
  players: PlayerRow[];
  courts: CourtVM[];
}

export interface StandingRow {
  team: TeamVM;
  p: number;
  w: number;
  l: number;
  pf: number;
  pa: number;
  diff: number;
  pts: number;
  live: boolean;
}

export interface KnockoutSeed {
  label: string;
  team: TeamVM | undefined;
}

/** UI state lifted to the page so tabs / filters survive mode switches */
export interface UIState {
  viewerEvent: string | null;
  viewerGroup: string;
  viewerMatchTab: 'live' | 'upcoming' | 'completed';
  adminEvent: string | null;
  scoreMode: 'live' | 'quick';
  activeCourt: string | null;
  quickEvent: string;
  quickMatch: string | null;
  tvCycle: boolean;
  tvIdx: number;
}

export type AppMode = 'viewer' | 'admin' | 'score' | 'tv';
