/* =====================================================================
   Database row types (mirror supabase/migrations/*_init_picklemasters.sql)
   Regenerate with `npm run db:types` if you change the schema.
   ===================================================================== */

export type AppRole = 'viewer' | 'scorekeeper' | 'organizer' | 'admin';
export type StaffRole = Exclude<AppRole, 'viewer'>;
export type TournamentStatus = 'draft' | 'ongoing' | 'completed';
export type MatchStatus = 'upcoming' | 'live' | 'completed';
export type MatchType = 'group' | 'quarterfinal' | 'semifinal' | 'final' | 'bronze';
export type MatchFormat = 'singles' | 'doubles';
export type TieBreaker = 'wins' | 'h2h' | 'diff' | 'pf';
export type Side = 'A' | 'B';
export type MatchActionType = 'point_a' | 'point_b' | 'toggle_server' | 'side_out' | 'undo';

export interface RulesConfig {
  /** Điểm thắng game: 11 / 15 / 21 */
  target: number;
  /** Cách biệt tối thiểu: 1 hoặc 2 (win by 2) */
  winBy: number;
  pointsPerWin: number;
  /** Ưu tiên khi bằng điểm, theo thứ tự */
  tieBreakers: TieBreaker[];
  /** Tên sân đang dùng ('Sân 1' … 'Sân 4'); số sân = courts.length */
  courts: string[];
  /** Trọng tài theo sân (tên hiển thị công khai, không lưu email). DB tự gán cho trận khi lên sân. */
  referees?: Record<string, string>;
  /** Tự tạo Bán kết khi xong vòng bảng, Chung kết khi xong Bán kết (mặc định bật) */
  autoKnockout?: boolean;
  /** Có đá Tranh hạng 3 không. Tắt: 2 đội thua Bán kết đồng hạng 3 (mặc định bật) */
  bronzeMatch?: boolean;
  /** Điểm danh: chỉ gọi trận lên sân khi mọi VĐV của 2 đội đã có mặt */
  checkIn?: boolean;
  /** Số phút cho mỗi lượt trận khi xếp / dời lịch (mặc định 20) */
  slotMinutes?: number;
}

export interface GroupConfig {
  groupsEnabled: boolean;
  numGroups: number;
  advance: number;
  /** BTC bấm "Huỷ lịch vừa tạo": tạm tắt tự động tạo vòng loại cho nội dung này */
  autoOff?: boolean;
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
  full_name: string;
  skill_rating: number;
  group_tag: string;
  gender: 'M' | 'F';
  avatar_url: string | null;
  created_at: string;
}

/** Member = player + private contact (phone is only readable by BTC/Admin) */
export interface Member extends PlayerRow {
  phone: string | null;
}

export interface MemberInput {
  full_name: string;
  skill_rating: number;
  group_tag: string;
  gender: 'M' | 'F';
  phone?: string | null;
  avatar_url?: string | null;
}

export interface UserRoleRow {
  id: string;
  email: string;
  role: StaffRole;
  note: string | null;
  created_at: string;
}

export interface TournamentPlayerRow {
  tournament_id: string;
  player_id: string;
}

/** Result shape of every server action (errors never throw across the network) */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

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
  /** Trọng tài của trận (copy từ rules_config.referees khi trận lên sân) */
  referee: string | null;
  /** Xử thua do vắng mặt */
  walkover?: boolean;
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
  referee: string | null;
  /** Kết quả do xử thua (đội kia vắng mặt) */
  walkover: boolean;
  /** Hiệp đang đấu. Hiện mỗi trận là 1 game nên luôn = 1 (để sẵn cho thể thức best-of-3). */
  game: number;
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
  /** Player ids registered for this tournament (empty = everyone in the member database) */
  participantIds: string[];
  /** Player ids that are checked in (Điểm danh) for this tournament */
  checkedInIds: string[];
  courts: CourtVM[];
  locked: boolean;
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
  /** Bằng đội xếp ngay trên ở MỌI tiêu chí ưu tiên — thứ tự giữa 2 đội này chưa phân định được */
  tiedWithPrev: boolean;
}

export interface PodiumEntry {
  place: 1 | 2 | 3;
  team: TeamVM;
  /** How the place was decided */
  source: 'final' | 'bronze' | 'semifinal' | 'standings';
  stats: { w: number; l: number; diff: number };
}

export interface PodiumVM {
  eventId: string;
  label: string;
  entries: PodiumEntry[];
  decided: boolean;
}

export interface KnockoutSeed {
  label: string;
  team: TeamVM | undefined;
}

/* =====================================================================
   UI (PickleMasters Live v1.2 — theo bản demo v4 đã duyệt)
   ===================================================================== */

/** Tab công khai: khách thấy dạng tab trên cùng, nhân sự thấy ở thanh điều hướng đáy */
export type PublicTab = 'matches' | 'table' | 'podium';
/** Màn hình chỉ dành cho nhân sự (BTC có cả 2, Trọng tài chỉ có 'referee') */
export type StaffScreen = 'btc' | 'referee';
/** Mọi màn hình của trang chính. 'tournaments' mở từ menu avatar (Quản lý giải đấu). TV là trang riêng /tv/[id]. */
export type AppScreen = PublicTab | StaffScreen | 'tournaments';

export type TournamentStatusTag = 'upcoming' | 'ongoing' | 'completed';

/** 2.2 Ghép cặp */
export type PairingMode = 'balanced' | 'ab' | 'manual';
/** 2.3 Chia bảng */
export type GroupingMode = 'auto' | 'manual';
export type BtcSubStep = '2.1' | '2.2' | '2.3';

/** Bản nháp Bước 2 của một nội dung — giữ ở trang để không mất khi đổi màn hình */
export interface BtcDraft {
  sub: BtcSubStep;
  picked: string[];
  pairMode: PairingMode;
  abSeed: number;
  /** null = chưa ghép; mỗi phần tử là danh sách player id của một đội */
  pairs: string[][] | null;
  groupMode: GroupingMode;
  groupsEnabled: boolean;
  numGroups: number;
  advance: number;
  /** index đội trong `pairs` → chữ cái bảng */
  assign: Record<number, string>;
}

/** Dữ liệu form Tạo / Sửa giải (Quản lý giải đấu & Bước 1) */
export interface TournamentInput {
  title: string;
  /** yyyy-mm-dd (form field, local time) */
  date: string;
  /** HH:mm — giờ bắt đầu (form field, local time) */
  time: string;
  /** Computed in the browser from date + time so the server never guesses the timezone */
  startsAt: string | null;
  venue: string;
  courts: number;
  target: number;
  winBy: number;
  tieBreakers: TieBreaker[];
  /** Tự động tạo vòng loại trực tiếp */
  autoKnockout: boolean;
  /** Tổ chức trận Tranh hạng 3 */
  bronzeMatch: boolean;
}

export interface EventInput {
  name: string;
  short: string;
  singles: boolean;
  groupsEnabled: boolean;
  numGroups: number;
  advance: number;
}

/** UI state lifted to the page so filters / scoring mode survive screen switches */
export interface UIState {
  tvView: 'live' | 'podium';
  viewerEvent: string | null;
  viewerGroup: string;
  adminEvent: string | null;
  scoreMode: 'live' | 'quick';
  activeCourt: string | null;
  quickEvent: string;
  quickMatch: string | null;
  tvCycle: boolean;
  tvIdx: number;
}
