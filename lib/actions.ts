'use client';

/* =====================================================================
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
  const { error } = await getSupabase().rpc('apply_event_setup', { p_event: opts.eventId, p_payload: payload });
  if (error) fail(error);
  const store = getTournamentStore(opts.tournament.id);
  await Promise.all([store.loadSetup(), store.loadMatches()]);
}

export async function updateRules(tournament: TournamentRow, patch: Partial<RulesConfig>) {
  const rules_config = { ...tournament.rules_config, ...patch };
  const { error } = await getSupabase().from('tournaments').update({ rules_config }).eq('id', tournament.id);
  if (error) fail(error);
  await getTournamentStore(tournament.id).loadSetup();
}

export async function addPlayer(p: Pick<PlayerRow, 'name' | 'rating' | 'group_tag' | 'gender'>, tournamentId?: string) {
  const { error } = await getSupabase().from('players').insert(p);
  if (error) fail(error);
  if (tournamentId) await getTournamentStore(tournamentId).loadSetup();
}

export async function deletePlayer(id: string, tournamentId?: string) {
  const { error } = await getSupabase().from('players').delete().eq('id', id);
  if (error) fail(error);
  if (tournamentId) await getTournamentStore(tournamentId).loadSetup();
}

export async function createTournament(input: {
  title: string;
  venue: string;
  startsAt: string | null;
  courts: string[];
  events: { code: string; name: string; short: string; singles: boolean }[];
}) {
  const sb = getSupabase();
  const { data: auth } = await sb.auth.getUser();
  const { data, error } = await sb
    .from('tournaments')
    .insert({
      title: input.title,
      venue: input.venue || null,
      status: 'ongoing',
      format: 'group_knockout',
      starts_at: input.startsAt,
      created_by: auth.user?.id ?? null,
      rules_config: { target: 11, winBy: 2, pointsPerWin: 2, tieBreakers: ['wins', 'h2h', 'diff', 'pf'], courts: input.courts },
    })
    .select('*')
    .single();
  if (error) fail(error);
  const t = data as TournamentRow;
  if (input.events.length) {
    const { error: e2 } = await sb.from('tournament_events').insert(
      input.events.map((e, i) => ({
        tournament_id: t.id,
        code: e.code,
        name: e.name,
        short_name: e.short,
        match_format: e.singles ? 'singles' : 'doubles',
        group_config: { groupsEnabled: !e.singles, numGroups: e.singles ? 1 : 2, advance: 2 },
        sort_order: i,
      })),
    );
    if (e2) fail(e2);
  }
  return t;
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
