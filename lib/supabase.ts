'use client';

/* =====================================================================
   Supabase browser client + realtime data layer + React hooks
   - One realtime channel per tournament, shared (ref-counted) by every
     component that calls a hook for that tournament.
   - useRealtimeMatches(tournamentId): live matches for TV / Public view
   - useStandingsEngine(tournamentId): standings with tie-breaker rules
   ===================================================================== */
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel, RealtimePostgresChangesPayload, Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { bracketFor, buildViewModel, computeStandings, groupsOfEvent, knockoutTies, podiumFor, qualifiersOf, stageName, type BracketVM } from './engine';
import type {
  AppRole, EventVM, GroupTeamRow, MatchRow, PlayerRow, PodiumVM, ProfileRow, StandingRow, TieBreaker, TournamentEventRow,
  TournamentGroupRow, TournamentRow, TournamentVM,
} from './types';

/* ---------------------------- client ---------------------------- */
let browserClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local');
  browserClient = createBrowserClient(url, key, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return browserClient;
}

/* ---------------------------- realtime store ---------------------------- */
export interface TournamentSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  connected: boolean;
  tournament: TournamentRow | null;
  events: TournamentEventRow[];
  groups: TournamentGroupRow[];
  teams: GroupTeamRow[];
  players: PlayerRow[];
  participantIds: string[];
  checkedInIds: string[];
  matches: MatchRow[];
}

const EMPTY: TournamentSnapshot = {
  status: 'idle', error: null, connected: false, tournament: null,
  events: [], groups: [], teams: [], players: [], participantIds: [], checkedInIds: [], matches: [],
};

class TournamentStore {
  private snap: TournamentSnapshot = { ...EMPTY };
  private listeners = new Set<() => void>();
  private refs = 0;
  private channel: RealtimeChannel | null = null;
  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedOnce = false;

  constructor(readonly id: string) {}

  getSnapshot = () => this.snap;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    if (this.refs++ === 0) this.start();
    return () => {
      this.listeners.delete(fn);
      if (--this.refs === 0) this.stop();
    };
  };

  private set(patch: Partial<TournamentSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Optimistic / RPC result merge. `force` skips the updated_at guard (used for rollback). */
  patchMatch(row: MatchRow, force = false) {
    const cur = this.snap.matches.find((m) => m.id === row.id);
    if (cur && !force && cur.updated_at > row.updated_at) return;
    this.set({
      matches: cur ? this.snap.matches.map((m) => (m.id === row.id ? row : m)) : [...this.snap.matches, row],
    });
  }

  /* ---- "Gọi đội ra sân" on the venue TV: realtime broadcast on the tournament channel ---- */
  private callListeners = new Set<(matchId: string) => void>();

  /** Listen for manual "gọi lại" requests (the TV page). Returns an unsubscribe function. */
  onCall(fn: (matchId: string) => void) {
    this.callListeners.add(fn);
    return () => { this.callListeners.delete(fn); };
  }

  /** Ask every open TV screen to show the call-to-court overlay for this match again. */
  async sendCall(matchId: string) {
    if (!this.channel || !this.snap.connected) return false;
    const res = await this.channel.send({ type: 'broadcast', event: 'call', payload: { matchId } });
    return res === 'ok';
  }

  getMatch(id: string) {
    return this.snap.matches.find((m) => m.id === id);
  }

  async loadMatches() {
    const sb = getSupabase();
    const { data, error } = await sb.from('matches').select('*').eq('tournament_id', this.id).order('match_order');
    if (error) throw error;
    this.set({ matches: (data ?? []) as MatchRow[] });
  }

  async loadSetup() {
    const sb = getSupabase();
    const [t, e, g, p, tp] = await Promise.all([
      sb.from('tournaments').select('*').eq('id', this.id).single(),
      sb.from('tournament_events').select('*').eq('tournament_id', this.id).order('sort_order'),
      sb.from('tournament_groups').select('*').eq('tournament_id', this.id).order('sort_order'),
      sb.from('players').select('id, full_name, skill_rating, group_tag, gender, avatar_url, created_at').order('skill_rating', { ascending: false }),
      // '*' so the app still works before the v1.4 migration adds checked_in_at
      sb.from('tournament_players').select('*').eq('tournament_id', this.id),
    ]);
    const err = t.error || e.error || g.error || p.error || tp.error;
    if (err) throw err;
    const groupIds = ((g.data ?? []) as TournamentGroupRow[]).map((x) => x.id);
    const teams = groupIds.length
      ? await sb.from('group_teams').select('*').in('group_id', groupIds)
      : { data: [], error: null };
    if (teams.error) throw teams.error;
    this.set({
      tournament: t.data as TournamentRow,
      events: (e.data ?? []) as TournamentEventRow[],
      groups: (g.data ?? []) as TournamentGroupRow[],
      teams: (teams.data ?? []) as GroupTeamRow[],
      players: ((p.data ?? []) as PlayerRow[]).map((x) => ({ ...x, skill_rating: Number(x.skill_rating) })),
      participantIds: ((tp.data ?? []) as { player_id: string }[]).map((x) => x.player_id),
      checkedInIds: ((tp.data ?? []) as { player_id: string; checked_in_at?: string | null }[]).filter((x) => x.checked_in_at).map((x) => x.player_id),
    });
  }

  async loadAll() {
    if (!this.loadedOnce) this.set({ status: 'loading', error: null });
    try {
      await Promise.all([this.loadSetup(), this.loadMatches()]);
      this.loadedOnce = true;
      this.set({ status: 'ready', error: null });
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  private scheduleSetupReload() {
    if (this.setupTimer) clearTimeout(this.setupTimer);
    this.setupTimer = setTimeout(() => { this.loadSetup().catch(() => undefined); }, 250);
  }

  private onMatchChange = (payload: RealtimePostgresChangesPayload<MatchRow>) => {
    if (payload.eventType === 'DELETE') {
      const id = (payload.old as Partial<MatchRow>).id;
      if (id) this.set({ matches: this.snap.matches.filter((m) => m.id !== id) });
      return;
    }
    const row = payload.new as MatchRow;
    if (row.tournament_id !== this.id) return;
    this.patchMatch(row);
  };

  private start() {
    const sb = getSupabase();
    void this.loadAll();
    this.channel = sb
      .channel(`pm-tournament-${this.id}`)
      .on<MatchRow>('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${this.id}` }, this.onMatchChange)
      .on<TournamentRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${this.id}` }, (p: RealtimePostgresChangesPayload<TournamentRow>) =>
        this.set({ tournament: p.new as TournamentRow }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_events', filter: `tournament_id=eq.${this.id}` }, () => this.scheduleSetupReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_groups', filter: `tournament_id=eq.${this.id}` }, () => this.scheduleSetupReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_players', filter: `tournament_id=eq.${this.id}` }, () => this.scheduleSetupReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_teams' }, () => this.scheduleSetupReload())
      .on('broadcast', { event: 'call' }, (msg: { payload?: { matchId?: string } }) => {
        const id = msg.payload?.matchId;
        if (id) this.callListeners.forEach((l) => l(id));
      })
      .subscribe((status: string) => {
        const connected = status === 'SUBSCRIBED';
        this.set({ connected });
        // Resync after a reconnect so no change is missed while offline
        if (connected && this.loadedOnce) void this.loadAll();
      });
  }

  private stop() {
    if (this.channel) void getSupabase().removeChannel(this.channel);
    this.channel = null;
    if (this.setupTimer) clearTimeout(this.setupTimer);
  }
}

const stores = new Map<string, TournamentStore>();
export function getTournamentStore(id: string) {
  let s = stores.get(id);
  if (!s) { s = new TournamentStore(id); stores.set(id, s); }
  return s;
}

const noopSubscribe = () => () => undefined;
const getEmpty = () => EMPTY;

function useTournamentSnapshot(tournamentId: string | null | undefined): TournamentSnapshot {
  const store = tournamentId ? getTournamentStore(tournamentId) : null;
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, store ? store.getSnapshot : getEmpty, getEmpty);
}

/* ---------------------------- hooks ---------------------------- */

/** Live matches of a tournament (initial fetch + Postgres changes). */
export function useRealtimeMatches(tournamentId: string | null | undefined) {
  const snap = useTournamentSnapshot(tournamentId);
  const refetch = useCallback(() => (tournamentId ? getTournamentStore(tournamentId).loadMatches() : Promise.resolve()), [tournamentId]);
  return {
    matches: snap.matches,
    loading: snap.status === 'loading' || snap.status === 'idle',
    error: snap.error,
    connected: snap.connected,
    refetch,
  };
}

/** Full tournament view-model (events, groups, teams, players, matches, courts). */
export function useTournamentData(tournamentId: string | null | undefined) {
  const snap = useTournamentSnapshot(tournamentId);
  const vm = useMemo<TournamentVM | null>(() => {
    if (!snap.tournament) return null;
    return buildViewModel({
      tournament: snap.tournament,
      events: snap.events,
      groups: snap.groups,
      teams: snap.teams,
      matches: snap.matches,
      players: snap.players,
      participantIds: snap.participantIds,
      checkedInIds: snap.checkedInIds,
    });
  }, [snap.tournament, snap.events, snap.groups, snap.teams, snap.matches, snap.players, snap.participantIds, snap.checkedInIds]);
  return { vm, status: snap.status, error: snap.error, connected: snap.connected };
}

export interface StandingsEngine {
  tieBreakers: TieBreaker[];
  /** Standings for one event; `group` = 'A' | 'B' … or null for a single table */
  getStandings: (eventId: string, group: string | null) => StandingRow[];
  /** Name of the knockout stage the event feeds into (Bán kết, Chung kết…) */
  stageFor: (eventId: string) => string;
  knockoutFor: (eventId: string) => ReturnType<typeof knockoutTies>;
  /** Semis → Final / Bronze, with projected pairings before the semis exist */
  bracketFor: (eventId: string) => BracketVM | null;
  /** Gold / Silver / Bronze of an event */
  podiumFor: (eventId: string) => PodiumVM | null;
}

/** Standings calculated live from completed group matches, ordered by the tournament's tie-breaker rules. */
export function useStandingsEngine(tournamentId: string | null | undefined, overrideOrder?: TieBreaker[]): StandingsEngine {
  const { vm } = useTournamentData(tournamentId);
  const order = overrideOrder ?? vm?.rules.tieBreakers ?? ['wins', 'h2h', 'diff', 'pf'];
  return useMemo(() => {
    const cache = new Map<string, StandingRow[]>();
    const evOf = (id: string): EventVM | undefined => vm?.events.find((e) => e.id === id);
    return {
      tieBreakers: order,
      getStandings: (eventId, group) => {
        if (!vm) return [];
        const key = `${eventId}:${group ?? '*'}`;
        if (!cache.has(key)) cache.set(key, computeStandings(vm, eventId, group, order, vm.rules.pointsPerWin));
        return cache.get(key)!;
      },
      stageFor: (eventId) => {
        const ev = evOf(eventId);
        return ev ? stageName(qualifiersOf(ev.config)) : '';
      },
      knockoutFor: (eventId) => {
        const ev = evOf(eventId);
        return vm && ev ? knockoutTies(vm, ev, order) : [];
      },
      bracketFor: (eventId) => {
        const ev = evOf(eventId);
        return vm && ev ? bracketFor(vm, ev, order) : null;
      },
      podiumFor: (eventId) => {
        const ev = evOf(eventId);
        return vm && ev ? podiumFor(vm, ev, order) : null;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, order.join(',')]);
}

export const eventGroups = groupsOfEvent;

/** Tournament list for the selector (with realtime refresh). */
export function useTournaments() {
  const [list, setList] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const sb = getSupabase();
    let alive = true;
    const load = async () => {
      const { data } = await sb.from('tournaments').select('*').order('created_at', { ascending: false });
      if (alive) { setList((data ?? []) as TournamentRow[]); setLoading(false); }
    };
    void load();
    const ch = sb
      .channel('pm-tournament-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => { void load(); })
      .subscribe();
    return () => { alive = false; void sb.removeChannel(ch); };
  }, []);
  return { tournaments: list, loading };
}

/* ---------------------------- auth ---------------------------- */
/**
 * Google session + app role. The role comes from public.user_roles (by Gmail),
 * resolved server-side by the my_role() SQL function.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [role, setRole] = useState<AppRole>('viewer');
  const [loading, setLoading] = useState(true);

  const loadIdentity = useCallback(async (s: Session | null) => {
    const sb = getSupabase();
    if (!s) { setProfile(null); setRole('viewer'); return; }
    const [{ data: prof }, { data: r }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      sb.rpc('my_role'),
    ]);
    setProfile((prof as ProfileRow) ?? null);
    setRole(((r as string) || 'viewer') as AppRole);
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    let alive = true;
    sb.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
      if (!alive) return;
      setSession(data.session);
      await loadIdentity(data.session);
      if (alive) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, s: Session | null) => {
      setSession(s);
      void loadIdentity(s);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadIdentity]);

  const signInWithGoogle = useCallback(async () => {
    const sb = getSupabase();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const next = window.location.pathname + window.location.search;
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }, []);

  const signOut = useCallback(async () => { await getSupabase().auth.signOut(); }, []);
  const refreshRole = useCallback(() => loadIdentity(session), [loadIdentity, session]);

  return {
    session,
    profile,
    email: session?.user.email?.toLowerCase() ?? null,
    loading,
    role,
    isAdmin: role === 'admin',
    isOrganizer: role === 'admin' || role === 'organizer',
    isStaff: role === 'admin' || role === 'organizer' || role === 'scorekeeper',
    signInWithGoogle,
    signOut,
    refreshRole,
  };
}

export type AuthState = ReturnType<typeof useAuth>;
