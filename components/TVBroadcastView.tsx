'use client';

import { Bell, BellOff, CheckCircle2, Crown, ExternalLink, Maximize, Megaphone, RefreshCw, Tv, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtClock, fmtDiff, groupsOfEvent, MATCH_TYPE_LABEL, qualifiersOf, stageLabelOf, stageName, teamName } from '@/lib/engine';
import { getTournamentStore, useStandingsEngine } from '@/lib/supabase';
import type { CourtVM, MatchVM, PlayerRow, PodiumVM, StandingRow, TournamentVM, UIState } from '@/lib/types';
import { BTN_GHOST, BTN_PRIMARY, T1, T4 } from './kit';
import PodiumView from './PodiumView';
import { QRCode, tournamentUrl } from './QRCode';

/* ---------------------------- Gọi đội ra sân ---------------------------- */
const CALL_MS = 12_000;

/**
 * Queue of matches to announce: every match that newly goes live (after the screen has loaded
 * its data), plus manual "Gọi lại" requests broadcast from the BTC dashboard.
 * Each entry has a key so re-calling the match already on screen restarts its 12 s.
 */
function useCallQueue(vm: TournamentVM, ready: boolean) {
  const [queue, setQueue] = useState<{ id: string; key: number }[]>([]);
  const prev = useRef<Set<string> | null>(null);
  const seq = useRef(0);
  const push = useCallback((ids: string[], manual = false) => setQueue((q) => {
    let next = q;
    for (const id of ids) {
      if (manual && next[0]?.id === id) next = [{ id, key: ++seq.current }, ...next.slice(1)];
      else if (!next.some((x) => x.id === id)) next = [...next, { id, key: ++seq.current }];
    }
    return next;
  }), []);

  useEffect(() => {
    if (!ready) return; // baseline only once matches are loaded, so already-live courts aren't re-announced
    const live = new Set(vm.matches.filter((m) => m.status === 'live').map((m) => m.id));
    if (prev.current) push([...live].filter((id) => !prev.current!.has(id)));
    prev.current = live;
  }, [vm.matches, ready, push]);

  useEffect(() => getTournamentStore(vm.tournament.id).onCall((id) => push([id], true)), [vm.tournament.id, push]);

  const current = queue[0] ?? null;
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  useEffect(() => {
    if (!current) return undefined;
    const t = setTimeout(dismiss, CALL_MS);
    return () => clearTimeout(t);
  }, [current?.key, dismiss]); // eslint-disable-line react-hooks/exhaustive-deps
  return { current, dismiss };
}

/**
 * Chime (Web Audio, no file) + Vietnamese voice when the TV browser has one.
 * Browsers (iOS especially) only allow sound after a tap: enable() unlocks both audio and speech.
 */
function useAnnouncer() {
  const ctx = useRef<AudioContext | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const [on, setOn] = useState(false);
  const [running, setRunning] = useState(false);

  // Voices load asynchronously on Chrome
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return undefined;
    const pick = () => { voice.current = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('vi')) ?? null; };
    pick();
    synth.addEventListener?.('voiceschanged', pick);
    return () => synth.removeEventListener?.('voiceschanged', pick);
  }, []);

  const enable = useCallback(() => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = ctx.current ?? new AC();
      ctx.current = ac;
      ac.onstatechange = () => setRunning(ac.state === 'running');
      void ac.resume().then(() => setRunning(ac.state === 'running'));
      // iOS: the first speak() must happen inside the tap
      if (window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
      setOn(true);
    } catch { setOn(false); }
  }, []);
  const disable = useCallback(() => setOn(false), []);

  const announce = useCallback((text: string) => {
    const ac = ctx.current;
    if (!on || !ac) return;
    if (ac.state !== 'running') void ac.resume(); // woke up after the screen slept
    [659.25, 523.25, 783.99].forEach((f, i) => { // ding – dong – ding
      const o = ac.createOscillator();
      const g = ac.createGain();
      const t0 = ac.currentTime + i * 0.45;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
    const synth = window.speechSynthesis;
    if (synth && voice.current) {
      const v = voice.current;
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = v;
        u.lang = v.lang;
        u.rate = 0.95;
        synth.speak(u);
      }, 1500);
    }
  }, [on]);

  return { on, active: on && running, enable, disable, announce };
}

function CallOverlay({ m, vm }: { m: MatchVM; vm: TournamentVM }) {
  const ev = vm.events.find((e) => e.id === m.eventId);
  const team = (id: string) => vm.teams.find((t) => t.id === id);
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-[1.6cqw] bg-slate-950/95 px-[6cqw] text-center" role="alert">
      <span className="inline-flex items-center gap-[0.8cqw] rounded-full bg-amber-500/15 px-[1.6cqw] py-[0.5cqw] text-[length:1.4cqw] font-semibold tracking-wide text-amber-300">
        <Megaphone className="h-[1.6cqw] w-[1.6cqw]" /> MỜI CÁC VĐV RA SÂN
      </span>
      <p className="pm-num text-[length:7cqw] font-extrabold leading-none text-white">{m.court ?? 'Sân'}</p>
      <p className="text-[length:1.4cqw] font-medium text-slate-400">{[ev?.label, stageLabelOf(m)].filter(Boolean).join(' · ')}</p>
      <div className="flex w-full items-center justify-center gap-[2cqw]">
        <span className="min-w-0 flex-1 text-right text-[length:3cqw] font-bold leading-tight text-white">{teamName(team(m.a), vm.players)}</span>
        <span className="text-[length:1.8cqw] font-semibold text-slate-500">gặp</span>
        <span className="min-w-0 flex-1 text-left text-[length:3cqw] font-bold leading-tight text-white">{teamName(team(m.b), vm.players)}</span>
      </div>
      {m.referee && <p className="text-[length:1.3cqw] text-slate-400">Trọng tài: <span className="text-slate-200">{m.referee}</span></p>}
      <div className="absolute inset-x-0 bottom-0 h-[0.4cqw] bg-white/5">
        <div key={m.id} className="h-full origin-left bg-amber-400/70" style={{ animation: `pm-shrink ${CALL_MS}ms linear forwards` }} />
      </div>
    </div>
  );
}

/* =====================================================================
   TV Broadcast 16:9 (approved v4 demo skin)
   Everything is sized in container-query units (cqw) so the frame scales
   as one canvas on any TV / projector. Volt #84CC16 only for LIVE
   (badge, live score digits, serve dot).
   ===================================================================== */

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const TV_CARD = 'rounded-[1cqw] border border-white/5 bg-slate-900/60';

function TVLive({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[0.4cqw] rounded-[0.4cqw] bg-[#84CC16]/10 px-[0.7cqw] py-[0.25cqw] text-[length:1cqw] font-semibold tracking-wide text-[#84CC16]">
      <span className="pm-pulse h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#84CC16]" />{label}
    </span>
  );
}

function TVAvatars({ pids, players }: { pids: string[]; players: PlayerRow[] }) {
  return (
    <span className="flex shrink-0 -space-x-[0.8cqw]">
      {pids.map((id) => {
        const p = players.find((x) => x.id === id);
        const init = (p?.full_name.trim().split(/\s+/).pop() ?? '?').slice(0, 1).toUpperCase();
        return p?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={id} src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="h-[2.8cqw] w-[2.8cqw] rounded-full object-cover ring-[0.2cqw] ring-slate-950" />
        ) : (
          <span key={id} className="flex h-[2.8cqw] w-[2.8cqw] items-center justify-center rounded-full bg-slate-800 text-[length:1.1cqw] font-semibold text-slate-300 ring-[0.2cqw] ring-slate-950">{init}</span>
        );
      })}
    </span>
  );
}

function TVCourt({ court, vm, compact }: { court: CourtVM; vm: TournamentVM; compact: boolean }) {
  const m = vm.matches.find((x) => x.id === court.matchId);
  if (!m) {
    return (
      <div className={`${TV_CARD} flex flex-1 items-center justify-center text-[length:1.4cqw] font-semibold text-slate-500`}>
        {court.name} · Sân nghỉ
      </div>
    );
  }
  const ev = vm.events.find((e) => e.id === m.eventId);
  return (
    <div className={`${TV_CARD} flex flex-1 flex-col justify-center gap-[0.8cqw] px-[1.8cqw] py-[1cqw]`}>
      <div className="flex items-center justify-between gap-[1cqw]">
        <span className="truncate text-[length:1.4cqw] font-semibold text-slate-300">
          {court.name} · {[vm.events.length > 1 ? ev?.short : null, stageLabelOf(m)].filter(Boolean).join(' · ')}
        </span>
        <TVLive label={`LIVE · Hiệp ${m.game}`} />
      </div>
      {([['A', m.a, m.sa], ['B', m.b, m.sb]] as const).map(([k, tid, score]) => {
        const team = vm.teams.find((t) => t.id === tid);
        return (
          <div key={k} className="flex items-center gap-[1.2cqw]">
            <TVAvatars pids={team?.pids ?? []} players={vm.players} />
            <span className={`min-w-0 flex-1 truncate font-semibold text-white ${compact ? 'text-[length:1.5cqw]' : 'text-[length:1.9cqw]'}`}>{teamName(team, vm.players, compact)}</span>
            {m.serving === k && <span className="h-[0.8cqw] w-[0.8cqw] shrink-0 rounded-full bg-[#84CC16] shadow-[0_0_0.8cqw_#84CC16]" aria-label="Đang giao bóng" />}
            <span key={score} className={`pm-num pm-pop w-[6cqw] text-right font-extrabold leading-none text-[#84CC16] ${compact ? 'text-[length:3.6cqw]' : 'text-[length:5cqw]'}`}>{score}</span>
          </div>
        );
      })}
    </div>
  );
}

function TVStandings({ rows, players, advance }: { rows: StandingRow[]; players: PlayerRow[]; advance: number }) {
  const cols = 'grid grid-cols-[2cqw_minmax(0,1fr)_4cqw_4cqw_3cqw] items-center gap-[0.8cqw]';
  return (
    <div className="flex flex-col">
      <div className={`${cols} px-[1.4cqw] pb-[0.4cqw] text-[length:0.95cqw] font-medium tracking-wide text-slate-500`}>
        <span>#</span><span>ĐỘI</span><span className="text-center">T-B</span><span className="text-center">+/-</span><span className="text-right">Đ</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.team.id} className={`${cols} px-[1.4cqw] py-[0.45cqw] ${i === advance ? 'border-t border-dashed border-white/10' : 'border-t border-white/5'}`}>
          <span className={`pm-num text-[length:1.3cqw] font-semibold ${i < advance ? 'text-white' : 'text-slate-500'}`}>{i + 1}</span>
          <span className={`flex min-w-0 items-center gap-[0.5cqw] text-[length:1.3cqw] font-medium ${i < advance ? 'text-slate-100' : 'text-slate-400'}`}>
            <span className="truncate">{teamName(r.team, players, true)}</span>
            {r.live && <span className="h-[0.6cqw] w-[0.6cqw] shrink-0 rounded-full bg-[#84CC16]" />}
            {i < advance && <CheckCircle2 className="h-[1.1cqw] w-[1.1cqw] shrink-0 text-slate-400" />}
          </span>
          <span className="pm-num text-center text-[length:1.3cqw] text-slate-300">{r.w}-{r.l}</span>
          <span className="pm-num text-center text-[length:1.3cqw] text-slate-400">{fmtDiff(r.diff)}</span>
          <span className="pm-num text-right text-[length:1.5cqw] font-bold text-white">{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

export default function TVBroadcastView({
  vm, ui, setUi, standalone = false, ready = true,
}: {
  vm: TournamentVM;
  /** Matches loaded (the call-to-court overlay only starts watching then) */
  ready?: boolean;
  ui: Pick<UIState, 'tvCycle' | 'tvIdx' | 'tvView'>;
  setUi: (patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) => void;
  /** true on /tv/[id]: frame fills the whole screen, no control bar */
  standalone?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [qrUrl, setQrUrl] = useState('');
  useEffect(() => { setQrUrl(tournamentUrl(vm.tournament.id)); }, [vm.tournament.id]);
  const { current: call, dismiss } = useCallQueue(vm, ready);
  const callId = call?.id ?? null;
  const calling = callId ? vm.matches.find((m) => m.id === callId) ?? null : null;
  useEffect(() => { if (callId && !calling) dismiss(); }, [callId, calling, dismiss]); // match vanished (e.g. schedule rebuilt)
  const announcer = useAnnouncer();
  const { announce } = announcer;
  useEffect(() => {
    if (!calling || ui.tvView === 'podium') return;
    const name = (id: string) => teamName(vm.teams.find((t) => t.id === id), vm.players);
    announce(`Mời ${name(calling.a)} và ${name(calling.b)} ra ${calling.court ?? 'sân'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.key]);
  const soundBtn = (
    <button type="button" onClick={announcer.active ? announcer.disable : announcer.enable} className={BTN_GHOST} title="Âm thanh gọi đội ra sân">
      {announcer.active ? <><Bell className="h-4 w-4" /> Âm thanh: Bật</> : <><BellOff className="h-4 w-4" /> Bật âm thanh gọi đội</>}
    </button>
  );
  const now = useNow();
  const engine = useStandingsEngine(vm.tournament.id);

  const views = vm.events.flatMap((e) => groupsOfEvent(e).map((g) => ({ ev: e, group: g })));
  const idx = views.length ? ui.tvIdx % views.length : 0;
  useEffect(() => {
    if (!ui.tvCycle) return undefined;
    const t = setInterval(() => setUi((u) => ({ tvIdx: (u.tvIdx + 1) % 1000 })), 8000);
    return () => clearInterval(t);
  }, [ui.tvCycle, setUi]);

  const view = views[idx];
  const podiumMode = ui.tvView === 'podium';
  const podiums = vm.events.map((e) => engine.podiumFor(e.id)).filter((p): p is PodiumVM => !!p && p.entries.length > 0);
  const podium = podiums.length ? podiums[ui.tvIdx % podiums.length] : undefined;
  const liveN = vm.courts.filter((c) => c.matchId).length;
  // With check-in on, only matches whose players are all present can be called next
  const present = new Set(vm.checkedInIds);
  const ready4 = (teamId: string) => (vm.teams.find((t) => t.id === teamId)?.pids ?? []).every((id) => present.has(id));
  const nextUp = vm.matches.filter((m) => m.status === 'upcoming' && (!vm.rules.checkIn || (ready4(m.a) && ready4(m.b)))).slice(0, 3);
  const lastDone = vm.matches.filter((m) => m.status === 'completed').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(-4).reverse();
  const tn = (id: string, short?: boolean) => teamName(vm.teams.find((t) => t.id === id), vm.players, short);
  const compact = vm.courts.length > 2;

  const goFull = () => {
    const el = frameRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const req = el && (el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el));
    if (req) Promise.resolve(req()).catch(() => undefined);
  };

  const champions = podiums.flatMap((p) => p.entries.filter((e) => e.place === 1).map((e) => `Vô địch ${p.label}: ${teamName(e.team, vm.players)}`));
  const ticker = [
    ...(podiumMode ? champions : []),
    ...lastDone.map((m) => {
      const aw = m.sa > m.sb;
      const stage = m.type === 'group' ? stageLabelOf(m) : MATCH_TYPE_LABEL[m.type];
      return `${stage}: ${tn(aw ? m.a : m.b)} thắng ${Math.max(m.sa, m.sb)}–${Math.min(m.sa, m.sb)}`;
    }),
    ...nextUp.slice(0, 2).map((m) => `Trận tiếp ${m.time}: ${tn(m.a, true)} vs ${tn(m.b, true)}`),
    'Khán giả vui lòng không đi qua sân khi bóng đang trong cuộc',
  ];

  const frame = (
    <div
      ref={frameRef}
      className={`relative mx-auto aspect-video w-full overflow-hidden bg-slate-950 ${standalone ? 'max-h-screen max-w-[177.78vh]' : 'max-w-full rounded-2xl border border-white/5'}`}
      style={{ containerType: 'inline-size' }}
    >
      <div className="relative flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-[2.4cqw] py-[1.2cqw]">
          <div className="flex min-w-0 items-center gap-[1cqw]">
            <span className="flex h-[2.8cqw] w-[2.8cqw] shrink-0 items-center justify-center rounded-[0.6cqw] bg-white/10"><Zap className="h-[1.6cqw] w-[1.6cqw] text-white" /></span>
            <span className="truncate text-[length:1.9cqw] font-bold text-white">{vm.tournament.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-[1.2cqw]">
            {podiumMode ? <span className="text-[length:1.1cqw] font-medium tracking-wide text-amber-300">LỄ TRAO GIẢI</span>
              : liveN > 0 ? <TVLive label={`${liveN} SÂN LIVE`} />
              : <span className="text-[length:1.1cqw] font-medium tracking-wide text-slate-400">{vm.locked ? 'ĐÃ KẾT THÚC' : 'CHỜ TRẬN'}</span>}
            <span className="pm-num text-[length:1.6cqw] font-semibold text-slate-200">{now ? fmtClock(now) : '--:--:--'}</span>
          </div>
        </div>

        {podiumMode ? (
          <div className="flex min-h-0 flex-1 flex-col px-[6cqw] py-[1.6cqw]">
            <PodiumView key={podium?.eventId ?? 'none'} variant="tv" podiums={podium ? [podium] : []} players={vm.players} title={podium ? `Trao giải · ${podium.label}` : 'Lễ trao giải'} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-[1.6cqw] p-[2cqw]">
            <div className={`grid w-[60%] gap-[1.6cqw] ${compact ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {vm.courts.map((c) => <TVCourt key={c.name} court={c} vm={vm} compact={compact} />)}
            </div>
            <div className="flex w-[40%] min-w-0 flex-col gap-[1.6cqw]">
              <div className={`${TV_CARD} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                <div className="flex items-center justify-between gap-[0.6cqw] px-[1.4cqw] py-[0.9cqw]">
                  <span className="truncate text-[length:1.5cqw] font-semibold text-white">
                    {view ? `${view.ev.label}${view.group ? ` · Bảng ${view.group}` : ''}` : 'Bảng xếp hạng'}
                  </span>
                  <span className="flex shrink-0 gap-[0.3cqw]">
                    {views.map((_, i) => <span key={i} className={`h-[0.5cqw] rounded-full transition-all ${i === idx ? 'w-[1.6cqw] bg-slate-200' : 'w-[0.5cqw] bg-slate-700'}`} />)}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {view && <TVStandings rows={engine.getStandings(view.ev.id, view.group)} players={vm.players} advance={view.ev.config.advance} />}
                </div>
                {view && (
                  <div className="border-t border-white/5 px-[1.4cqw] py-[0.5cqw] text-[length:0.95cqw] font-medium tracking-wide text-slate-500">
                    Top {view.ev.config.advance}{view.group ? ' mỗi bảng' : ''} → {stageName(qualifiersOf(view.ev.config))}
                  </div>
                )}
              </div>
              <div className={`${TV_CARD} flex overflow-hidden`}>
                <div className="min-w-0 flex-1">
                <p className="px-[1.4cqw] py-[0.8cqw] text-[length:1.5cqw] font-semibold text-white">Trận kế tiếp</p>
                {nextUp.map((m) => (
                  <div key={m.id} className="flex items-center gap-[0.8cqw] border-t border-white/5 px-[1.4cqw] py-[0.5cqw]">
                    <span className="pm-num w-[4.4cqw] text-[length:1.2cqw] font-semibold text-slate-300">{m.time || '--:--'}</span>
                    <span className="min-w-0 flex-1 truncate text-[length:1.2cqw] font-medium text-slate-200">
                      {tn(m.a, true)} <span className="text-slate-500">vs</span> {tn(m.b, true)}
                    </span>
                  </div>
                ))}
                {!nextUp.length && <p className="border-t border-white/5 px-[1.4cqw] py-[0.6cqw] text-[length:1.1cqw] text-slate-500">Đã hết lịch thi đấu</p>}
                </div>
                <div className="flex w-[9cqw] shrink-0 flex-col items-center justify-center gap-[0.3cqw] border-l border-white/5 p-[0.8cqw]">
                  <QRCode value={qrUrl} title="Quét để xem trực tiếp" className="w-full rounded-[0.4cqw]" />
                  <span className="text-center text-[length:0.85cqw] leading-tight text-slate-400">Quét xem trực tiếp</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!podiumMode && calling && <CallOverlay m={calling} vm={vm} />}

        {/* Ticker */}
        <div className="flex items-stretch overflow-hidden border-t border-white/5 bg-slate-900/60">
          <span className="z-10 flex shrink-0 items-center bg-white/10 px-[1.6cqw] text-[length:1.1cqw] font-semibold tracking-wide text-white">TIN NHANH</span>
          <div className="relative h-[3.4cqw] flex-1 overflow-hidden">
            <div className="pm-marquee absolute inset-y-0 left-0 flex w-max items-center whitespace-nowrap">
              {[0, 1].map((dup) => (
                <span key={dup} className="flex" aria-hidden={dup === 1}>
                  {ticker.map((t, i) => <span key={i} className="px-[2.4cqw] text-[length:1.25cqw] font-medium text-slate-300">{t}</span>)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-slate-950" onDoubleClick={goFull}>
        {frame}
        {/* Browsers only allow sound after one tap: shown until enabled */}
        {!announcer.active && <div className="absolute left-3 top-3 z-30 opacity-70 hover:opacity-100">{soundBtn}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={`${T4} text-slate-500`}>MÀN HÌNH 16:9</p>
          <h1 className={`${T1} text-white`}>TV Broadcast</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {soundBtn}
          <button type="button" onClick={() => setUi({ tvCycle: !ui.tvCycle })} className={BTN_GHOST}>
            <RefreshCw className="h-4 w-4" /> Tự chuyển bảng: {ui.tvCycle ? 'Bật' : 'Tắt'}
          </button>
          <button type="button" onClick={() => setUi({ tvView: podiumMode ? 'live' : 'podium', tvIdx: 0 })} className={BTN_GHOST}>
            {podiumMode ? <><Tv className="h-4 w-4" /> Trực tiếp</> : <><Crown className="h-4 w-4" /> Trao giải</>}
          </button>
          <a href={`/tv/${vm.tournament.id}${podiumMode ? '?view=podium' : ''}`} target="_blank" rel="noreferrer" className={BTN_GHOST}>
            <ExternalLink className="h-4 w-4" /> Mở tab TV riêng
          </a>
          <button type="button" onClick={goFull} className={BTN_PRIMARY}><Maximize className="h-4 w-4" /> Toàn màn hình</button>
        </div>
      </div>
      {frame}
    </div>
  );
}
