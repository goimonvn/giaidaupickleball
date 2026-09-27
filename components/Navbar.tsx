'use client';

import {
  Activity, BarChart3, Check, ChevronDown, ChevronRight, LogIn, LogOut, Pause, Play, Smartphone, Trophy, Tv, User,
  UserCog, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { fmtDateVN, STATUS_TAG, statusTagOf } from '@/lib/engine';
import type { AuthState } from '@/lib/supabase';
import type { AppScreen, PublicTab, TournamentRow } from '@/lib/types';
import { T2, T3, T4 } from './kit';

/* =====================================================================
   Header + navigation (approved v4 demo)
   · Header: tournament selector · 📺 TV (/tv/[id]) · avatar menu
   · Staff: Facebook-style bottom nav (icon + label, 52px), no TV / Giải đấu tabs
   · Guests: the same auto-hiding bottom nav with the 3 public tabs
   · Header and bottom nav hide on scroll down, show on scroll up (15px threshold)
   ===================================================================== */

interface NavItem<T extends AppScreen = AppScreen> {
  id: T;
  label: string;
  /** Label on narrow phones */
  short?: string;
  icon: LucideIcon;
}

export const PUBLIC_TABS: NavItem<PublicTab>[] = [
  { id: 'matches', label: 'Trận Đấu', icon: Activity },
  { id: 'table', label: 'Xếp Hạng & Nhánh', short: 'Xếp Hạng', icon: BarChart3 },
  { id: 'podium', label: 'Vinh Danh', icon: Trophy },
];
const BTC_TAB: NavItem = { id: 'btc', label: 'BTC', icon: Wrench };
const REFEREE_TAB: NavItem = { id: 'referee', label: 'Trọng Tài', icon: Smartphone };

/**
 * Bottom-nav tabs for a role (auto-hiding, same bar for everyone):
 *   Khách:     Trận Đấu · Xếp Hạng · Vinh Danh
 *   Trọng tài: Trận Đấu · Xếp Hạng · Vinh Danh · Trọng Tài
 *   BTC/Admin: Trận Đấu · Xếp Hạng · BTC · Trọng Tài   (no Vinh Danh)
 */
export function navItemsFor(auth: Pick<AuthState, 'isStaff' | 'isOrganizer'>): NavItem[] {
  if (auth.isOrganizer) return [...PUBLIC_TABS.filter((t) => t.id !== 'podium'), BTC_TAB, REFEREE_TAB];
  if (auth.isStaff) return [...PUBLIC_TABS, REFEREE_TAB];
  return PUBLIC_TABS;
}

const ROLE_TAG = { viewer: 'KHÁCH', scorekeeper: 'TRỌNG TÀI', organizer: 'BTC', admin: 'ADMIN' } as const;

/* ---------------------------- tournament selector ---------------------------- */
function TournamentSelector({
  tournaments, current, onSelect, liveCount, connected, onManage,
}: {
  tournaments: TournamentRow[];
  current: TournamentRow | null;
  onSelect: (id: string) => void;
  liveCount: number;
  connected: boolean;
  onManage?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, open, close);
  const tag = current ? STATUS_TAG[statusTagOf(current)] : null;

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={!tournaments.length}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={`${T2} block truncate text-white`}>{current?.title ?? 'PickleMasters Live'}</span>
          <span className={`${T4} flex items-center gap-1.5 text-slate-500`}>
            {tag && <span className={`whitespace-nowrap rounded px-1 ${tag.cls}`}>{tag.label}</span>}
            {!connected ? <span className="whitespace-nowrap">Đang kết nối…</span> : liveCount > 0 && <span className="whitespace-nowrap text-[#84CC16]">● {liveCount} sân live</span>}
          </span>
        </span>
        {tournaments.length > 1 && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div role="listbox" aria-label="Chọn giải đấu" className="pm-sheet absolute left-0 top-12 z-50 max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
          {tournaments.map((t) => {
            const on = t.id === current?.id;
            const st = STATUS_TAG[statusTagOf(t)];
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => { setOpen(false); onSelect(t.id); }}
                className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left ${on ? 'bg-white/[0.07]' : 'hover:bg-white/5'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`${T3} block truncate text-white`}>{t.title}</span>
                  <span className={`${T4} flex items-center gap-1.5 text-slate-500`}>
                    <span className={`rounded px-1 ${st.cls}`}>{st.label}</span>{fmtDateVN(t.starts_at)}
                  </span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-slate-300" />}
              </button>
            );
          })}
          {onManage && (
            <>
              <div className="my-1 h-px bg-white/5" />
              <button type="button" onClick={() => { setOpen(false); onManage(); }} className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 ${T3} text-slate-300 hover:bg-white/5`}>
                <Trophy className="h-4 w-4" /> <span className="flex-1 text-left">Quản lý giải đấu</span> <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- avatar menu ---------------------------- */
function AvatarMenu({
  auth, onOpenProfile, onOpenTournaments, onOpenChange, demo, setDemo,
}: {
  auth: AuthState;
  onOpenProfile: () => void;
  onOpenTournaments: () => void;
  onOpenChange: (open: boolean) => void;
  demo?: boolean;
  setDemo?: (v: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setOpen = useCallback((v: boolean) => { setOpenState(v); onOpenChange(v); }, [onOpenChange]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useClickOutside(ref, open, close);
  // If the menu unmounts while open (e.g. signed out elsewhere), re-enable header auto-hide
  useEffect(() => () => onOpenChange(false), [onOpenChange]);

  const name = auth.profile?.full_name || auth.email || 'Tài khoản';
  const demoAllowed = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && auth.isStaff && setDemo;
  const itemCls = `flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-left ${T3}`;
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu tài khoản"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-full border border-white/10 py-0.5 pl-0.5 pr-2.5 hover:bg-white/5"
      >
        {auth.profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={auth.profile.avatar_url} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 ${T2} text-slate-950`}>{name.slice(0, 1).toUpperCase()}</span>
        )}
        <span className={`${T4} hidden text-slate-300 min-[380px]:inline`}>{ROLE_TAG[auth.role]}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="pm-sheet absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
          <div className="px-3 py-2">
            <p className={`${T2} truncate text-white`}>{name}</p>
            <p className={`${T4} truncate text-slate-500`}>{auth.email}</p>
          </div>
          {!auth.isStaff && (
            <p className={`mx-2 mb-1 rounded-lg bg-slate-950 p-2 ${T4} text-slate-400`}>Gmail này chưa được cấp quyền BTC / Trọng tài. Hãy nhờ Admin thêm bạn.</p>
          )}
          <button type="button" role="menuitem" onClick={pick(onOpenProfile)} className={`${itemCls} text-slate-300 hover:bg-white/5`}>
            <User className="h-4 w-4" /> {auth.isAdmin ? 'Hồ sơ Admin' : 'Hồ sơ'}
          </button>
          {auth.isOrganizer && (
            <button type="button" role="menuitem" onClick={pick(onOpenTournaments)} className={`${itemCls} bg-white/[0.07] text-white`}>
              <Trophy className="h-4 w-4" /> <span className="flex-1">Quản lý giải đấu</span> <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
          )}
          {auth.isOrganizer && (
            <Link href="/members" role="menuitem" onClick={() => setOpen(false)} className={`${itemCls} text-slate-300 hover:bg-white/5`}>
              <Users className="h-4 w-4" /> Quản lý Thành viên
            </Link>
          )}
          {auth.isAdmin && (
            <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className={`${itemCls} text-slate-300 hover:bg-white/5`}>
              <UserCog className="h-4 w-4" /> Phân quyền Gmail
            </Link>
          )}
          {demoAllowed && (
            <button type="button" role="menuitem" onClick={pick(() => setDemo!(!demo))} className={`${itemCls} text-slate-300 hover:bg-white/5`}>
              {demo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {demo ? 'Tắt Demo tự bấm điểm' : 'Bật Demo tự bấm điểm'}
            </button>
          )}
          <div className="my-1 h-px bg-white/5" />
          <button type="button" role="menuitem" onClick={pick(() => void auth.signOut())} className={`${itemCls} text-rose-300 hover:bg-rose-500/10`}>
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- bottom nav ---------------------------- */
function BottomNav({ items, active, hidden, onGo }: { items: NavItem[]; active: AppScreen; hidden: boolean; onGo: (s: AppScreen) => void }) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-slate-950/95 backdrop-blur transition-transform duration-300 will-change-transform ${hidden ? 'translate-y-full' : 'translate-y-0'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto grid h-[52px] max-w-3xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((n) => {
          const on = active === n.id;
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onGo(n.id)}
              aria-current={on ? 'page' : undefined}
              className="group relative flex flex-col items-center justify-center gap-0.5 px-1"
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition duration-200 ${on ? 'bg-[#84CC16]/15 shadow-[0_0_16px_rgba(132,204,22,.35)]' : 'group-hover:bg-white/5'}`}>
                <Icon className={`h-5 w-5 transition duration-200 ${on ? 'scale-110 text-[#84CC16]' : 'text-slate-400 group-hover:text-slate-200'}`} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
              </span>
              <span className={`${T4} max-w-full truncate ${on ? 'text-white' : 'text-slate-400'}`}>
                <span className="sm:hidden">{n.short ?? n.label}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* ---------------------------- Navbar ---------------------------- */
export default function Navbar({
  auth, tournaments = [], current = null, onSelectTournament, screen, onNavigate, onOpenProfile,
  liveCount = 0, connected = true, demo, setDemo,
}: {
  auth: AuthState;
  tournaments?: TournamentRow[];
  current?: TournamentRow | null;
  onSelectTournament?: (id: string) => void;
  /** Active screen (main page). Omit on /admin and /members. */
  screen?: AppScreen;
  /** Navigate inside the main page. Omitted → links to /?screen=… */
  onNavigate?: (s: AppScreen) => void;
  onOpenProfile?: () => void;
  liveCount?: number;
  connected?: boolean;
  demo?: boolean;
  setDemo?: (v: boolean) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const hidden = useScrollDirection({ threshold: 15, disabled: menuOpen });
  const items = navItemsFor(auth);

  const go = (s: AppScreen) => {
    if (onNavigate) onNavigate(s);
    else router.push(s === 'matches' ? '/' : `/?screen=${s}`);
  };
  const openProfile = onOpenProfile ?? (() => router.push('/?screen=matches&profile=1'));

  return (
    <>
      <header
        className={`sticky z-40 border-b border-white/5 bg-slate-950/90 backdrop-blur transition-transform duration-300 will-change-transform ${hidden ? '-translate-y-full' : 'translate-y-0'}`}
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/" onClick={onNavigate ? () => onNavigate('matches') : undefined} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Zap className="h-4 w-4 text-white" aria-hidden="true" />
            <span className="sr-only">PickleMasters Live</span>
          </Link>

          {onSelectTournament ? (
            <TournamentSelector
              tournaments={tournaments}
              current={current}
              onSelect={onSelectTournament}
              liveCount={liveCount}
              connected={connected}
              onManage={auth.isOrganizer ? () => go('tournaments') : undefined}
            />
          ) : (
            <span className={`${T2} min-w-0 flex-1 truncate text-white`}>PickleMasters Live</span>
          )}

          {current && (
            <a
              href={`/tv/${current.id}${current.status === 'completed' ? '?view=podium' : ''}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Mở chế độ TV trong tab mới"
              title="Chế độ TV (màn hình 16:9)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:bg-white/5"
            >
              <Tv className="h-4 w-4" />
            </a>
          )}

          {auth.session ? (
            <AvatarMenu
              auth={auth}
              onOpenProfile={openProfile}
              onOpenTournaments={() => go('tournaments')}
              onOpenChange={setMenuOpen}
              demo={demo}
              setDemo={setDemo}
            />
          ) : (
            <button
              type="button"
              onClick={() => void auth.signInWithGoogle()}
              disabled={auth.loading}
              title="Dành cho Ban tổ chức / Trọng tài"
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-white/10 px-3 ${T3} text-slate-300 hover:bg-white/5 disabled:opacity-50`}
            >
              <GoogleG /> <span className="hidden sm:inline">Đăng nhập</span><LogIn className="h-4 w-4 sm:hidden" />
            </button>
          )}
        </div>

      </header>

      {screen && !auth.loading && <BottomNav items={items} active={screen} hidden={hidden} onGo={go} />}
    </>
  );
}
