'use client';

import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import AdminDashboard from '@/components/AdminDashboard';
import { Empty, Sheet, T1, T2, T3, T4 } from '@/components/kit';
import Navbar from '@/components/Navbar';
import PublicView from '@/components/PublicView';
import ScorekeeperView from '@/components/ScorekeeperView';
import TournamentManager from '@/components/TournamentManager';
import { finalizeMatch, matchAction } from '@/lib/client-actions';
import { isGameOver } from '@/lib/engine';
import { useAutoKnockout } from '@/hooks/useAutoKnockout';
import { useAuth, useTournamentData, useTournaments, type AuthState } from '@/lib/supabase';
import type { AppScreen, BtcDraft, PublicTab, TournamentVM, UIState } from '@/lib/types';

const INITIAL_UI: UIState = {
  tvView: 'live',
  viewerEvent: null,
  viewerGroup: 'all',
  adminEvent: null,
  scoreMode: 'live',
  activeCourt: null,
  quickEvent: 'all',
  quickMatch: null,
  tvCycle: true,
  tvIdx: 0,
};

const SCREENS: AppScreen[] = ['matches', 'table', 'podium', 'btc', 'referee', 'tournaments'];
const PUBLIC: PublicTab[] = ['matches', 'table', 'podium'];
const ROLE_LABEL = { viewer: 'Khách', scorekeeper: 'Trọng Tài', organizer: 'Ban Tổ Chức', admin: 'Admin' } as const;

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Guests only see the public tabs; scorekeepers add Trọng Tài; organizers get BTC + Trọng Tài but no Vinh Danh. */
function allowedScreen(s: AppScreen, auth: Pick<AuthState, 'isStaff' | 'isOrganizer'>): AppScreen {
  // BTC/Admin have no Vinh Danh tab
  if (s === 'podium') return auth.isOrganizer ? 'matches' : s;
  if (PUBLIC.includes(s as PublicTab)) return s;
  if (s === 'referee') return auth.isStaff ? s : 'matches';
  return auth.isOrganizer ? s : 'matches';
}

function ProfileSheet({ auth, tournaments, onClose }: { auth: AuthState; tournaments: number; onClose: () => void }) {
  const name = auth.profile?.full_name || auth.email || 'Tài khoản';
  return (
    <Sheet title={auth.isAdmin ? 'Hồ sơ Admin' : 'Hồ sơ'} onClose={onClose}>
      <div className="flex items-center gap-3">
        {auth.profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={auth.profile.avatar_url} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 ${T1} text-slate-950`}>{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <p className={`${T2} truncate text-white`}>{name}</p>
          <p className={`${T3} truncate text-slate-400`}>{auth.email}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {[['Vai trò', ROLE_LABEL[auth.role]], ['Giải đấu', String(tournaments)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-white/5 bg-slate-950 p-3">
            <dt className={`${T4} text-slate-500`}>{k}</dt>
            <dd className={`${T1} text-white`}>{v}</dd>
          </div>
        ))}
      </dl>
      {!auth.isStaff && <p className={`${T3} mt-3 text-slate-400`}>Gmail này chưa được cấp quyền. Nhờ Admin thêm bạn ở trang Phân quyền Gmail.</p>}
    </Sheet>
  );
}

export default function Home() {
  const auth = useAuth();
  const { tournaments, loading: listLoading } = useTournaments();
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<AppScreen>('matches');
  const [ui, setUiState] = useState<UIState>(INITIAL_UI);
  const [drafts, setDraftsState] = useState<Record<string, BtcDraft>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [demo, setDemo] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const setUi = useCallback((patch: Partial<UIState>) => setUiState((u) => ({ ...u, ...patch })), []);
  const setDrafts = useCallback((fn: (d: Record<string, BtcDraft>) => Record<string, BtcDraft>) => setDraftsState(fn), []);
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToastMsg({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), kind === 'error' ? 4200 : 2800);
  }, []);

  const screen = allowedScreen(screenState, auth);
  const staff = auth.isStaff;

  const navigate = useCallback((s: AppScreen) => {
    setScreenState(s);
    safeSet('pm-screen', s);
    window.scrollTo({ top: 0 });
  }, []);

  // Restore screen: ?screen= (links from /admin, /members) → last used. ?profile=1 opens the profile sheet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('screen') as AppScreen | null;
    const s = q ?? (safeGet('pm-screen') as AppScreen | null);
    if (s && SCREENS.includes(s)) setScreenState(s);
    if (params.get('profile') === '1') setProfileOpen(true);
    if (q || params.has('profile')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('screen');
      url.searchParams.delete('profile');
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  // A tournament just created is selected before the realtime list contains it — don't re-pick it away
  const pendingId = useRef<string | null>(null);

  // Pick tournament: ?t= → last viewed → newest. Re-pick if the open one was deleted.
  useEffect(() => {
    if (listLoading) return;
    if (tournamentId && tournaments.some((t) => t.id === tournamentId)) {
      if (pendingId.current === tournamentId) pendingId.current = null;
      return;
    }
    if (tournamentId && pendingId.current === tournamentId) return;
    const fromUrl = new URLSearchParams(window.location.search).get('t');
    const saved = safeGet('pm-tournament');
    const pick = [fromUrl, saved].find((x) => x && tournaments.some((t) => t.id === x)) ?? tournaments[0]?.id ?? null;
    setTournamentId(pick);
  }, [tournaments, tournamentId, listLoading]);

  const selectTournament = useCallback((id: string, isNew = false) => {
    if (isNew) pendingId.current = id;
    setTournamentId(id);
    safeSet('pm-tournament', id);
    const url = new URL(window.location.href);
    url.searchParams.set('t', id);
    window.history.replaceState(null, '', url.toString());
    setUiState((u) => ({ ...u, viewerEvent: null, viewerGroup: 'all', adminEvent: null, quickMatch: null, quickEvent: 'all', activeCourt: null }));
    setDraftsState({});
  }, []);

  const { vm, status, error, connected } = useTournamentData(tournamentId);
  const current = tournaments.find((t) => t.id === tournamentId) ?? vm?.tournament ?? null;
  // Group stage finished → create the first knockout stage automatically (any staff device)
  useAutoKnockout(vm, auth.isStaff, toast);

  // Guests opening a finished tournament land on Vinh Danh once
  const podiumShown = useRef<string | null>(null);
  useEffect(() => {
    if (!vm?.locked || auth.loading || staff || podiumShown.current === vm.tournament.id) return;
    podiumShown.current = vm.tournament.id;
    setScreenState('podium');
  }, [vm?.locked, vm?.tournament.id, staff, auth.loading]);

  // Demo mode (staff only, NEXT_PUBLIC_ENABLE_DEMO=true): side-out scoring through the real RPCs
  const vmRef = useRef<TournamentVM | null>(vm);
  vmRef.current = vm;
  useEffect(() => {
    if (!demo || !staff) return undefined;
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
  }, [demo, staff]);

  const liveCount = vm?.courts.filter((c) => c.matchId).length ?? 0;

  let content: ReactNode;
  if (screen === 'tournaments') {
    content = (
      <TournamentManager
        tournaments={tournaments}
        activeId={tournamentId}
        auth={auth}
        toast={toast}
        onOpen={(id, goBtc) => { selectTournament(id, goBtc); navigate(goBtc ? 'btc' : 'matches'); }}
      />
    );
  } else if (listLoading || (tournamentId && !vm && status !== 'error')) {
    content = (
      <div className={`flex items-center justify-center gap-2 py-24 ${T3} text-slate-500`}>
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải giải đấu…
      </div>
    );
  } else if (status === 'error' && !vm) {
    content = (
      <Empty>
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-300" />
        Không tải được dữ liệu. {error}
      </Empty>
    );
  } else if (screen === 'btc') {
    content = <AdminDashboard vm={vm} auth={auth} ui={ui} setUi={setUi} toast={toast} drafts={drafts} setDrafts={setDrafts} onOpenTournaments={() => navigate('tournaments')} />;
  } else if (!vm) {
    content = <Empty>Chưa có giải đấu nào. {auth.isOrganizer ? 'Mở menu avatar → Quản lý giải đấu để tạo giải đầu tiên.' : 'Ban tổ chức sẽ cập nhật sớm.'}</Empty>;
  } else if (screen === 'referee') {
    content = <ScorekeeperView vm={vm} auth={auth} ui={ui} setUi={setUi} toast={toast} />;
  } else {
    content = <PublicView vm={vm} tab={screen as PublicTab} ui={ui} setUi={setUi} />;
  }

  return (
    <div className="pm-root min-h-screen bg-slate-950 text-slate-200">
      <Navbar
        auth={auth}
        tournaments={tournaments}
        current={current}
        onSelectTournament={(id) => selectTournament(id)}
        screen={screen}
        onNavigate={navigate}
        onOpenProfile={() => setProfileOpen(true)}
        liveCount={liveCount}
        connected={connected || !vm}
        demo={demo}
        setDemo={setDemo}
      />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">{content}</main>

      {profileOpen && auth.session && <ProfileSheet auth={auth} tournaments={tournaments.length} onClose={() => setProfileOpen(false)} />}

      {toastMsg && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-20 z-[80] mx-auto flex max-w-sm items-center gap-2 rounded-xl border bg-slate-900 px-4 py-3 ${T3} text-white shadow-2xl ${toastMsg.kind === 'error' ? 'border-rose-500/40' : 'border-white/10'}`}
        >
          {toastMsg.kind === 'error' ? <X className="h-4 w-4 shrink-0 text-rose-300" /> : <Check className="h-4 w-4 shrink-0 text-slate-300" />}
          {toastMsg.msg}
        </div>
      )}
    </div>
  );
}
