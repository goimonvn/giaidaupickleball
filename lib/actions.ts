'use server';

/* =====================================================================
   Server Actions — Gmail RBAC, member database, tournament lifecycle.
   They run on the server with the caller's Supabase session cookie, so
   Row Level Security still applies; the role checks here only give
   clearer error messages. Every action returns ActionResult instead of
   throwing, because Next.js hides thrown error messages in production.
   Latency-sensitive scoring stays client-side in lib/client-actions.ts.
   ===================================================================== */
import { courtNames, DEFAULT_RULES, friendlyError } from './engine';
import { createSupabaseServer } from './supabase/server';
import type {
  ActionResult, AppRole, EventInput, Member, MemberInput, RulesConfig, StaffRole, TieBreaker, TournamentInput, UserRoleRow,
} from './types';

type SB = ReturnType<typeof createSupabaseServer>;

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (e: unknown): ActionResult<never> => ({ ok: false, error: friendlyError(e) });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[0-9+ .()-]{6,20}$/;
const STAFF_ROLES: StaffRole[] = ['admin', 'organizer', 'scorekeeper'];

async function roleOf(sb: SB): Promise<AppRole> {
  const { data } = await sb.rpc('my_role');
  return ((data as string) || 'viewer') as AppRole;
}

async function requireRole(sb: SB, allowed: AppRole[]): Promise<string | null> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return 'Bạn cần đăng nhập Google trước.';
  const role = await roleOf(sb);
  return allowed.includes(role) ? null : 'Bạn chưa có quyền thực hiện thao tác này.';
}

/* ============================ ROLES (Gmail) ============================ */

export async function getMyRole(): Promise<AppRole> {
  return roleOf(createSupabaseServer());
}

export async function adminExists(): Promise<boolean> {
  const { data } = await createSupabaseServer().rpc('admin_exists');
  return Boolean(data);
}

/** First-run only: the signed-in user becomes admin while no admin exists yet. */
export async function claimFirstAdmin(): Promise<ActionResult<string>> {
  const sb = createSupabaseServer();
  const { data, error } = await sb.rpc('claim_first_admin');
  return error ? fail(error) : ok(data as string);
}

export async function listUserRoles(): Promise<ActionResult<UserRoleRow[]>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin']);
  if (denied) return { ok: false, error: denied };
  const { data, error } = await sb.from('user_roles').select('id, email, role, note, created_at').order('role').order('email');
  return error ? fail(error) : ok((data ?? []) as UserRoleRow[]);
}

export async function upsertUserRole(input: { email: string; role: StaffRole; note?: string }): Promise<ActionResult<UserRoleRow>> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Địa chỉ Gmail không hợp lệ.' };
  if (!STAFF_ROLES.includes(input.role)) return { ok: false, error: 'Vai trò không hợp lệ.' };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin']);
  if (denied) return { ok: false, error: denied };
  const { data: me } = await sb.auth.getUser();
  const { data, error } = await sb
    .from('user_roles')
    .upsert({ email, role: input.role, note: input.note?.trim() || null, created_by: me.user?.id ?? null }, { onConflict: 'email' })
    .select('id, email, role, note, created_at')
    .single();
  return error ? fail(error) : ok(data as UserRoleRow);
}

export async function updateUserRole(id: string, role: StaffRole): Promise<ActionResult<null>> {
  if (!STAFF_ROLES.includes(role)) return { ok: false, error: 'Vai trò không hợp lệ.' };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('user_roles').update({ role }).eq('id', id);
  return error ? fail(error) : ok(null);
}

export async function revokeUserRole(id: string): Promise<ActionResult<null>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('user_roles').delete().eq('id', id);
  return error ? fail(error) : ok(null);
}

/* ============================ MEMBERS ============================ */

function cleanMember(input: MemberInput): { error: string } | { player: Omit<MemberInput, 'phone'>; phone: string | null } {
  const full_name = input.full_name.trim().replace(/\s+/g, ' ');
  const skill_rating = Math.round(Number(input.skill_rating) * 10) / 10;
  const group_tag = input.group_tag.trim() || 'Nhóm Nhà';
  const phone = input.phone?.trim() || null;
  if (full_name.length < 1 || full_name.length > 80) return { error: 'Họ tên cần từ 1 đến 80 ký tự.' };
  if (!Number.isFinite(skill_rating) || skill_rating < 1 || skill_rating > 8) return { error: 'Trình độ phải từ 1.0 đến 8.0.' };
  if (phone && !PHONE_RE.test(phone)) return { error: 'Số điện thoại không hợp lệ.' };
  if (input.gender !== 'M' && input.gender !== 'F') return { error: 'Giới tính không hợp lệ.' };
  return { player: { full_name, skill_rating, group_tag, gender: input.gender, avatar_url: input.avatar_url?.trim() || null }, phone };
}

type MemberRow = Omit<Member, 'phone'> & { player_contacts: { phone: string | null } | { phone: string | null }[] | null };
const toMember = (r: MemberRow): Member => {
  const c = Array.isArray(r.player_contacts) ? r.player_contacts[0] : r.player_contacts;
  const { player_contacts: _pc, ...rest } = r;
  return { ...rest, skill_rating: Number(rest.skill_rating), phone: c?.phone ?? null };
};
const MEMBER_COLS = 'id, full_name, skill_rating, group_tag, gender, avatar_url, created_at, player_contacts(phone)';

/** Members, optionally filtered. Phone numbers are only returned to BTC/Admin (RLS). */
export async function getMembers(filter?: { search?: string; group?: string }): Promise<ActionResult<Member[]>> {
  const sb = createSupabaseServer();
  let q = sb.from('players').select(MEMBER_COLS).order('skill_rating', { ascending: false }).order('full_name');
  if (filter?.group && filter.group !== 'all') q = q.eq('group_tag', filter.group);
  if (filter?.search?.trim()) q = q.ilike('full_name', `%${filter.search.trim().replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  return error ? fail(error) : ok(((data ?? []) as unknown as MemberRow[]).map(toMember));
}

export async function createMember(input: MemberInput): Promise<ActionResult<Member>> {
  const c = cleanMember(input);
  if ('error' in c) return { ok: false, error: c.error };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { data, error } = await sb.from('players').insert(c.player).select('id').single();
  if (error) return fail(error);
  if (c.phone) {
    const { error: e2 } = await sb.from('player_contacts').upsert({ player_id: data.id, phone: c.phone });
    if (e2) return fail(e2);
  }
  const { data: row, error: e3 } = await sb.from('players').select(MEMBER_COLS).eq('id', data.id).single();
  return e3 ? fail(e3) : ok(toMember(row as unknown as MemberRow));
}

export async function updateMember(id: string, input: MemberInput): Promise<ActionResult<Member>> {
  const c = cleanMember(input);
  if ('error' in c) return { ok: false, error: c.error };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('players').update(c.player).eq('id', id);
  if (error) return fail(error);
  const contact = c.phone
    ? await sb.from('player_contacts').upsert({ player_id: id, phone: c.phone, updated_at: new Date().toISOString() })
    : await sb.from('player_contacts').delete().eq('player_id', id);
  if (contact.error) return fail(contact.error);
  const { data: row, error: e3 } = await sb.from('players').select(MEMBER_COLS).eq('id', id).single();
  return e3 ? fail(e3) : ok(toMember(row as unknown as MemberRow));
}

export async function deleteMember(id: string): Promise<ActionResult<null>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('players').delete().eq('id', id);
  return error ? fail(error) : ok(null);
}

/* ============================ TOURNAMENTS ============================ */

const TB_KEYS: TieBreaker[] = ['wins', 'h2h', 'diff', 'pf'];

function cleanTournament(input: TournamentInput): { error: string } | { title: string; venue: string | null; starts_at: string | null; rules: Pick<RulesConfig, 'target' | 'winBy' | 'tieBreakers' | 'courts'> } {
  const title = input.title.trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 120) return { error: 'Tên giải cần từ 3 đến 120 ký tự.' };
  if (![11, 15, 21].includes(input.target)) return { error: 'Điểm thắng game chỉ nhận 11, 15 hoặc 21.' };
  if (![1, 2].includes(input.winBy)) return { error: 'Cách biệt tối thiểu là 1 hoặc 2 điểm.' };
  if (!Number.isInteger(input.courts) || input.courts < 1 || input.courts > 4) return { error: 'Số sân từ 1 đến 4.' };
  if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) return { error: 'Thời gian tổ chức không hợp lệ.' };
  const tieBreakers = input.tieBreakers.filter((k) => TB_KEYS.includes(k));
  if (tieBreakers.length !== TB_KEYS.length || new Set(tieBreakers).size !== TB_KEYS.length) return { error: 'Thứ tự ưu tiên xếp hạng không hợp lệ.' };
  return {
    title,
    venue: input.venue.trim() || null,
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    rules: { target: input.target, winBy: input.winBy, tieBreakers, courts: courtNames(input.courts) },
  };
}

interface EventRowInput {
  code: string;
  name: string;
  short_name: string;
  match_format: 'singles' | 'doubles';
  group_config: { groupsEnabled: boolean; numGroups: number; advance: number };
}

function cleanEvent(e: EventInput, i: number): { error: string } | { row: EventRowInput } {
  const name = e.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) return { error: 'Tên nội dung cần từ 2 đến 40 ký tự.' };
  const numGroups = e.groupsEnabled ? Math.min(4, Math.max(2, Math.round(e.numGroups))) : 1;
  const advance = Math.min(2, Math.max(1, Math.round(e.advance)));
  return {
    row: {
      code: `${e.singles ? 'don' : 'doi'}-${Date.now().toString(36)}${i}`,
      name,
      short_name: (e.short.trim() || name).slice(0, 12),
      match_format: e.singles ? 'singles' : 'doubles',
      group_config: { groupsEnabled: e.groupsEnabled, numGroups, advance },
    },
  };
}

/** Tạo giải mới (Quản lý giải đấu). Status = draft → hiển thị "Sắp diễn ra" tới khi BTC tạo lịch. */
export async function createTournament(input: TournamentInput & { events: EventInput[]; playerIds?: string[] }): Promise<ActionResult<{ id: string; title: string }>> {
  const c = cleanTournament(input);
  if ('error' in c) return { ok: false, error: c.error };
  if (!input.events.length) return { ok: false, error: 'Chọn ít nhất một nội dung thi đấu.' };
  const evs: EventRowInput[] = [];
  for (const [i, ev] of input.events.entries()) {
    const c2 = cleanEvent(ev, i);
    if ('error' in c2) return { ok: false, error: c2.error };
    evs.push(c2.row);
  }

  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { data: me } = await sb.auth.getUser();

  const { data: t, error } = await sb
    .from('tournaments')
    .insert({
      title: c.title,
      venue: c.venue,
      status: 'draft',
      format: 'group_knockout',
      starts_at: c.starts_at,
      created_by: me.user?.id ?? null,
      rules_config: { pointsPerWin: 2, referees: {}, ...c.rules },
    })
    .select('id, title')
    .single();
  if (error) return fail(error);

  const { error: e2 } = await sb.from('tournament_events').insert(
    evs.map((row, i) => ({ ...row, tournament_id: t.id, sort_order: i })),
  );
  if (e2) {
    await sb.from('tournaments').delete().eq('id', t.id);
    return fail(e2);
  }

  if (input.playerIds?.length) {
    const { error: e3 } = await sb.from('tournament_players').insert(input.playerIds.map((player_id) => ({ tournament_id: t.id, player_id })));
    if (e3) return fail(e3);
  }
  return ok(t as { id: string; title: string });
}

/**
 * Sửa thông tin & thể lệ giải (Bước 1 / nút "Chỉnh sửa").
 * Bớt sân: trận đang đấu ở sân bị bỏ được đưa về hàng chờ.
 */
export async function updateTournament(id: string, input: TournamentInput): Promise<ActionResult<{ requeued: number }>> {
  const c = cleanTournament(input);
  if ('error' in c) return { ok: false, error: c.error };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };

  const { data: cur, error: e0 } = await sb.from('tournaments').select('status, rules_config').eq('id', id).single();
  if (e0) return fail(e0);
  const prev = (cur.rules_config ?? {}) as Partial<RulesConfig>;
  const referees = Object.fromEntries(Object.entries(prev.referees ?? {}).filter(([court]) => c.rules.courts.includes(court)));

  const { error } = await sb
    .from('tournaments')
    .update({
      title: c.title,
      venue: c.venue,
      starts_at: c.starts_at,
      rules_config: { ...DEFAULT_RULES, ...prev, ...c.rules, referees },
    })
    .eq('id', id);
  if (error) return fail(error);

  // Then free the removed courts (a locked tournament keeps its matches untouched)
  let requeued = 0;
  if (cur.status !== 'completed') {
    const { data: moved, error: e1 } = await sb
      .from('matches')
      .update({ status: 'upcoming', court_name: null, started_at: null, referee: null })
      .eq('tournament_id', id)
      .eq('status', 'live')
      .not('court_name', 'in', `(${c.rules.courts.map((x) => `"${x}"`).join(',')})`)
      .select('id');
    if (e1) return fail(e1);
    requeued = moved?.length ?? 0;
  }
  return ok({ requeued });
}

/** Xoá giải và toàn bộ nội dung, lịch, kết quả. Giải đã kết thúc: chỉ Admin. */
export async function deleteTournament(id: string): Promise<ActionResult<null>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.rpc('delete_tournament', { p_tournament: id });
  return error ? fail(error) : ok(null);
}

/** Thêm nội dung thi đấu (Đôi Nam, Đơn Nữ…) vào giải. */
export async function addEvent(tournamentId: string, input: EventInput): Promise<ActionResult<{ id: string }>> {
  const e = cleanEvent(input, 0);
  if ('error' in e) return { ok: false, error: e.error };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { data: last } = await sb.from('tournament_events').select('sort_order').eq('tournament_id', tournamentId).order('sort_order', { ascending: false }).limit(1);
  const sort_order = ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1;
  const { data, error } = await sb.from('tournament_events').insert({ ...e.row, tournament_id: tournamentId, sort_order }).select('id').single();
  return error ? fail(error) : ok(data as { id: string });
}

/**
 * Sửa nội dung. Đổi Đơn/Đôi chỉ được khi nội dung chưa có đội
 * (đội đã ghép theo thể thức cũ sẽ sai).
 */
export async function updateEvent(eventId: string, input: EventInput): Promise<ActionResult<null>> {
  const e = cleanEvent(input, 0);
  if ('error' in e) return { ok: false, error: e.error };
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { data: cur, error: e0 } = await sb.from('tournament_events').select('match_format').eq('id', eventId).single();
  if (e0) return fail(e0);
  if (cur.match_format !== e.row.match_format) {
    const { count } = await sb.from('tournament_groups').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
    if (count) return { ok: false, error: 'Nội dung đã có đội. Muốn đổi Đơn/Đôi hãy xoá nội dung rồi tạo lại.' };
  }
  const { code: _code, ...patch } = e.row;
  const { error } = await sb.from('tournament_events').update(patch).eq('id', eventId);
  return error ? fail(error) : ok(null);
}

export async function deleteEvent(eventId: string): Promise<ActionResult<null>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('tournament_events').delete().eq('id', eventId);
  return error ? fail(error) : ok(null);
}

/** Add members to the tournament's participant list (never removes; safe to call concurrently). */
export async function addTournamentParticipants(tournamentId: string, playerIds: string[]): Promise<ActionResult<number>> {
  if (!playerIds.length) return ok(0);
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb
    .from('tournament_players')
    .upsert(playerIds.map((player_id) => ({ tournament_id: tournamentId, player_id })), { onConflict: 'tournament_id,player_id', ignoreDuplicates: true });
  return error ? fail(error) : ok(playerIds.length);
}

/** Replace the tournament's participant list with the given member ids. */
export async function setTournamentParticipants(tournamentId: string, playerIds: string[]): Promise<ActionResult<number>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { data: cur, error } = await sb.from('tournament_players').select('player_id').eq('tournament_id', tournamentId);
  if (error) return fail(error);
  const have = new Set((cur ?? []).map((r: { player_id: string }) => r.player_id));
  const want = new Set(playerIds);
  const add = playerIds.filter((id) => !have.has(id));
  const remove = Array.from(have).filter((id) => !want.has(id));
  if (add.length) {
    const r = await sb.from('tournament_players').insert(add.map((player_id) => ({ tournament_id: tournamentId, player_id })));
    if (r.error) return fail(r.error);
  }
  if (remove.length) {
    const r = await sb.from('tournament_players').delete().eq('tournament_id', tournamentId).in('player_id', remove);
    if (r.error) return fail(r.error);
  }
  return ok(want.size);
}

/** "Đóng / Kết thúc Giải đấu": status → completed. Scores become read-only (DB trigger). */
export async function completeTournament(tournamentId: string): Promise<ActionResult<null>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('tournaments').update({ status: 'completed' }).eq('id', tournamentId);
  return error ? fail(error) : ok(null);
}

/** Admin only: unlock a completed tournament to correct results. */
export async function reopenTournament(tournamentId: string): Promise<ActionResult<null>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin']);
  if (denied) return { ok: false, error: denied };
  const { error } = await sb.from('tournaments').update({ status: 'ongoing' }).eq('id', tournamentId);
  return error ? fail(error) : ok(null);
}

/** Semifinal winners → Chung kết, losers → Tranh hạng Ba (atomic SQL function). */
export async function createFinals(eventId: string): Promise<ActionResult<{ final_id: string; bronze_id: string }>> {
  const sb = createSupabaseServer();
  const denied = await requireRole(sb, ['admin', 'organizer']);
  if (denied) return { ok: false, error: denied };
  const { data, error } = await sb.rpc('create_finals', { p_event: eventId });
  return error ? fail(error) : ok(data as { final_id: string; bronze_id: string });
}
