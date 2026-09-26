'use client';

import { AlertTriangle, CheckCircle2, Loader2, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import AdminDashboard, { type GroupDraft } from '@/components/AdminDashboard';
import Navbar from '@/components/Navbar';
import PublicView from '@/components/PublicView';
import RulesModal from '@/components/RulesModal';
import ScorekeeperView from '@/components/ScorekeeperView';
import TVBroadcastView from '@/components/TVBroadcastView';
import { EmptyState } from '@/components/ui';
import { finalizeMatch, matchAction, updateRules } from '@/lib/client-actions';
import { isGameOver } from '@/lib/engine';
import { useAuth, useTournamentData, useTournaments } from '@/lib/supabase';
import type { AppMode, TournamentVM, UIState } from '@/lib/types';

const INITIAL_UI: UIState = {
  publicTab: 'live',
  tvView: 'live',
  viewerEvent: null,
  viewerGroup: 'all',
  viewerMatchTab: 'live',
  adminEvent: null,
  scoreMode: 'live',
  activeCourt: null,
  quickEvent: 'all',
  quickMatch: null,
  tvCycle: true,
  tvIdx: 0,
};

const MODES: AppMode[] = ['viewer', 'admin', 'score', 'tv'];
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export default function Home() {
  const auth = useAuth();
  const { tournaments, loading: listLoading } = useTournaments();
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [mode, setModeState] = useState<AppMode>('viewer');
  // UI state lives here so tabs, group filters and scoring mode survive switching views
  const [ui, setUiState] = useState<UIState>(INITIAL_UI);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupDraft>>({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const [demo, setDemo] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const setUi = useCallback((patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) => {
    setUiState((u) => ({ ...u, ...(typeof patch === 'function' ? patch(u) : patch) }));
  }, []);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToastMsg({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), kind === 'error' ? 4200 : 2800);
  }, []);

  const setMode = (m: AppMode) => {
    setModeState(m);
    safeSet('pm-mode', m);
    window.scrollTo({ top: 0 });
  };

  // Restore mode: ?mode= (links from /admin, /members) → last used
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('mode') as AppMode | null;
    const m = q ?? (safeGet('pm-mode') as AppMode | null);
    if (m && MODES.includes(m)) setModeState(m);
    if (q) {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  // Guests (no staff role) only ever see the public page
  const effectiveMode: AppMode = auth.isStaff ? mode : 'viewer';

  // Pick tournament: ?t= → last viewed → newest
  useEffect(() => {
    if (tournamentId || !tournaments.length) return;
    const fromUrl = new URLSearchParams(window.location.search).get('t');
    const saved = safeGet('pm-tournament');
    const pick = [fromUrl, saved].find((x) => x && tournaments.some((t) => t.id === x)) ?? tournaments[0].id;
    setTournamentId(pick);
  }, [tournaments, tournamentId]);

  const selectTournament = (id: string) => {
    setTournamentId(id);
    safeSet('pm-tournament', id);
    const url = new URL(window.location.href);
    url.searchParams.set('t', id);
    window.history.replaceState(null, '', url.toString());
    setUiState((u) => ({ ...u, publicTab: 'live', viewerEvent: null, viewerGroup: 'all', adminEvent: null, quickMatch: null, quickEvent: 'all', activeCourt: null, tvIdx: 0, tvView: 'live' }));
    setGroupDrafts({});
  };

  const { vm, status, error, connected } = useTournamentData(tournamentId);

  // Demo mode (staff only, NEXT_PUBLIC_ENABLE_DEMO=true): side-out scoring through the real RPCs
  const vmRef = useRef<TournamentVM | null>(vm);
  vmRef.current = vm;
  useEffect(() => {
    if (!demo || !auth.isStaff) return undefined;
    const t = setInterval(async () => {
      const cur = vmRef.current;
      if (!cur) return;
      const live = cur.courts.filter((c) => c.matchId);
      if (!live.length) return;
      const court = live[Math.floor(Math.random() * live.length)];
      const m = cur.matches.find((x) => x.id === court.matchId);
      if (!m) return;
      const ev = cur.events.find((e) => e.id === m.eventId);
      try {
        if (isGameOver(m.sa, m.sb, cur.rules)) await finalizeMatch(cur.tournament.id, m.id, m.sa, m.sb);
        else {
          const r = Math.random();
          if (r < 0.3) await matchAction(cur.tournament.id, m.id, 'side_out');
          else if (r < 0.4 && !ev?.singles) await matchAction(cur.tournament.id, m.id, 'toggle_server');
          else await matchAction(cur.tournament.id, m.id, m.serving === 'A' ? 'point_a' : 'point_b');
        }
      } catch {
        /* ignore demo races */
      }
    }, 1400);
    return () => clearInterval(t);
  }, [demo, auth.isStaff]);

  const liveCount = vm?.matches.filter((m) => m.status === 'live').length ?? 0;

  let content: ReactNode;
  if (listLoading || (tournamentId && status !== 'ready' && status !== 'error' && !vm)) {
    content = (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải giải đấu…
      </div>
    );
  } else if (status === 'error' && !vm) {
    content = (
      <EmptyState icon={AlertTriangle} title="Không tải được dữ liệu">
        <p>{error}</p>
      </EmptyState>
    );
  } else if (!vm) {
    content = effectiveMode === 'admin' ? (
      <AdminDashboard vm={null} auth={auth} ui={ui} setUi={setUi} openRules={() => setRulesOpen(true)} toast={toast} groupDrafts={groupDrafts} setGroupDrafts={setGroupDrafts} onSelectTournament={selectTournament} />
    ) : (
      <EmptyState icon={Trophy} title="Chưa có giải đấu nào">
        <p>Ban tổ chức đăng nhập và vào tab “Ban tổ chức” để tạo giải đầu tiên.</p>
      </EmptyState>
    );
  } else if (effectiveMode === 'viewer') {
    content = <PublicView vm={vm} tournaments={tournaments} onSelectTournament={selectTournament} ui={ui} setUi={setUi} openRules={() => setRulesOpen(true)} />;
  } else if (effectiveMode === 'admin') {
    content = <AdminDashboard vm={vm} auth={auth} ui={ui} setUi={setUi} openRules={() => setRulesOpen(true)} toast={toast} groupDrafts={groupDrafts} setGroupDrafts={setGroupDrafts} onSelectTournament={selectTournament} />;
  } else if (effectiveMode === 'score') {
    content = <ScorekeeperView vm={vm} auth={auth} ui={ui} setUi={setUi} toast={toast} />;
  } else {
    content = <TVBroadcastView vm={vm} ui={ui} setUi={setUi} demo={demo} setDemo={auth.isStaff ? setDemo : undefined} />;
  }

  return (
    <div className="pm-root min-h-screen bg-[#0B0F17] text-slate-200">
      <Navbar mode={effectiveMode} setMode={setMode} liveCount={liveCount} auth={auth} demo={demo} setDemo={setDemo} connected={connected || !vm} />

      <main className={`mx-auto max-w-7xl px-4 pt-4 md:pb-10 md:pt-6 ${auth.isStaff ? 'pb-28' : 'pb-12'}`}>{content}</main>

      {vm && (
        <RulesModal
          open={rulesOpen}
          onClose={() => setRulesOpen(false)}
          rules={vm.rules}
          canEdit={auth.isOrganizer}
          onSave={async (patch) => {
            try {
              await updateRules(vm.tournament, patch);
              toast('Đã lưu luật thi đấu');
            } catch (e) {
              toast((e as Error).message, 'error');
              throw e;
            }
          }}
        />
      )}

      {toastMsg && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-2 rounded-xl border bg-[#111827] px-4 py-3 text-sm font-semibold text-white shadow-2xl md:bottom-6 ${toastMsg.kind === 'error' ? 'border-rose-500/60' : 'border-[#A3E635]/50'}`}
        >
          {toastMsg.kind === 'error'
            ? <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            : <CheckCircle2 className="h-4 w-4 shrink-0 text-[#A3E635]" />}
          {toastMsg.msg}
        </div>
      )}
    </div>
  );
}
