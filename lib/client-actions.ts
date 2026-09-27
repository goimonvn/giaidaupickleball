'use client';

/* =====================================================================
   Client-side mutations (latency-sensitive scoring + schedule edits).
   Admin / member / lifecycle operations live in lib/actions.ts (Server Actions).
   Mutations. Scoring always goes through the SQL RPCs (row-locked),
   with an optimistic update so the scorekeeper sees the point instantly.
   Errors are thrown as Vietnamese messages ready for a toast.
   ===================================================================== */
import { applyActionLocal, buildSetupPayload, friendlyError, type DraftTeam } from './engine';
import { getSupabase, getTournamentStore } from './supabase';
import type { GroupConfig, MatchActionType, MatchRow, MatchType, PlayerRow, RulesConfig, TournamentRow } from './types';

const fail = (e: unknown): never => { throw new Error(friendlyError(e)); };

export async function matchAction(tournamentId: string, matchId: string, action: MatchActionType) {
  const store = getTournamentStore(tournamentId);
  const prev = store.getMatch(matchId);
  if (prev) store.patchMatch(applyActionLocal(prev, action), true);
  const { data, error } = await getSupabase().rpc('match_action', { p_match: matchId, p_action: action });
  if (error) {
    if (prev) store.patchMatch(prev, true);
    fail(error);
  }
  if (data) store.patchMatch(data as MatchRow, true);
}

export async function finalizeMatch(tournamentId: string, matchId: string, scoreA: number, scoreB: number) {
  const { data, error } = await getSupabase().rpc('finalize_match', { p_match: matchId, p_score_a: scoreA, p_score_b: scoreB });
  if (error) fail(error);
  await getTournamentStore(tournamentId).loadMatches();
  return data as { completed_id: string; next_id: string | null };
}

export async function callNextMatch(tournamentId: string, court: string) {
  const { data, error } = await getSupabase().rpc('call_next_match', { p_tournament: tournamentId, p_court: court });
  if (error) fail(error);
  await getTournamentStore(tournamentId).loadMatches();
  return data as string | null;
}

export async function applyEventSetup(opts: {
  tournament: TournamentRow;
  eventId: string;
  teams: DraftTeam[];
  config: GroupConfig;
  players: PlayerRow[];
  orderOffset: number;
}) {
  const start = opts.tournament.starts_at ? new Date(opts.tournament.starts_at) : roundUpNow();
  const payload = buildSetupPayload({
    teams: opts.teams,
    config: opts.config,
    players: opts.players,
    start,
    courts: opts.tournament.rules_config.courts.length,
    orderOffset: opts.orderOffset,
  });
  const sb = getSupabase();
  const { error } = await sb.rpc('apply_event_setup', { p_event: opts.eventId, p_payload: payload });
  if (error) fail(error);
  // First schedule created → "Sắp diễn ra" becomes "Đang thi đấu"
  if (opts.tournament.status === 'draft') {
    const { error: e2 } = await sb.from('tournaments').update({ status: 'ongoing' }).eq('id', opts.tournament.id);
    if (e2) fail(e2);
  }
  const store = getTournamentStore(opts.tournament.id);
  await Promise.all([store.loadSetup(), store.loadMatches()]);
}

export async function updateRules(tournament: TournamentRow, patch: Partial<RulesConfig>) {
  const rules_config = { ...tournament.rules_config, ...patch };
  const { error } = await getSupabase().from('tournaments').update({ rules_config }).eq('id', tournament.id);
  if (error) fail(error);
  await getTournamentStore(tournament.id).loadSetup();
}

/** Insert knockout matches (semifinal / final) from the projected seeds. */
export async function createKnockout(opts: {
  tournamentId: string;
  eventId: string;
  type: MatchType;
  pairs: [string, string][];
  orderOffset: number;
}) {
  const rows = opts.pairs.map(([a, b], i) => ({
    tournament_id: opts.tournamentId,
    event_id: opts.eventId,
    group_id: null,
    team_a_id: a,
    team_b_id: b,
    status: 'upcoming',
    match_type: opts.type,
    round: 100,
    match_order: opts.orderOffset + i,
  }));
  const { error } = await getSupabase().from('matches').insert(rows);
  if (error) fail(error);
  await getTournamentStore(opts.tournamentId).loadMatches();
}

function roundUpNow() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10 + 10, 0, 0);
  return d;
}

/**
 * Gán trọng tài cho một sân (Bước 3). Lưu vào rules_config.referees để trận kế tiếp
 * lên sân tự nhận (trigger DB), và cập nhật luôn trận đang đấu trên sân đó.
 */
export async function assignCourtReferee(tournament: TournamentRow, court: string, name: string) {
  const { error } = await getSupabase().rpc('set_court_referee', { p_tournament: tournament.id, p_court: court, p_name: name });
  if (error) fail(error);
  await refreshTournament(tournament.id);
}

/**
 * Tự động tạo vòng loại đầu tiên khi vòng bảng xong. Called by any staff device that sees
 * the group stage finished; the SQL function is idempotent, so parallel calls are harmless.
 * Returns the number of matches created (0 = nothing to do / already created).
 */
export async function autoCreateKnockout(tournamentId: string, eventId: string, type: MatchType, pairs: [string, string][]) {
  const { data, error } = await getSupabase().rpc('auto_create_knockout', { p_event: eventId, p_type: type, p_pairs: pairs });
  if (error) fail(error);
  const n = (data as number | null) ?? 0;
  if (n) await getTournamentStore(tournamentId).loadMatches();
  return n;
}

/** Pull fresh data after a Server Action (realtime will also deliver it). */
export async function refreshTournament(tournamentId: string) {
  const store = getTournamentStore(tournamentId);
  await Promise.all([store.loadSetup(), store.loadMatches()]);
}
