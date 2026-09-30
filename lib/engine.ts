/* =====================================================================
   PickleMasters engine — pure, framework-free logic shared by the UI,
   the realtime store and the seed script.
   ===================================================================== */
import type {
  EventVM, GroupConfig, KnockoutSeed, MatchActionType, MatchRow, MatchType, MatchVM, PlayerRow, PodiumEntry, PodiumVM,
  RulesConfig, ServerState, StandingRow, TeamVM, TieBreaker, TournamentRow, TournamentStatusTag, TournamentVM,
} from './types';

export const GROUP_LETTERS = ['A', 'B', 'C', 'D'] as const;
export const DEFAULT_TIEBREAKERS: TieBreaker[] = ['wins', 'h2h', 'diff', 'pf'];
export const DEFAULT_RULES: RulesConfig = {
  target: 11, winBy: 2, pointsPerWin: 2, tieBreakers: DEFAULT_TIEBREAKERS, courts: ['Sân 1', 'Sân 2'],
  autoKnockout: true, bronzeMatch: true, checkIn: false, slotMinutes: 20,
};

export const TB_LABELS: Record<TieBreaker, string> = {
  wins: 'Số trận thắng', h2h: 'Đối đầu', diff: 'Hiệu số điểm', pf: 'Tổng điểm ghi được',
};
export const TB_SHORT: Record<TieBreaker, string> = {
  wins: 'Số trận thắng', h2h: 'Đối đầu', diff: 'Hiệu số', pf: 'Tổng điểm',
};

export const groupNameOf = (letter: string) => `Bảng ${letter}`;
export const SINGLE_GROUP_NAME = 'Bảng chung';
export const letterOf = (groupName: string, cfg: GroupConfig): string | null =>
  cfg.groupsEnabled && groupName.startsWith('Bảng ') && groupName !== SINGLE_GROUP_NAME
    ? groupName.slice(5).trim()
    : null;

/** Fill missing keys of a JSONB column with defaults. */
export const withDefaults = <T extends object>(defaults: T, value: Partial<T> | null | undefined): T => ({ ...defaults, ...(value ?? {}) });

/* ---------------------------- formatting ---------------------------- */
const TZ = 'Asia/Ho_Chi_Minh';
export const fmtHM = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }) : '--:--';
export const fmtClock = (d: Date) =>
  d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ });
export const fmtDiff = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const stageName = (qualifiers: number) =>
  qualifiers <= 2 ? 'Chung kết' : qualifiers <= 4 ? 'Bán kết' : qualifiers <= 8 ? 'Tứ kết' : 'Vòng loại trực tiếp';
export const stageType = (qualifiers: number): MatchType =>
  qualifiers <= 2 ? 'final' : qualifiers <= 4 ? 'semifinal' : 'quarterfinal';
export const MATCH_TYPE_SHORT: Record<MatchType, string> = { group: '', quarterfinal: 'TK', semifinal: 'BK', final: 'CK', bronze: 'H3' };
export const MATCH_TYPE_LABEL: Record<MatchType, string> = { group: 'Vòng bảng', quarterfinal: 'Tứ kết', semifinal: 'Bán kết', final: 'Chung kết', bronze: 'Tranh hạng 3' };

export const qualifiersOf = (cfg: GroupConfig) => (cfg.groupsEnabled ? cfg.numGroups * cfg.advance : cfg.advance);

/* ---------------------------- teams ---------------------------- */
export const teamAvg = (team: Pick<TeamVM, 'pids'>, players: PlayerRow[]) => {
  const ps = team.pids.map((id) => players.find((p) => p.id === id)).filter(Boolean) as PlayerRow[];
  return ps.length ? ps.reduce((s, p) => s + Number(p.skill_rating), 0) / ps.length : 0;
};

export const teamName = (team: Pick<TeamVM, 'pids'> | undefined | null, players: PlayerRow[], short = false) => {
  if (!team) return '—';
  return team.pids
    .map((pid) => {
      const p = players.find((x) => x.id === pid);
      if (!p) return '?';
      return short ? p.full_name.split(' ').slice(-1)[0] : p.full_name;
    })
    .join(' / ');
};

/** Snake draft: seeds sorted by average rating → A B B A A B B A … */
export function snakeAssign<T extends { id: string; pids: string[] }>(teams: T[], numGroups: number, players: PlayerRow[]) {
  const sorted = [...teams].sort((a, b) => teamAvg(b, players) - teamAvg(a, players));
  const out: Record<string, string> = {};
  sorted.forEach((t, i) => {
    const round = Math.floor(i / numGroups);
    const pos = i % numGroups;
    out[t.id] = GROUP_LETTERS[round % 2 === 0 ? pos : numGroups - 1 - pos];
  });
  return out;
}

export function roundRobin(ids: string[]) {
  const arr: (string | null)[] = [...ids];
  if (arr.length % 2) arr.push(null);
  const n = arr.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop() as string | null);
  }
  return rounds;
}

export function generatePairs(players: PlayerRow[], method: 'skill' | 'club' | 'manual', singles: boolean): PlayerRow[][] {
  if (singles) return players.map((p) => [p]);
  if (method === 'skill') {
    const s = [...players].sort((a, b) => b.skill_rating - a.skill_rating);
    return Array.from({ length: Math.floor(s.length / 2) }, (_, i) => [s[i], s[s.length - 1 - i]]);
  }
  if (method === 'club') {
    const tags = Array.from(new Set(players.map((p) => p.group_tag))).sort();
    if (tags.length < 2) return [];
    const A = players.filter((p) => p.group_tag === tags[0]).sort((a, b) => b.skill_rating - a.skill_rating);
    const B = players.filter((p) => p.group_tag === tags[1]).sort((a, b) => a.skill_rating - b.skill_rating);
    return Array.from({ length: Math.min(A.length, B.length) }, (_, i) => [A[i], B[i]]);
  }
  return [];
}

/* ---------------------------- event setup payload ---------------------------- */
export interface DraftTeam {
  key: string;
  pids: string[];
  group: string | null;
}

export interface EventSetupPayload {
  config: GroupConfig;
  groups: { name: string; teams: { key: string; player_1_id: string; player_2_id: string | null; team_name: string; seed: number }[] }[];
  matches: { a: string; b: string; group: string; round: number; order: number; scheduled_at: string }[];
}

/** Builds the RPC payload for public.apply_event_setup (groups + teams + round-robin schedule). */
export function buildSetupPayload(opts: {
  teams: DraftTeam[];
  config: GroupConfig;
  players: PlayerRow[];
  start: Date;
  courts: number;
  slotMinutes?: number;
  orderOffset?: number;
}): EventSetupPayload {
  const { teams, config, players, start, courts, slotMinutes = 20, orderOffset = 0 } = opts;
  const letters = config.groupsEnabled ? GROUP_LETTERS.slice(0, config.numGroups) : [null];
  const seedOrder = [...teams].sort((a, b) => teamAvg(b, players) - teamAvg(a, players));
  const seedOf = (key: string) => seedOrder.findIndex((t) => t.key === key) + 1;

  const groups = letters.map((l) => ({
    name: l ? groupNameOf(l) : SINGLE_GROUP_NAME,
    teams: teams
      .filter((t) => (l ? t.group === l : true))
      .map((t) => ({
        key: t.key,
        player_1_id: t.pids[0],
        player_2_id: t.pids[1] ?? null,
        team_name: teamName(t, players),
        seed: seedOf(t.key),
      })),
  }));

  const perGroup = groups.map((g) => roundRobin(g.teams.map((t) => t.key)));
  const maxR = Math.max(0, ...perGroup.map((r) => r.length));
  const matches: EventSetupPayload['matches'] = [];
  for (let r = 0; r < maxR; r++) {
    groups.forEach((g, gi) => {
      (perGroup[gi][r] || []).forEach(([a, b]) => {
        const i = matches.length;
        const at = new Date(start.getTime() + Math.floor(i / Math.max(1, courts)) * slotMinutes * 60_000);
        matches.push({ a, b, group: g.name, round: r + 1, order: orderOffset + i, scheduled_at: at.toISOString() });
      });
    });
  }
  return { config, groups, matches };
}

/* ---------------------------- view model ---------------------------- */
export function buildViewModel(input: {
  tournament: TournamentVM['tournament'];
  events: { id: string; code: string; name: string; short_name: string; match_format: string; group_config: GroupConfig; sort_order: number }[];
  groups: { id: string; event_id: string; group_name: string; sort_order: number }[];
  teams: { id: string; group_id: string; player_1_id: string; player_2_id: string | null; team_name: string; seed: number | null }[];
  matches: MatchRow[];
  players: PlayerRow[];
  participantIds?: string[];
  checkedInIds?: string[];
}): TournamentVM {
  const rules = withDefaults<RulesConfig>(DEFAULT_RULES, input.tournament.rules_config);
  const events: EventVM[] = [...input.events]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((e) => {
      const config: GroupConfig = withDefaults<GroupConfig>({ groupsEnabled: true, numGroups: 2, advance: 2 }, e.group_config);
      return {
        id: e.id,
        code: e.code,
        label: e.name,
        short: e.short_name,
        singles: e.match_format === 'singles',
        config,
        groups: input.groups
          .filter((g) => g.event_id === e.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((g) => ({ id: g.id, name: g.group_name, letter: letterOf(g.group_name, config) })),
      };
    });

  const groupIndex = new Map<string, { eventId: string; letter: string | null }>();
  events.forEach((e) => e.groups.forEach((g) => groupIndex.set(g.id, { eventId: e.id, letter: g.letter })));

  const teams: TeamVM[] = input.teams
    .filter((t) => groupIndex.has(t.group_id))
    .map((t) => {
      const g = groupIndex.get(t.group_id)!;
      return {
        id: t.id,
        eventId: g.eventId,
        groupId: t.group_id,
        group: g.letter,
        pids: [t.player_1_id, t.player_2_id].filter(Boolean) as string[],
        name: t.team_name,
        seed: t.seed,
      };
    });

  const matches: MatchVM[] = [...input.matches]
    .sort((a, b) => a.match_order - b.match_order || (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
    .map((m) => {
      const st = withDefaults<ServerState>({ serving: 'A', server: 2, history: [] }, m.server_state);
      return {
        id: m.id,
        eventId: m.event_id,
        groupId: m.group_id,
        group: m.group_id ? groupIndex.get(m.group_id)?.letter ?? null : null,
        a: m.team_a_id,
        b: m.team_b_id,
        sa: m.score_a,
        sb: m.score_b,
        status: m.status,
        type: m.match_type,
        round: m.round,
        order: m.match_order,
        time: fmtHM(m.scheduled_at),
        court: m.court_name,
        serving: st.serving,
        server: st.server,
        historyLength: st.history?.length ?? 0,
        updatedAt: m.updated_at,
        referee: m.referee ?? null,
        walkover: !!m.walkover,
        game: 1,
      };
    });

  const courts = rules.courts.map((name) => ({
    name,
    matchId: matches.find((m) => m.status === 'live' && m.court === name)?.id ?? null,
  }));

  return {
    tournament: input.tournament, rules, events, teams, matches, players: input.players, courts,
    participantIds: input.participantIds ?? [],
    checkedInIds: input.checkedInIds ?? [],
    locked: input.tournament.status === 'completed',
  };
}

export const groupsOfEvent = (ev: EventVM | undefined): (string | null)[] => {
  if (!ev) return [null];
  if (!ev.config.groupsEnabled) return [null];
  const letters = ev.groups.map((g) => g.letter).filter(Boolean) as string[];
  return letters.length ? letters : [null];
};

/* ---------------------------- standings ---------------------------- */
export function computeStandings(vm: Pick<TournamentVM, 'teams' | 'matches'>, eventId: string, group: string | null, order: TieBreaker[], pointsPerWin = 2): StandingRow[] {
  const rows: StandingRow[] = vm.teams
    .filter((t) => t.eventId === eventId && (group == null || t.group === group))
    .map((t) => ({ team: t, p: 0, w: 0, l: 0, pf: 0, pa: 0, diff: 0, pts: 0, live: false, tiedWithPrev: false }));
  const byId = new Map(rows.map((r) => [r.team.id, r]));
  const done = vm.matches.filter((m) => m.eventId === eventId && m.type === 'group' && m.status === 'completed' && byId.has(m.a) && byId.has(m.b));
  done.forEach((m) => {
    const A = byId.get(m.a)!;
    const B = byId.get(m.b)!;
    A.p++; B.p++;
    A.pf += m.sa; A.pa += m.sb; B.pf += m.sb; B.pa += m.sa;
    if (m.sa > m.sb) { A.w++; B.l++; } else { B.w++; A.l++; }
  });
  vm.matches.filter((m) => m.status === 'live').forEach((m) => {
    const A = byId.get(m.a);
    const B = byId.get(m.b);
    if (A) A.live = true;
    if (B) B.live = true;
  });
  rows.forEach((r) => { r.diff = r.pf - r.pa; r.pts = r.w * pointsPerWin; });
  // Đối đầu = mini-league among the teams still level on every criterion ranked before 'h2h'.
  // For 2 teams this is simply who won their match; for 3+ it avoids A>B>C>A cycles.
  const val = (r: StandingRow, k: TieBreaker) => (k === 'wins' ? r.w : k === 'diff' ? r.diff : k === 'pf' ? r.pf : 0);
  const before = order.slice(0, Math.max(0, order.indexOf('h2h')));
  const blockKey = (r: StandingRow) => before.map((k) => val(r, k)).join('|');
  const miniWins = new Map<string, number>();
  if (order.includes('h2h')) {
    rows.forEach((r) => {
      const key = blockKey(r);
      const block = new Set(rows.filter((x) => blockKey(x) === key).map((x) => x.team.id));
      miniWins.set(r.team.id, done.filter((m) => block.has(m.a) && block.has(m.b) && (m.sa > m.sb ? m.a : m.b) === r.team.id).length);
    });
  }
  const cmp = (a: StandingRow, b: StandingRow) => {
    for (const k of order) {
      const d = k === 'h2h' ? (miniWins.get(b.team.id) ?? 0) - (miniWins.get(a.team.id) ?? 0) : val(b, k) - val(a, k);
      if (d !== 0) return d;
    }
    return 0;
  };
  rows.sort((a, b) => cmp(a, b) || (a.team.seed ?? 99) - (b.team.seed ?? 99) || a.team.id.localeCompare(b.team.id));
  rows.forEach((r, i) => { r.tiedWithPrev = i > 0 && done.length > 0 && cmp(rows[i - 1], r) === 0; });
  return rows;
}

/** Cross-group knockout pairings (A1–B2, B1–A2 …) from current standings */
export function knockoutTies(vm: TournamentVM, ev: EventVM, order: TieBreaker[]): KnockoutSeed[][] {
  const cfg = ev.config;
  if (!cfg.groupsEnabled) {
    const rows = computeStandings(vm, ev.id, null, order, vm.rules.pointsPerWin);
    const s = (n: number): KnockoutSeed => ({ label: `#${n}`, team: rows[n - 1]?.team });
    if (cfg.advance === 2) return [[s(1), s(2)]];
    return [];
  }
  const groups = groupsOfEvent(ev) as string[];
  const tables = Object.fromEntries(groups.map((g) => [g, computeStandings(vm, ev.id, g, order, vm.rules.pointsPerWin)]));
  const seed = (g: string, n: number): KnockoutSeed => ({ label: `${n}${g}`, team: tables[g]?.[n - 1]?.team });
  if (groups.length === 2 && cfg.advance === 2) return [[seed('A', 1), seed('B', 2)], [seed('B', 1), seed('A', 2)]];
  if (groups.length === 2 && cfg.advance === 1) return [[seed('A', 1), seed('B', 1)]];
  if (groups.length === 4 && cfg.advance === 1) return [[seed('A', 1), seed('B', 1)], [seed('C', 1), seed('D', 1)]];
  if (groups.length === 4 && cfg.advance === 2) {
    return [[seed('A', 1), seed('B', 2)], [seed('B', 1), seed('A', 2)], [seed('C', 1), seed('D', 2)], [seed('D', 1), seed('C', 2)]];
  }
  return [];
}

/* ---------------------------- scoring ---------------------------- */
export const isGameOver = (sa: number, sb: number, rules: Pick<RulesConfig, 'target' | 'winBy'>) =>
  Math.max(sa, sb) >= rules.target && Math.abs(sa - sb) >= rules.winBy;

/** Pickleball score call: serving – receiving – server# (doubles) */
export const scoreCall = (m: MatchVM | undefined | null, singles: boolean) => {
  if (!m) return '';
  const s = m.serving === 'A' ? [m.sa, m.sb] : [m.sb, m.sa];
  return singles ? `${s[0]} – ${s[1]}` : `${s[0]} – ${s[1]} – ${m.server}`;
};

/** Client-side mirror of public.match_action — used for optimistic UI only. */
export function applyActionLocal(row: MatchRow, action: MatchActionType): MatchRow {
  const st = withDefaults<ServerState>({ serving: 'A', server: 2, history: [] }, row.server_state);
  const hist = [...(st.history || [])];
  if (action === 'undo') {
    const last = hist.pop();
    if (!last) return row;
    return { ...row, score_a: last.a, score_b: last.b, server_state: { serving: last.serving, server: last.server, history: hist } };
  }
  hist.push({ a: row.score_a, b: row.score_b, serving: st.serving, server: st.server });
  while (hist.length > 60) hist.shift();
  let { score_a, score_b } = row;
  let { serving, server } = st;
  if (action === 'point_a') score_a += 1;
  if (action === 'point_b') score_b += 1;
  if (action === 'toggle_server') server = server === 1 ? 2 : 1;
  if (action === 'side_out') { serving = serving === 'A' ? 'B' : 'A'; server = 1; }
  return { ...row, score_a, score_b, server_state: { serving, server, history: hist } };
}

export const RPC_ERRORS: Record<string, string> = {
  FORBIDDEN: 'Bạn chưa có quyền thực hiện thao tác này.',
  TOURNAMENT_LOCKED: 'Giải đấu đã kết thúc. Không thể thay đổi kết quả.',
  // Longer codes first: friendlyError matches by substring in insertion order
  ADMIN_ONLY_DELETE: 'Chỉ Admin mới xoá được giải đã kết thúc.',
  TOURNAMENT_NOT_FOUND: 'Không tìm thấy giải đấu (có thể đã bị xoá).',
  matches_referee_len: 'Tên trọng tài tối đa 60 ký tự.',
  KNOCKOUT_STARTED: 'Vòng này đã có trận bắt đầu nên không huỷ được.',
  INVALID_PAIRS: 'Cặp đấu loại trực tiếp không hợp lệ.',
  INVALID_STAGE: 'Vòng đấu không hợp lệ.',
  INVALID_SLOT: 'Thời lượng mỗi trận phải từ 5 đến 120 phút.',
  ALREADY_COMPLETED: 'Trận đã có kết quả. Sửa tỉ số ở Kết quả nhanh.',
  ADMIN_ONLY: 'Chỉ Admin mới mở lại được giải đã kết thúc.',
  LAST_ADMIN: 'Phải còn ít nhất một Admin. Hãy thêm Admin khác trước.',
  ADMIN_EXISTS: 'Hệ thống đã có Admin.',
  NOT_SIGNED_IN: 'Bạn cần đăng nhập Google trước.',
  FINALS_EXIST: 'Trận Chung kết và Tranh hạng 3 đã được tạo.',
  NEED_TWO_SEMIFINALS: 'Cần đúng 2 trận Bán kết để tạo Chung kết.',
  SEMIFINALS_NOT_DONE: 'Hai trận Bán kết chưa có kết quả.',
  user_roles_email_key: 'Gmail này đã có trong danh sách.',
  user_roles_email_check: 'Địa chỉ email không hợp lệ.',
  player_contacts_phone_check: 'Số điện thoại không hợp lệ.',
  GAME_OVER: 'Game đã kết thúc theo luật. Hãy bấm "Kết thúc trận đấu".',
  MATCH_NOT_LIVE: 'Trận này không còn đang diễn ra.',
  TIE_NOT_ALLOWED: 'Tỉ số không được hoà. Pickleball luôn có đội thắng.',
  INVALID_SCORE: 'Tỉ số không hợp lệ.',
  MATCH_NOT_FOUND: 'Không tìm thấy trận đấu.',
  EVENT_NOT_FOUND: 'Không tìm thấy nội dung thi đấu.',
};

export const friendlyError = (e: unknown) => {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const key = Object.keys(RPC_ERRORS).find((k) => msg.includes(k));
  if (key) return RPC_ERRORS[key];
  if (msg.includes('row-level security')) return RPC_ERRORS.FORBIDDEN;
  if (msg.includes('violates foreign key') && msg.includes('players')) return 'VĐV đang có trong đội thi đấu nên chưa xoá được.';
  return msg || 'Có lỗi xảy ra, vui lòng thử lại.';
};

/* ---------------------------- knockout & podium ---------------------------- */
const winnerOf = (m: MatchVM) => (m.sa > m.sb ? m.a : m.b);
const loserOf = (m: MatchVM) => (m.sa > m.sb ? m.b : m.a);

export interface BracketVM {
  semis: MatchVM[];
  final: MatchVM | undefined;
  bronze: MatchVM | undefined;
  /** Projected pairings from standings while semis are not created yet */
  projected: KnockoutSeed[][];
  canCreateFinals: boolean;
}

export function bracketFor(vm: TournamentVM, ev: EventVM, order: TieBreaker[]): BracketVM {
  const ko = vm.matches.filter((m) => m.eventId === ev.id && m.type !== 'group');
  const semis = ko.filter((m) => m.type === 'semifinal').sort((a, b) => a.order - b.order);
  const final = ko.find((m) => m.type === 'final');
  const bronze = ko.find((m) => m.type === 'bronze');
  return {
    semis,
    final,
    bronze,
    projected: semis.length || final ? [] : knockoutTies(vm, ev, order),
    canCreateFinals: semis.length === 2 && semis.every((m) => m.status === 'completed') && !final && !bronze,
  };
}

/** 1st/2nd from the final, 3rd from the bronze match (or both SF losers); falls back to standings. */
export function podiumFor(vm: TournamentVM, ev: EventVM, order: TieBreaker[]): PodiumVM {
  const teamById = (id: string) => vm.teams.find((t) => t.id === id);
  const statsOf = (teamId: string) => {
    let w = 0, l = 0, diff = 0;
    vm.matches.filter((m) => m.eventId === ev.id && m.status === 'completed' && (m.a === teamId || m.b === teamId)).forEach((m) => {
      const mine = m.a === teamId ? m.sa : m.sb;
      const theirs = m.a === teamId ? m.sb : m.sa;
      if (mine > theirs) w++; else l++;
      diff += mine - theirs;
    });
    return { w, l, diff };
  };
  const entry = (place: 1 | 2 | 3, id: string | undefined, source: PodiumEntry['source']): PodiumEntry[] => {
    const team = id ? teamById(id) : undefined;
    return team ? [{ place, team, source, stats: statsOf(team.id) }] : [];
  };

  const { final, bronze, semis } = bracketFor(vm, ev, order);
  if (final && final.status === 'completed') {
    let thirds: PodiumEntry[] = [];
    if (bronze && bronze.status === 'completed') thirds = entry(3, winnerOf(bronze), 'bronze');
    else if (!bronze && semis.length === 2 && semis.every((s) => s.status === 'completed')) {
      thirds = semis.flatMap((s) => entry(3, loserOf(s), 'semifinal'));
    }
    return {
      eventId: ev.id,
      label: ev.label,
      decided: true,
      entries: [...entry(1, winnerOf(final), 'final'), ...entry(2, loserOf(final), 'final'), ...thirds],
    };
  }

  // No knockout finished: rank by standings (round-robin tournaments)
  const hasKnockout = vm.matches.some((m) => m.eventId === ev.id && m.type !== 'group');
  const groupDone = vm.matches.filter((m) => m.eventId === ev.id && m.type === 'group').every((m) => m.status === 'completed');
  const rows = computeStandings(vm, ev.id, null, order, vm.rules.pointsPerWin);
  return {
    eventId: ev.id,
    label: ev.label,
    decided: !hasKnockout && groupDone && rows.length > 0 && !ev.config.groupsEnabled,
    entries: ev.config.groupsEnabled
      ? []
      : rows.slice(0, 3).map((r, i) => ({ place: (i + 1) as 1 | 2 | 3, team: r.team, source: 'standings' as const, stats: { w: r.w, l: r.l, diff: r.diff } })),
  };
}

/* ---------------------------- v1.2: pairing (Bước 2.2) ---------------------------- */

/** Deterministic PRNG (mulberry32) so "Bốc thăm lại" is reproducible per seed. */
export function seededRandom(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ratingOf = (players: PlayerRow[], id: string) => players.find((p) => p.id === id)?.skill_rating ?? 0;
export const pairSum = (pids: string[], players: PlayerRow[]) => pids.reduce((s, id) => s + ratingOf(players, id), 0);

/**
 * ⚖️ Cân bằng theo trình: start with top + bottom, then keep swapping partners between
 * two pairs while it lowers the variance of pair totals (local search, converges fast).
 */
export function pairBalanced(pool: PlayerRow[], players: PlayerRow[] = pool): string[][] {
  const s = [...pool].sort((a, b) => b.skill_rating - a.skill_rating);
  const n = Math.floor(s.length / 2);
  let pairs = Array.from({ length: n }, (_, i) => [s[i].id, s[s.length - 1 - i].id]);
  const cost = (ps: string[][]) => {
    const sums = ps.map((p) => pairSum(p, players));
    const mean = sums.reduce((a, b) => a + b, 0) / (sums.length || 1);
    return sums.reduce((a, x) => a + (x - mean) ** 2, 0);
  };
  let best = cost(pairs);
  for (let pass = 0, improved = true; improved && pass < 40; pass++) {
    improved = false;
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
          const trial = pairs.map((p) => [...p]);
          [trial[i][a], trial[j][b]] = [trial[j][b], trial[i][a]];
          const c = cost(trial);
          if (c + 1e-9 < best) { best = c; pairs = trial; improved = true; }
        }
      }
    }
  }
  return pairs;
}

/** 🔄 Cân bằng A-B: upper half by rating = nhóm A, lower half = nhóm B; each A draws one B. */
export function pairAB(pool: PlayerRow[], seed: number): string[][] {
  const s = [...pool].sort((a, b) => b.skill_rating - a.skill_rating);
  const n = Math.floor(s.length / 2);
  const A = s.slice(0, n);
  const B = s.slice(n, n * 2);
  const r = seededRandom(seed);
  for (let i = B.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [B[i], B[j]] = [B[j], B[i]];
  }
  return A.map((a, i) => [a.id, B[i].id]);
}

/** Difference between the strongest and weakest pair (average rating). */
export function pairSpread(pairs: string[][], players: PlayerRow[]) {
  if (!pairs.length) return 0;
  const avgs = pairs.map((p) => pairSum(p, players) / p.length);
  return Math.max(...avgs) - Math.min(...avgs);
}

/** Snake-assign draft pairs (by index) into `numGroups` groups: A-B-B-A… */
export function snakeByIndex(pairs: string[][], numGroups: number, players: PlayerRow[]): Record<number, string> {
  const asg = snakeAssign(pairs.map((pids, i) => ({ id: String(i), pids })), numGroups, players);
  return Object.fromEntries(Object.entries(asg).map(([k, g]) => [Number(k), g]));
}

/* ---------------------------- v1.2: tournament helpers ---------------------------- */

export const courtNames = (n: number) => Array.from({ length: Math.max(1, Math.min(4, n)) }, (_, i) => `Sân ${i + 1}`);

export const STATUS_TAG: Record<TournamentStatusTag, { label: string; cls: string }> = {
  upcoming: { label: 'Sắp diễn ra', cls: 'bg-sky-500/10 text-sky-300' },
  ongoing: { label: 'Đang thi đấu', cls: 'bg-white/10 text-slate-100' },
  completed: { label: 'Đã kết thúc', cls: 'bg-amber-500/10 text-amber-300' },
};

/** draft → Sắp diễn ra · ongoing → Đang thi đấu · completed → Đã kết thúc */
export const statusTagOf = (t: Pick<TournamentRow, 'status'>): TournamentStatusTag =>
  t.status === 'completed' ? 'completed' : t.status === 'draft' ? 'upcoming' : 'ongoing';

/** ISO timestamp → yyyy-mm-dd in local time (for <input type="date">) */
export const dateInputOf = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** ISO timestamp → HH:mm in local time (for <input type="time">) */
export const timeInputOf = (iso: string | null) => {
  if (!iso) return '08:00';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** yyyy-mm-dd + HH:mm (local, browser) → ISO. Call in the browser, never on the server (UTC). */
export const startsAtOf = (date: string, time = '08:00') => {
  if (!date) return null;
  const d = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '08:00'}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const fmtDateVN = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Chưa đặt ngày';

/** Group name shown in score strips: "Bảng A", "Vòng bảng" or the knockout stage. */
export const stageLabelOf = (m: Pick<MatchVM, 'type' | 'group'>) =>
  m.type === 'group' ? (m.group ? `Bảng ${m.group}` : 'Vòng bảng') : MATCH_TYPE_LABEL[m.type];

/* ---------------------------- v1.3: auto knockout ---------------------------- */

/**
 * Why the first knockout stage can't be created automatically yet (null = ready).
 * A tie only matters where it changes who plays whom: the qualifying boundary always,
 * and 1st vs 2nd in a group when seeds cross groups (1A–2B, 1B–2A).
 */
export function knockoutBlocker(vm: TournamentVM, ev: EventVM, order: TieBreaker[]): string | null {
  const cfg = ev.config;
  const crossSeeded = cfg.groupsEnabled && cfg.advance === 2;
  for (const g of groupsOfEvent(ev)) {
    const rows = computeStandings(vm, ev.id, g, order, vm.rules.pointsPerWin);
    const check = crossSeeded ? Array.from({ length: cfg.advance }, (_, i) => i + 1) : [cfg.advance];
    for (const i of check) {
      const r = rows[i];
      if (r?.tiedWithPrev) {
        const where = g ? `Bảng ${g}` : ev.label;
        return `${where}: ${teamName(rows[i - 1].team, vm.players)} và ${teamName(r.team, vm.players)} bằng nhau ở mọi tiêu chí ưu tiên (hạng ${i}–${i + 1}).`;
      }
    }
  }
  return null;
}

/** The pairs of the first knockout stage, ready for auto_create_knockout (null if not ready / not applicable). */
export function firstStagePairs(vm: TournamentVM, ev: EventVM, order: TieBreaker[]): { type: MatchType; pairs: [string, string][] } | null {
  const ties = knockoutTies(vm, ev, order);
  const pairs = ties.filter((t) => t[0].team && t[1].team).map((t) => [t[0].team!.id, t[1].team!.id] as [string, string]);
  if (!pairs.length || pairs.length !== ties.length) return null;
  return { type: stageType(qualifiersOf(ev.config)), pairs };
}

/**
 * First-stage knockout matches whose teams no longer match the current standings
 * (a group result was corrected after the stage was created). Empty = all good.
 */
export function staleKnockout(vm: TournamentVM, ev: EventVM, order: TieBreaker[]): MatchVM[] {
  const first = vm.matches.filter((m) => m.eventId === ev.id && m.type === stageType(qualifiersOf(ev.config)));
  if (!first.length) return [];
  const want = firstStagePairs(vm, ev, order)?.pairs ?? [];
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const wanted = new Set(want.map(([a, b]) => key(a, b)));
  return first.filter((m) => !wanted.has(key(m.a, m.b)));
}

/** Final teams no longer match the semifinal winners (a semifinal result was corrected). */
export function staleFinal(vm: TournamentVM, ev: EventVM): boolean {
  const semis = vm.matches.filter((m) => m.eventId === ev.id && m.type === 'semifinal');
  const final = vm.matches.find((m) => m.eventId === ev.id && m.type === 'final');
  if (!final || semis.length !== 2 || semis.some((s) => s.status !== 'completed')) return false;
  const winners = new Set(semis.map((s) => (s.sa > s.sb ? s.a : s.b)));
  return !(winners.has(final.a) && winners.has(final.b));
}
