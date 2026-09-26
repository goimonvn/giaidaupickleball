'use client';

import { Crown, ExternalLink, Maximize, Pause, Play, Radio, RefreshCw, Trophy, Tv, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fmtClock, groupsOfEvent, MATCH_TYPE_LABEL, MATCH_TYPE_SHORT, qualifiersOf, scoreCall, stageName, teamName } from '@/lib/engine';
import { useStandingsEngine } from '@/lib/supabase';
import type { CourtVM, PodiumVM, TournamentVM, UIState } from '@/lib/types';
import PodiumView from './PodiumView';
import { CompactStandings } from './Standings';
import { CYAN, LIME, LiveBadge, ServeBall } from './ui';

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function TVCourt({ court, vm }: { court: CourtVM; vm: TournamentVM }) {
  const match = vm.matches.find((m) => m.id === court.matchId);
  if (!match) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-[0.8cqw] border border-[#374151] bg-[#111827] pm-display text-[length:2cqw] font-bold uppercase text-slate-500">
        {court.name} · Nghỉ
      </div>
    );
  }
  const ev = vm.events.find((e) => e.id === match.eventId);
  const singles = !!ev?.singles;
  const rows = [['A', match.a, match.sa, LIME], ['B', match.b, match.sb, CYAN]] as const;
  const stageLabel = match.type === 'group' ? `${match.group ? ` · Bảng ${match.group}` : ''} · Lượt ${match.round}` : ` · ${MATCH_TYPE_LABEL[match.type]}`;
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden rounded-[0.8cqw] border border-[#374151] bg-gradient-to-br from-[#1F2937] to-[#111827]">
      <div className="flex items-center justify-between bg-[#0B0F17]/70 px-[1.2cqw] py-[0.6cqw]">
        <div className="flex items-center gap-[0.8cqw]">
          <span className="pm-display text-[length:2.1cqw] font-extrabold uppercase italic text-white">{court.name}</span>
          <span className="rounded-[0.3cqw] bg-[#06B6D4]/20 px-[0.6cqw] py-[0.15cqw] pm-display text-[length:1.05cqw] font-bold uppercase text-[#06B6D4]">
            {ev?.label}{stageLabel}
          </span>
        </div>
        <div className="flex items-center gap-[1cqw]">
          <span className="pm-num text-[length:1.3cqw] text-[#F59E0B]">{scoreCall(match, singles)}</span>
          <LiveBadge size="lg" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-[0.4cqw] px-[1.2cqw] py-[0.6cqw]">
        {rows.map(([k, tid, score, accent]) => {
          const t = vm.teams.find((x) => x.id === tid);
          const serving = match.serving === k;
          const lead = score > (k === 'A' ? match.sb : match.sa);
          return (
            <div key={k} className="flex items-center gap-[1cqw]">
              <span className="h-[3.6cqw] w-[0.45cqw] rounded-full" style={{ background: accent }} />
              <div className="min-w-0 flex-1">
                <div className={`truncate pm-display text-[length:2.3cqw] font-bold uppercase leading-tight ${lead ? 'text-white' : 'text-slate-300'}`}>{teamName(t, vm.players)}</div>
                <div className="flex h-[1.5cqw] items-center gap-[0.5cqw] text-[length:1cqw] text-slate-400">
                  {serving && <><ServeBall className="h-[1cqw] w-[1cqw]" /><span className="font-semibold text-[#A3E635]">{singles ? 'GIAO BÓNG' : `GIAO BÓNG · NGƯỜI ${match.server}`}</span></>}
                </div>
              </div>
              <span
                key={score}
                className={`pm-num pm-pop flex h-[5cqw] min-w-[6cqw] items-center justify-center rounded-[0.5cqw] px-[0.6cqw] text-[length:4.2cqw] font-extrabold leading-none ${lead ? 'bg-[#A3E635] text-[#0B0F17]' : 'bg-[#0B0F17] text-white'}`}
              >
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TVBroadcastView({
  vm, ui, setUi, demo, setDemo, standalone = false,
}: {
  vm: TournamentVM;
  ui: Pick<UIState, 'tvCycle' | 'tvIdx' | 'tvView'>;
  setUi: (patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) => void;
  demo?: boolean;
  setDemo?: (v: boolean) => void;
  /** true on /tv/[id]: frame fills the whole screen, no control bar */
  standalone?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const engine = useStandingsEngine(vm.tournament.id);

  const views = vm.events.flatMap((e) => groupsOfEvent(e).map((g) => ({ ev: e, group: g })));
  const idx = views.length ? ui.tvIdx % views.length : 0;
  useEffect(() => {
    if (!ui.tvCycle) return undefined;
    const t = setInterval(() => setUi((u) => ({ tvIdx: (u.tvIdx + 1) % 1000 })), 7000);
    return () => clearInterval(t);
  }, [ui.tvCycle, setUi]);

  const view = views[idx];
  const podiumMode = ui.tvView === 'podium';
  const podiums = vm.events.map((e) => engine.podiumFor(e.id)).filter((p): p is PodiumVM => !!p && p.entries.length > 0);
  const podium = podiums.length ? podiums[ui.tvIdx % podiums.length] : undefined;
  const rows = view ? engine.getStandings(view.ev.id, view.group) : [];
  const nextUp = vm.matches.filter((m) => m.status === 'upcoming').slice(0, 3);
  const lastDone = vm.matches.filter((m) => m.status === 'completed').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(-4).reverse();
  const tn = (id: string, short?: boolean) => teamName(vm.teams.find((t) => t.id === id), vm.players, short);
  const evLabel = (id: string) => vm.events.find((e) => e.id === id);

  const goFull = () => {
    const el = frameRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const req = el && (el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el));
    if (req) Promise.resolve(req()).catch(() => undefined);
  };

  const champions = podiums.flatMap((p) => p.entries.filter((e) => e.place === 1).map((e) => `VÔ ĐỊCH ${p.label.toUpperCase()}: ${e.team.name}`));
  const ticker = [
    ...(podiumMode ? champions : []),
    ...lastDone.map((m) => {
      const aw = m.sa > m.sb;
      const tag = m.type === 'group' ? (m.group ? ` BẢNG ${m.group}` : '') : ` ${MATCH_TYPE_LABEL[m.type].toUpperCase()}`;
      return `KẾT QUẢ ${(evLabel(m.eventId)?.label ?? '').toUpperCase()}${tag}: ${tn(aw ? m.a : m.b)} thắng ${tn(aw ? m.b : m.a)} ${Math.max(m.sa, m.sb)}–${Math.min(m.sa, m.sb)}`;
    }),
    ...nextUp.slice(0, 2).map((m) => `TRẬN TIẾP ${m.time}: ${tn(m.a)} vs ${tn(m.b)}`),
    'NHÀ TÀI TRỢ: BĐS PARTNER · NƯỚC KHOÁNG LAVIE · VỢT JOOLA VIỆT NAM',
    'KHÁN GIẢ VUI LÒNG KHÔNG ĐI QUA SÂN KHI BÓNG ĐANG TRONG CUỘC',
  ];

  const frame = (
    <div
      ref={frameRef}
      className={`relative mx-auto aspect-video w-full overflow-hidden border-[#374151] bg-[#0B0F17] ${standalone ? 'max-h-screen max-w-[177.78vh]' : 'max-w-full rounded-xl border'}`}
      style={{ containerType: 'inline-size' }}
    >
      <div className="absolute inset-0 pm-grid-bg" />
      <div className="absolute -left-[10cqw] top-[20cqw] h-[30cqw] w-[30cqw] rounded-full bg-[#A3E635]/[0.07] blur-3xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[#374151]/70 bg-[#0B0F17]/80 px-[1.6cqw] py-[0.8cqw]">
          <div className="flex items-center gap-[1cqw]">
            <span className="flex h-[3cqw] w-[3cqw] items-center justify-center rounded-[0.5cqw] bg-[#A3E635]"><Zap className="h-[1.8cqw] w-[1.8cqw] text-[#0B0F17]" strokeWidth={3} /></span>
            <div className="leading-none">
              <div className="pm-display text-[length:1.9cqw] font-extrabold uppercase italic text-white">PickleMasters <span className="text-[#A3E635]">Live</span></div>
              <div className="mt-[0.2cqw] text-[length:1cqw] uppercase tracking-wider text-slate-400">{vm.tournament.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-[1.2cqw]">
            <span className="pm-display text-[length:1.1cqw] font-bold uppercase text-slate-400">
              {podiumMode ? 'Lễ trao giải' : vm.locked ? 'Đã kết thúc' : vm.matches.some((m) => m.type !== 'group' && m.status !== 'completed') ? 'Loại trực tiếp' : 'Vòng bảng'}
            </span>
            <span className="pm-num rounded-[0.4cqw] bg-[#1F2937] px-[0.8cqw] py-[0.3cqw] text-[length:1.6cqw] font-bold text-white">{now ? fmtClock(now) : '--:--:--'}</span>
          </div>
        </div>

        {podiumMode ? (
          <div className="flex min-h-0 flex-1 flex-col p-[1.6cqw]">
            <PodiumView key={podium?.eventId ?? 'none'} variant="tv" podiums={podium ? [podium] : []} players={vm.players} title={podium ? `Trao giải · ${podium.label}` : 'Lễ trao giải'} />
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 gap-[1.2cqw] p-[1.2cqw]">
          <div className="flex w-[60%] flex-col gap-[1cqw]">
            {vm.courts.map((c) => <TVCourt key={c.name} court={c} vm={vm} />)}
          </div>
          <div className="flex w-[40%] min-w-0 flex-col gap-[1cqw]">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[0.8cqw] border border-[#374151] bg-[#111827]/90">
              <div className="flex items-center justify-between gap-[0.6cqw] bg-[#0B0F17]/70 px-[1cqw] py-[0.6cqw]">
                <span className="flex min-w-0 items-center gap-[0.5cqw] truncate pm-display text-[length:1.5cqw] font-extrabold uppercase text-white">
                  <Trophy className="h-[1.4cqw] w-[1.4cqw] shrink-0 text-[#F59E0B]" /> {view?.ev.label}{view?.group ? ` · Bảng ${view.group}` : ''}
                </span>
                <span className="flex shrink-0 gap-[0.3cqw]">
                  {views.map((_, i) => <span key={i} className={`h-[0.5cqw] rounded-full transition-all ${i === idx ? 'w-[1.6cqw] bg-[#A3E635]' : 'w-[0.5cqw] bg-slate-600'}`} />)}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden pt-[0.5cqw]">
                {view && <CompactStandings rows={rows} players={vm.players} advance={view.ev.config.advance} />}
              </div>
              {view && (
                <div className="border-t border-[#374151]/60 px-[1cqw] py-[0.4cqw] text-[length:0.9cqw] uppercase text-slate-500">
                  Top {view.ev.config.advance}{view.group ? ' mỗi bảng' : ''} vào {stageName(qualifiersOf(view.ev.config))}
                </div>
              )}
            </div>
            <div className="rounded-[0.8cqw] border border-[#374151] bg-[#111827]/90">
              <div className="bg-[#0B0F17]/70 px-[1cqw] py-[0.5cqw] pm-display text-[length:1.3cqw] font-extrabold uppercase text-[#06B6D4]">Trận kế tiếp</div>
              {nextUp.map((m) => {
                const ev = evLabel(m.eventId);
                const tag = m.type === 'group' ? (m.group ? `·${m.group}` : '') : `·${MATCH_TYPE_SHORT[m.type]}`;
                return (
                  <div key={m.id} className="flex items-center gap-[0.8cqw] border-t border-[#374151]/60 px-[1cqw] py-[0.45cqw]">
                    <span className="pm-num text-[length:1.3cqw] font-bold text-[#F59E0B]">{m.time}</span>
                    <span className="w-[4.4cqw] pm-display text-[length:0.9cqw] font-bold uppercase text-slate-500">{ev?.short}{tag}</span>
                    <span className="min-w-0 flex-1 truncate text-[length:1.1cqw] font-semibold text-white">
                      {tn(m.a, true)} <span className="text-slate-500">vs</span> {tn(m.b, true)}
                    </span>
                  </div>
                );
              })}
              {nextUp.length === 0 && <div className="border-t border-[#374151]/60 px-[1cqw] py-[0.6cqw] text-[length:1cqw] text-slate-500">Đã hết lịch thi đấu</div>}
            </div>
          </div>
        </div>
        )}

        <div className="flex items-stretch border-t border-[#374151] bg-[#111827]">
          <span className="z-10 flex shrink-0 items-center gap-[0.5cqw] bg-[#A3E635] px-[1.2cqw] py-[0.7cqw] pm-display text-[length:1.3cqw] font-extrabold uppercase italic text-[#0B0F17]">
            <Radio className="h-[1.3cqw] w-[1.3cqw]" /> Tin nóng
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div className="pm-marquee absolute inset-y-0 left-0 flex w-max items-center whitespace-nowrap">
              {[0, 1].map((dup) => (
                <span key={dup} className="flex items-center" aria-hidden={dup === 1}>
                  {ticker.map((t, i) => (
                    <span key={i} className="flex items-center pm-display text-[length:1.3cqw] font-semibold uppercase text-slate-200">
                      <span className="mx-[1.2cqw] h-[0.5cqw] w-[0.5cqw] rotate-45 bg-[#F59E0B]" />{t}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F17]" onDoubleClick={goFull}>{frame}</div>;
  }

  const demoAllowed = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' && setDemo;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#06B6D4]">Màn hình trình chiếu 16:9</p>
          <h2 className="pm-display text-3xl font-extrabold uppercase leading-none text-white">TV Broadcast</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {demoAllowed && (
            <button type="button" onClick={() => setDemo!(!demo)} className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${demo ? 'border-[#A3E635] bg-[#A3E635]/10 text-[#A3E635]' : 'border-[#374151] text-slate-300'}`}>
              {demo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {demo ? 'Dừng mô phỏng' : 'Mô phỏng'}
            </button>
          )}
          <button type="button" onClick={() => setUi({ tvCycle: !ui.tvCycle })} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#374151] px-3 text-sm font-semibold text-slate-300">
            <RefreshCw className="h-4 w-4" /> Tự chuyển bảng: {ui.tvCycle ? 'Bật' : 'Tắt'}
          </button>
          <button
            type="button"
            onClick={() => setUi({ tvView: podiumMode ? 'live' : 'podium', tvIdx: 0 })}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${podiumMode ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]' : 'border-[#374151] text-slate-300'}`}
          >
            {podiumMode ? <><Tv className="h-4 w-4" /> Màn hình Trực tiếp</> : <><Crown className="h-4 w-4" /> Màn hình Trao giải</>}
          </button>
          <a href={`/tv/${vm.tournament.id}${podiumMode ? '?view=podium' : ''}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#374151] px-3 text-sm font-semibold text-slate-300">
            <ExternalLink className="h-4 w-4" /> Mở tab TV riêng
          </a>
          <button type="button" onClick={goFull} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#A3E635] px-3 text-sm font-bold text-[#0B0F17]">
            <Maximize className="h-4 w-4" /> Toàn màn hình
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 md:hidden">Chế độ này dành cho TV / máy chiếu. Xoay ngang điện thoại để xem rõ hơn.</p>
      {frame}
    </div>
  );
}
