'use client';

import { LogIn, LogOut, Pause, Play, Settings, Smartphone, Trophy, Tv, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmtClock } from '@/lib/engine';
import type { AuthState } from '@/lib/supabase';
import type { AppMode } from '@/lib/types';

export const MODES: { id: AppMode; label: string; short: string; icon: typeof Trophy }[] = [
  { id: 'viewer', label: 'Xem giải đấu', short: 'Xem giải', icon: Trophy },
  { id: 'admin', label: 'Ban tổ chức', short: 'BTC', icon: Settings },
  { id: 'score', label: 'Nhập điểm', short: 'Nhập điểm', icon: Smartphone },
  { id: 'tv', label: 'TV Broadcast', short: 'TV', icon: Tv },
];

const ROLE_LABEL = { viewer: 'Khán giả', scorekeeper: 'Trọng tài', organizer: 'BTC' } as const;

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
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

export default function Navbar({
  mode, setMode, liveCount, auth, demo, setDemo, connected,
}: {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  liveCount: number;
  auth: AuthState;
  demo?: boolean;
  setDemo?: (v: boolean) => void;
  connected: boolean;
}) {
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const demoAllowed = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && auth.isStaff && setDemo;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#374151]/70 bg-[#0B0F17]/90 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#A3E635] shadow-[0_0_24px_rgba(163,230,53,.35)]">
              <Zap className="h-5 w-5 text-[#0B0F17]" strokeWidth={3} />
            </span>
            <div className="min-w-0 leading-none">
              <div className="truncate pm-display text-lg font-extrabold uppercase italic text-white sm:text-xl">PickleMasters <span className="text-[#A3E635]">Live</span></div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-red-500 pm-pulse' : 'bg-slate-600'}`} />
                {connected ? `${liveCount} sân live` : 'Đang kết nối…'} · <span className="pm-num">{now ? fmtClock(now) : '--:--:--'}</span>
              </div>
            </div>
          </div>

          <nav className="ml-auto hidden md:block" aria-label="Chế độ">
            <div className="flex gap-1 rounded-xl border border-[#374151] bg-[#111827] p-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-current={mode === m.id ? 'page' : undefined}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 pm-display text-sm font-bold uppercase transition ${mode === m.id ? 'bg-[#A3E635] text-[#0B0F17]' : 'text-slate-400 hover:bg-[#1F2937] hover:text-white'}`}
                >
                  <m.icon className="h-4 w-4" /> {m.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            {demoAllowed && (
              <button
                type="button"
                onClick={() => setDemo!(!demo)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${demo ? 'border-[#A3E635] text-[#A3E635]' : 'border-[#374151] text-slate-400'}`}
                title="Tự động cộng điểm để xem cập nhật realtime"
              >
                {demo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Demo
              </button>
            )}

            {auth.session ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu(!menu)}
                  className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[#374151] bg-[#111827] py-1 pl-1 pr-2.5"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                >
                  {auth.profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={auth.profile.avatar_url} alt="" className="h-8 w-8 rounded-md object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1F2937] pm-display text-sm font-bold text-[#A3E635]">
                      {(auth.profile?.full_name || 'U').slice(0, 1)}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 pm-display text-[10px] font-bold uppercase ${auth.isOrganizer ? 'bg-[#A3E635] text-[#0B0F17]' : auth.isStaff ? 'bg-[#06B6D4] text-[#0B0F17]' : 'bg-[#1F2937] text-slate-400'}`}>
                    {ROLE_LABEL[auth.role]}
                  </span>
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-[#374151] bg-[#111827] p-2 shadow-2xl">
                    <p className="truncate px-2 py-1.5 text-sm font-semibold text-white">{auth.profile?.full_name ?? auth.session.user.email}</p>
                    <p className="truncate px-2 pb-2 text-xs text-slate-500">{auth.session.user.email}</p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenu(false); void auth.signOut(); }}
                      className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 text-sm text-slate-300 hover:bg-[#1F2937]"
                    >
                      <LogOut className="h-4 w-4" /> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void auth.signInWithGoogle()}
                disabled={auth.loading}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-[#0B0F17] disabled:opacity-50"
              >
                <GoogleG /> <span className="hidden sm:inline">Đăng nhập Google</span><LogIn className="h-4 w-4 sm:hidden" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation — thumb zone */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#374151] bg-[#0B0F17]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Chế độ"
      >
        <div className="grid grid-cols-4">
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-current={on ? 'page' : undefined} className="relative flex min-h-[62px] flex-col items-center justify-center gap-1">
                {on && <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-[#A3E635]" />}
                <m.icon className={`h-5 w-5 ${on ? 'text-[#A3E635]' : 'text-slate-500'}`} />
                <span className={`pm-display text-[12px] font-bold uppercase ${on ? 'text-white' : 'text-slate-500'}`}>{m.short}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
