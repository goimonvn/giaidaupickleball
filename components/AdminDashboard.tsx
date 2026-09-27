'use client';

import {
  ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, ChevronRight, GitBranch, GripVertical, Hand, Lock, LockOpen,
  Pencil, Play, Plus, RefreshCw, Scale, Search, Shuffle, Trash2, Trophy, UserRound, Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addEvent, addTournamentParticipants, completeTournament, createFinals, deleteEvent, reopenTournament, updateEvent,
  updateTournament,
} from '@/lib/actions';
import { applyEventSetup, assignCourtReferee, callNextMatch, createKnockout, refreshTournament } from '@/lib/client-actions';
import {
  dateInputOf, GROUP_LETTERS, startsAtOf, timeInputOf, groupsOfEvent, pairAB, pairBalanced, pairSpread, pairSum, qualifiersOf, snakeByIndex,
  STATUS_TAG, stageName, stageType, statusTagOf, TB_LABELS, teamName, type DraftTeam,
} from '@/lib/engine';
import { useStandingsEngine, type AuthState } from '@/lib/supabase';
import type {
  BtcDraft, EventInput, EventVM, PairingMode, PlayerRow, TieBreaker, TournamentInput, TournamentVM, UIState,
} from '@/lib/types';
import {
  BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, Checkbox, chipCls, Confirm, DATE_INPUT, Empty, Field, ICON_BTN, INPUT, LiveBadge,
  optionCls, Segmented, Sheet, StripGroup, SURFACE, T1, T2, T3, T4, Toggle, type Toast,
} from './kit';
import { Bracket, MatchDrawer, ScoreStrip } from './PublicView';

/* =====================================================================
   BTC dashboard — 3-step accordion (approved v4 demo)
     1. Cấu hình Giải & Thể lệ   (title, date, courts, target, win-by, tie-breakers, events)
     2. VĐV & Chia Bảng          (2.1 chọn VĐV → 2.2 ghép cặp → 2.3 chia bảng → tạo lịch)
     3. Điều hành & Knockout     (courts + referees, semis, finals & bronze, close)
   All writes go through RLS-protected Server Actions / RPCs.
   ===================================================================== */

const eventOffset = (vm: TournamentVM, eventId: string) => Math.max(0, vm.events.findIndex((e) => e.id === eventId)) * 1000;
const run = async (fn: () => Promise<unknown>, toast: Toast, okMsg?: string) => {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    toast((e as Error).message, 'error');
    return false;
  }
};
/** Server actions return ActionResult — turn failures into thrown errors for `run`. */
const unwrap = async <T,>(p: Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T> => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

/* ---------------------------- accordion shell ---------------------------- */
function StepShell({ n, title, desc, done, open, onToggle, children }: { n: number; title: string; desc: string; done: boolean; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className={`pm-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${T2} ${done ? 'bg-slate-100 text-slate-950' : open ? 'border border-white/30 text-white' : 'border border-white/10 text-slate-500'}`}>
          {done ? <Check className="h-4 w-4" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`${T2} block text-white`}>{title}</span>
          <span className={`${T4} block truncate text-slate-500`}>{desc}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/5 p-4">{children}</div>}
    </section>
  );
}

/* ---------------------------- tie-breakers (drag & drop + arrows) ---------------------------- */
export function TieBreakerOrder({ order, onChange, disabled }: { order: TieBreaker[]; onChange: (o: TieBreaker[]) => void; disabled?: boolean }) {
  const drag = useRef<number | null>(null);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <ol className="flex flex-col gap-1.5">
      {order.map((k, i) => (
        <li
          key={k}
          draggable={!disabled}
          onDragStart={(e) => { drag.current = i; e.dataTransfer.setData('text/plain', k); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            const f = drag.current;
            drag.current = null;
            if (f == null || f === i) return;
            const n = [...order];
            const [x] = n.splice(f, 1);
            n.splice(i, 0, x);
            onChange(n);
          }}
          className={`flex min-h-[44px] items-center gap-2 ${SURFACE} px-2`}
        >
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-600" aria-hidden="true" />
          <span className={`pm-num ${T4} w-4 text-slate-500`}>{i + 1}</span>
          <span className={`${T3} flex-1 text-slate-200`}>{TB_LABELS[k]}</span>
          <button type="button" aria-label={`Đưa ${TB_LABELS[k]} lên`} onClick={() => move(i, -1)} disabled={disabled || !i} className={ICON_BTN}><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label={`Đưa ${TB_LABELS[k]} xuống`} onClick={() => move(i, 1)} disabled={disabled || i === order.length - 1} className={ICON_BTN}><ArrowDown className="h-4 w-4" /></button>
        </li>
      ))}
    </ol>
  );
}

/* ======================= STEP 1 — Cấu hình Giải & Thể lệ ======================= */
const inputOf = (vm: TournamentVM): TournamentInput => ({
  title: vm.tournament.title,
  date: dateInputOf(vm.tournament.starts_at),
  time: timeInputOf(vm.tournament.starts_at),
  startsAt: vm.tournament.starts_at,
  venue: vm.tournament.venue ?? '',
  courts: Math.max(1, Math.min(4, vm.rules.courts.length)),
  target: vm.rules.target,
  winBy: vm.rules.winBy,
  tieBreakers: vm.rules.tieBreakers,
});

export const EVENT_PRESETS: EventInput[] = [
  { name: 'Đôi Nam', short: 'ĐN', singles: false, groupsEnabled: true, numGroups: 2, advance: 2 },
  { name: 'Đôi Nữ', short: 'ĐNỮ', singles: false, groupsEnabled: true, numGroups: 2, advance: 2 },
  { name: 'Đôi Nam Nữ', short: 'ĐNN', singles: false, groupsEnabled: true, numGroups: 2, advance: 2 },
  { name: 'Đơn Nam', short: 'ĐƠN', singles: true, groupsEnabled: false, numGroups: 1, advance: 2 },
  { name: 'Đơn Nữ', short: 'ĐƠN NỮ', singles: true, groupsEnabled: false, numGroups: 1, advance: 2 },
];

function EventForm({ initial, hasTeams, onSave, onClose }: { initial: EventInput | null; hasTeams: boolean; onSave: (e: EventInput) => Promise<boolean>; onClose: () => void }) {
  const [f, setF] = useState<EventInput>(initial ?? EVENT_PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const valid = f.name.trim().length >= 2;
  return (
    <Sheet title={initial ? 'Sửa nội dung thi đấu' : 'Thêm nội dung thi đấu'} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          const ok = await onSave(f);
          setBusy(false);
          if (ok) onClose();
        }}
      >
        {!initial && (
          <div className="flex flex-wrap gap-1.5">
            {EVENT_PRESETS.map((p) => (
              <button key={p.name} type="button" onClick={() => setF(p)} className={chipCls(f.name === p.name)}>{p.name}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="TÊN NỘI DUNG" htmlFor="pm-ev-name"><input id="pm-ev-name" className={INPUT} value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="VIẾT TẮT" htmlFor="pm-ev-short"><input id="pm-ev-short" className={INPUT} value={f.short} maxLength={12} onChange={(e) => setF({ ...f, short: e.target.value })} /></Field>
        </div>
        <Field label="THỂ THỨC">
          <Segmented full value={f.singles ? 'singles' : 'doubles'} onChange={(v) => setF({ ...f, singles: v === 'singles', groupsEnabled: v === 'doubles' ? f.groupsEnabled : false })}
            options={[{ id: 'doubles', label: 'Đánh đôi' }, { id: 'singles', label: 'Đánh đơn' }]} />
        </Field>
        {initial && hasTeams && initial.singles !== f.singles && (
          <p className={`${T4} text-amber-300`}>Nội dung đã có đội nên không đổi được Đơn/Đôi. Xoá nội dung rồi tạo lại nếu cần.</p>
        )}
        <p className={`${T4} text-slate-500`}>Chia bảng và số đội đi tiếp chỉnh ở Bước 2.3.</p>
        <button type="submit" disabled={!valid || busy} className={BTN_PRIMARY}>{busy ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Thêm nội dung'}</button>
      </form>
    </Sheet>
  );
}

function Step1({ vm, toast, onDone }: { vm: TournamentVM; toast: Toast; onDone: () => void }) {
  const [cfg, setCfg] = useState<TournamentInput>(() => inputOf(vm));
  const [busy, setBusy] = useState(false);
  const [eventSheet, setEventSheet] = useState<EventVM | 'new' | null>(null);
  const [delEvent, setDelEvent] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const tid = vm.tournament.id;
  // Reload the form when another tournament opens (not on every realtime tick, so edits aren't lost)
  useEffect(() => { setCfg(inputOf(vm)); }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveOnRemoved = vm.matches.filter((m) => m.status === 'live' && m.court && Number(m.court.replace(/\D/g, '')) > cfg.courts).length;

  const save = async () => {
    setBusy(true);
    const ok = await run(async () => {
      const r = await unwrap(updateTournament(tid, { ...cfg, startsAt: startsAtOf(cfg.date, cfg.time) }));
      await refreshTournament(tid);
      toast(r.requeued ? `Đã lưu cấu hình. ${r.requeued} trận ở sân bị bỏ đã về hàng chờ.` : 'Đã lưu cấu hình giải');
    }, toast);
    setBusy(false);
    if (ok) onDone();
  };

  const teamsIn = (evId: string) => vm.teams.filter((t) => t.eventId === evId).length;
  const saveEvent = (e: EventInput) => run(async () => {
    if (eventSheet === 'new') await unwrap(addEvent(tid, e));
    else if (eventSheet) await unwrap(updateEvent(eventSheet.id, { ...e, groupsEnabled: eventSheet.config.groupsEnabled, numGroups: eventSheet.config.numGroups, advance: eventSheet.config.advance }));
    await refreshTournament(tid);
  }, toast, eventSheet === 'new' ? `Đã thêm ${e.name}` : 'Đã lưu nội dung');

  return (
    <fieldset disabled={vm.locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <Field label="TÊN GIẢI" htmlFor="pm-cfg-title"><input id="pm-cfg-title" className={INPUT} value={cfg.title} maxLength={120} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="NGÀY THI ĐẤU" htmlFor="pm-cfg-date"><input id="pm-cfg-date" type="date" className={DATE_INPUT} value={cfg.date} onChange={(e) => setCfg({ ...cfg, date: e.target.value })} /></Field>
        <Field label="GIỜ BẮT ĐẦU" htmlFor="pm-cfg-time"><input id="pm-cfg-time" type="time" step={300} className={DATE_INPUT} value={cfg.time} onChange={(e) => setCfg({ ...cfg, time: e.target.value })} /></Field>
      </div>
      <p className={`${T4} -mt-2 text-slate-500`}>Lịch vòng bảng xếp giờ từ thời điểm này khi bấm "Áp dụng & tạo lịch" ở Bước 2.</p>
      <Field label="ĐỊA ĐIỂM" htmlFor="pm-cfg-venue"><input id="pm-cfg-venue" className={INPUT} value={cfg.venue} placeholder="CLB, sân…" onChange={(e) => setCfg({ ...cfg, venue: e.target.value })} /></Field>
      <Field label="SỐ LƯỢNG SÂN">
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 2, 3, 4].map((n) => <button key={n} type="button" aria-pressed={cfg.courts === n} onClick={() => setCfg({ ...cfg, courts: n })} className={optionCls(cfg.courts === n)}>{n} sân</button>)}
        </div>
      </Field>
      {liveOnRemoved > 0 && <p className={`${T4} -mt-2 text-amber-300`}>{liveOnRemoved} trận đang đấu ở sân bị bỏ sẽ được đưa về hàng chờ.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ĐIỂM THẮNG GAME">
          <div className="flex gap-1.5">
            {[11, 15, 21].map((n) => <button key={n} type="button" aria-pressed={cfg.target === n} onClick={() => setCfg({ ...cfg, target: n })} className={optionCls(cfg.target === n)}>{n} điểm</button>)}
          </div>
        </Field>
        <Field label="CÁCH BIỆT TỐI THIỂU">
          <div role="radiogroup" aria-label="Cách biệt tối thiểu" className="flex gap-1.5">
            {([[1, '1 điểm'], [2, '2 điểm · Win by 2']] as const).map(([n, l]) => (
              <button key={n} type="button" role="radio" aria-checked={cfg.winBy === n} onClick={() => setCfg({ ...cfg, winBy: n })} className={`${optionCls(cfg.winBy === n)} gap-2`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${cfg.winBy === n ? 'border-white' : 'border-slate-600'}`}>{cfg.winBy === n && <span className="h-2 w-2 rounded-full bg-white" />}</span>
                {l}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <p className={`${T4} -mt-2 text-slate-500`}>
        Ví dụ: {cfg.target} điểm, cách {cfg.winBy} → {cfg.winBy === 2
          ? `${cfg.target}–${cfg.target - 2} là thắng; ${cfg.target}–${cfg.target - 1} phải đánh tiếp tới ${cfg.target + 1}–${cfg.target - 1}`
          : `${cfg.target}–${cfg.target - 1} là thắng`}.
      </p>

      <Field label="ƯU TIÊN KHI BẰNG ĐIỂM · KÉO THẢ ĐỂ SẮP XẾP">
        <TieBreakerOrder order={cfg.tieBreakers} onChange={(o) => setCfg({ ...cfg, tieBreakers: o })} disabled={vm.locked} />
      </Field>

      <button type="button" className={BTN_PRIMARY} disabled={busy || cfg.title.trim().length < 3} onClick={() => void save()}>
        {busy ? 'Đang lưu…' : <>Lưu & tiếp tục <ChevronRight className="h-4 w-4" /></>}
      </button>

      <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
        <div className="flex items-center justify-between">
          <span className={`${T4} text-slate-500`}>NỘI DUNG THI ĐẤU · {vm.events.length}</span>
          <button type="button" className={`${BTN_GHOST} min-h-[36px] px-3`} onClick={() => setEventSheet('new')}><Plus className="h-4 w-4" /> Thêm</button>
        </div>
        {!vm.events.length && <p className={`${T3} text-slate-500`}>Chưa có nội dung. Thêm ít nhất một (VD: Đôi Nam).</p>}
        <ul className="flex flex-col gap-1.5">
          {vm.events.map((e) => (
            <li key={e.id} className={`${SURFACE} px-3 py-2`}>
              <div className="flex min-h-[40px] items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className={`${T3} block truncate text-white`}>{e.label}</span>
                  <span className={`${T4} block text-slate-500`}>
                    {e.singles ? 'Đánh đơn' : 'Đánh đôi'} · {teamsIn(e.id)} {e.singles ? 'VĐV' : 'cặp'} · {e.config.groupsEnabled ? `${e.config.numGroups} bảng` : '1 bảng'} · Top {e.config.advance}
                  </span>
                </span>
                <button type="button" aria-label={`Sửa ${e.label}`} className={ICON_BTN} onClick={() => setEventSheet(e)}><Pencil className="h-4 w-4" /></button>
                <button type="button" aria-label={`Xoá ${e.label}`} className={`${ICON_BTN} hover:text-rose-300`} onClick={() => setDelEvent(e.id)}><Trash2 className="h-4 w-4" /></button>
              </div>
              {delEvent === e.id && (
                <div className="mt-2">
                  <Confirm danger busy={delBusy} text={`Xoá "${e.label}" cùng toàn bộ đội, lịch và kết quả của nội dung này?`} confirmLabel="Xoá nội dung"
                    onCancel={() => setDelEvent(null)}
                    onConfirm={async () => {
                      setDelBusy(true);
                      await run(async () => { await unwrap(deleteEvent(e.id)); await refreshTournament(tid); setDelEvent(null); }, toast, `Đã xoá ${e.label}`);
                      setDelBusy(false);
                    }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {eventSheet && (
        <EventForm
          initial={eventSheet === 'new' ? null : { name: eventSheet.label, short: eventSheet.short, singles: eventSheet.singles, groupsEnabled: eventSheet.config.groupsEnabled, numGroups: eventSheet.config.numGroups, advance: eventSheet.config.advance }}
          hasTeams={eventSheet !== 'new' && teamsIn(eventSheet.id) > 0}
          onSave={saveEvent}
          onClose={() => setEventSheet(null)}
        />
      )}
    </fieldset>
  );
}

/* ======================= STEP 2 — VĐV, Ghép cặp & Chia bảng ======================= */
export function initDraft(vm: TournamentVM, ev: EventVM): BtcDraft {
  const teams = vm.teams.filter((t) => t.eventId === ev.id);
  const pairs = teams.length ? teams.map((t) => t.pids) : null;
  const cfg = ev.config;
  return {
    sub: '2.1',
    picked: teams.length ? teams.flatMap((t) => t.pids) : [...vm.participantIds],
    pairMode: 'balanced',
    abSeed: 7,
    pairs,
    groupMode: 'auto',
    groupsEnabled: cfg.groupsEnabled,
    numGroups: cfg.groupsEnabled ? cfg.numGroups : 2,
    advance: cfg.advance,
    assign: Object.fromEntries(teams.map((t, i) => [i, t.group ?? 'A'])),
  };
}

function SubSteps({ current, unlocked, onPick }: { current: BtcDraft['sub']; unlocked: BtcDraft['sub'][]; onPick: (s: BtcDraft['sub']) => void }) {
  const items = [
    { id: '2.1' as const, label: 'Chọn VĐV', icon: Users },
    { id: '2.2' as const, label: 'Ghép cặp', icon: Shuffle },
    { id: '2.3' as const, label: 'Chia bảng', icon: GitBranch },
  ];
  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="Các giai đoạn">
      {items.map((it) => {
        const on = current === it.id;
        const Icon = it.icon;
        return (
          <li key={it.id}>
            <button
              type="button"
              disabled={!unlocked.includes(it.id)}
              onClick={() => onPick(it.id)}
              aria-current={on ? 'step' : undefined}
              className={`flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border transition disabled:opacity-35 ${on ? 'border-white/30 bg-white/[0.07] text-white' : 'border-white/5 text-slate-400 hover:text-slate-200'}`}
            >
              <span className={`pm-num ${T4} ${on ? 'text-slate-300' : 'text-slate-500'}`}>{it.id}</span>
              <span className={`${T3} flex items-center gap-1`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{it.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function PairCard({ pids, players, index, tier, onRemove }: { pids: string[]; players: PlayerRow[]; index: number; tier: boolean; onRemove?: () => void }) {
  return (
    <li className={`flex min-h-[48px] items-center gap-2 ${SURFACE} px-3`}>
      <span className={`pm-num ${T4} w-5 text-slate-500`}>{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        {pids.map((id, k) => {
          const p = players.find((x) => x.id === id);
          return (
            <p key={id} className={`${T3} flex items-center gap-1.5 truncate text-slate-200`}>
              {tier && <span className={`${T4} w-3 text-slate-500`}>{k === 0 ? 'A' : 'B'}</span>}
              <span className="truncate">{p?.full_name ?? '?'}</span>
              <span className={`pm-num ${T4} text-slate-500`}>{Number(p?.skill_rating ?? 0).toFixed(1)}</span>
            </p>
          );
        })}
      </div>
      <span className="flex flex-col items-end">
        <span className={`pm-num ${T2} text-white`}>{pairSum(pids, players).toFixed(1)}</span>
        <span className={`${T4} text-slate-500`}>{pids.length > 1 ? 'tổng trình' : 'trình'}</span>
      </span>
      {onRemove && <button type="button" aria-label="Tách cặp" onClick={onRemove} className={ICON_BTN}><Trash2 className="h-4 w-4" /></button>}
    </li>
  );
}

function Step2({ vm, ev, draft, setDraft, clearDraft, toast, onApplied }: {
  vm: TournamentVM;
  ev: EventVM;
  draft: BtcDraft;
  setDraft: (patch: Partial<BtcDraft>) => void;
  clearDraft: () => void;
  toast: Toast;
  onApplied: () => void;
}) {
  const players = vm.players;
  const singles = ev.singles;
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragPid = useRef<string | null>(null);

  const pool = players.filter((p) => draft.picked.includes(p.id));
  const pairs = draft.pairs ?? [];
  const paired = new Set(pairs.flat());
  const unpaired = pool.filter((p) => !paired.has(p.id));
  const minPool = singles ? 3 : 6;
  const unlocked: BtcDraft['sub'][] = ['2.1', ...(pool.length >= minPool ? ['2.2' as const] : []), ...(pairs.length >= 3 ? ['2.3' as const] : [])];

  const setPicked = (picked: string[]) => setDraft({ picked, pairs: null, assign: {} });
  const togglePick = (id: string) => setPicked(draft.picked.includes(id) ? draft.picked.filter((x) => x !== id) : [...draft.picked, id]);

  const pairsFor = (mode: PairingMode, seed = draft.abSeed): string[][] => {
    if (singles) return pool.map((p) => [p.id]);
    if (mode === 'balanced') return pairBalanced(pool, players);
    if (mode === 'ab') return pairAB(pool, seed);
    return [];
  };
  const runPairing = (mode: PairingMode, seed = draft.abSeed) => { setDraft({ pairMode: mode, abSeed: seed, pairs: pairsFor(mode, seed), assign: {} }); setPick(null); };

  const goPairing = async () => {
    // Keep the tournament's participant list in sync (adds only, never removes)
    const missing = draft.picked.filter((id) => !vm.participantIds.includes(id));
    if (missing.length) {
      const r = await addTournamentParticipants(vm.tournament.id, missing);
      if (!r.ok) { toast(r.error, 'error'); return; }
    }
    setDraft({ sub: '2.2', ...(draft.pairs ? {} : { pairs: pairsFor(draft.pairMode) }) });
  };
  const manualPair = (a: string | null, b: string) => {
    if (!a || a === b || paired.has(a) || paired.has(b)) return;
    setDraft({ pairs: [...pairs, [a, b]], assign: {} });
    setPick(null);
  };

  // Group layouts the knockout engine can seed: 2 bảng (Top 1 → CK, Top 2 → BK) or 4 bảng (Top 1 → BK)
  const groupOpts = [2, 4].filter((g) => pairs.length / g >= 2);
  const numGroups = groupOpts.includes(draft.numGroups) ? draft.numGroups : groupOpts[0] ?? 2;
  const groupsOn = draft.groupsEnabled && groupOpts.length > 0;
  const labels = (GROUP_LETTERS.slice(0, numGroups) as readonly string[]);
  const advanceOpts = groupsOn && numGroups === 4 ? [1] : [1, 2];
  const advance = advanceOpts.includes(draft.advance) ? draft.advance : advanceOpts[0];
  const autoAssign = (n = numGroups) => snakeByIndex(pairs, n, players);
  // A draft assignment is usable only if it covers every pair with an existing group letter
  const assignValid = Object.keys(draft.assign).length === pairs.length && Object.values(draft.assign).every((g) => labels.includes(g));
  const assign = assignValid ? draft.assign : autoAssign();
  const goGroups = () => setDraft(assignValid ? { sub: '2.3' } : { sub: '2.3', groupMode: 'auto', assign: autoAssign() });
  const countIn = (g: string) => pairs.filter((_, i) => assign[i] === g).length;
  const groupsValid = !groupsOn || labels.every((g) => countIn(g) >= 2);
  const doneInEvent = vm.matches.filter((m) => m.eventId === ev.id && m.status === 'completed').length;
  const teamAvgOf = (pids: string[]) => pairSum(pids, players) / Math.max(1, pids.length);

  const apply = async () => {
    setBusy(true);
    const teams: DraftTeam[] = pairs.map((pids, i) => ({ key: `t${i + 1}`, pids, group: groupsOn ? assign[i] : null }));
    const ok = await run(() => applyEventSetup({
      tournament: vm.tournament,
      eventId: ev.id,
      teams,
      config: groupsOn ? { groupsEnabled: true, numGroups, advance } : { groupsEnabled: false, numGroups: 1, advance },
      players,
      orderOffset: eventOffset(vm, ev.id),
    }), toast, `${ev.label}: đã tạo ${teams.length} ${singles ? 'VĐV' : 'cặp'} và lịch vòng bảng`);
    setBusy(false);
    setConfirm(false);
    if (ok) { clearDraft(); onApplied(); }
  };

  const shown = players.filter((p) => !q.trim() || p.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  const pickSet = (ids: string[]) => () => setPicked(ids);

  return (
    <fieldset disabled={vm.locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <SubSteps current={draft.sub} unlocked={unlocked} onPick={(s) => (s === '2.2' ? void goPairing() : s === '2.3' ? goGroups() : setDraft({ sub: s }))} />

      {/* -------- 2.1 Chọn VĐV -------- */}
      {draft.sub === '2.1' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className={`${T2} text-white`}>2.1 · Chọn VĐV tham gia {ev.label}</h3>
            <p className={`${T4} text-slate-500`}>Chạm để chọn từ danh sách thành viên. Người mới chọn sẽ được thêm vào danh sách VĐV của giải.</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input aria-label="Tìm thành viên" className={`${INPUT} pl-9`} placeholder="Tìm thành viên…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`pm-num ${T3} shrink-0 text-slate-300`}><b className="text-white">{draft.picked.length}</b> / {players.length} đã chọn</span>
            <div className="pm-noscroll flex gap-1.5 overflow-x-auto">
              <button type="button" className={chipCls(false)} onClick={pickSet(players.filter((p) => p.gender === 'M').map((p) => p.id))}>Nam</button>
              <button type="button" className={chipCls(false)} onClick={pickSet(players.filter((p) => p.gender === 'F').map((p) => p.id))}>Nữ</button>
              {vm.participantIds.length > 0 && <button type="button" className={chipCls(false)} onClick={pickSet([...vm.participantIds])}>Đã đăng ký</button>}
              <button type="button" className={chipCls(false)} onClick={pickSet(players.map((p) => p.id))}>Tất cả</button>
              <button type="button" className={chipCls(false)} onClick={pickSet([])}>Bỏ chọn</button>
            </div>
          </div>
          <ul className="grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {shown.map((p) => {
              const on = draft.picked.includes(p.id);
              return (
                <li key={p.id}>
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => togglePick(p.id)}
                    className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-left ${on ? 'border-white/30 bg-white/[0.06]' : 'border-white/5 bg-slate-950'}`}>
                    <Checkbox on={on} />
                    <span className={`${T3} flex-1 truncate text-slate-200`}>{p.full_name}</span>
                    <span className={`${T4} text-slate-500`}>{p.group_tag.replace(/^Nhóm /, '')}</span>
                    <span className={`pm-num ${T4} text-slate-300`}>{Number(p.skill_rating).toFixed(1)}</span>
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className={`${T3} py-6 text-center text-slate-500 sm:col-span-2`}>Không có thành viên phù hợp. Thêm ở Quản lý Thành viên.</li>}
          </ul>
          {!singles && draft.picked.length % 2 === 1 && <p className={`${T4} text-amber-300`}>Số VĐV đang lẻ ({draft.picked.length}). Sẽ có 1 người chưa có cặp.</p>}
          <button type="button" className={BTN_PRIMARY} disabled={!unlocked.includes('2.2')} onClick={() => void goPairing()}>
            Tiếp: {singles ? 'Xác nhận danh sách' : 'Ghép cặp'} <ChevronRight className="h-4 w-4" />
          </button>
          {!unlocked.includes('2.2') && <p className={`${T4} -mt-1 text-slate-500`}>Cần ít nhất {minPool} VĐV.</p>}
        </div>
      )}

      {/* -------- 2.2 Ghép cặp -------- */}
      {draft.sub === '2.2' && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className={`${T2} text-white`}>2.2 · Ghép cặp</h3>
            <p className={`${T4} text-slate-500`}>{singles ? 'Đánh đơn: mỗi VĐV là một đội, không cần ghép.' : `${pool.length} VĐV → ${Math.floor(pool.length / 2)} cặp`}</p>
          </div>

          {!singles && (
            <div role="radiogroup" aria-label="Cách ghép cặp" className="grid gap-2 sm:grid-cols-3">
              {([
                { id: 'balanced', icon: Scale, title: 'Cân bằng theo trình', desc: 'Tổng trình các cặp gần bằng nhau nhất.' },
                { id: 'ab', icon: Shuffle, title: 'Cân bằng A-B', desc: '1 VĐV nhóm trên (A) + 1 VĐV nhóm dưới (B), bốc thăm.' },
                { id: 'manual', icon: Hand, title: 'Thủ công', desc: 'Chạm 2 VĐV, hoặc kéo một VĐV thả lên người kia.' },
              ] as const).map((m) => {
                const on = draft.pairMode === m.id;
                const Icon = m.icon;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => runPairing(m.id)}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${on ? 'border-white/30 bg-white/[0.07]' : 'border-white/5 bg-slate-950 hover:border-white/15'}`}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-white' : 'text-slate-500'}`} aria-hidden="true" />
                    <span><span className={`${T3} block text-white`}>{m.title}</span><span className={`${T4} mt-0.5 block text-slate-500`}>{m.desc}</span></span>
                  </button>
                );
              })}
            </div>
          )}

          {!singles && draft.pairMode === 'ab' && (
            <div className={`flex items-center justify-between gap-2 ${SURFACE} px-3 py-2`}>
              <span className={`${T4} text-slate-400`}>Nhóm A: {Math.floor(pool.length / 2)} VĐV trình cao · Nhóm B: {Math.floor(pool.length / 2)} VĐV còn lại</span>
              <button type="button" className={`${BTN_GHOST} min-h-[36px] shrink-0 px-3`} onClick={() => runPairing('ab', draft.abSeed + 1)}><RefreshCw className="h-4 w-4" /> Bốc thăm lại</button>
            </div>
          )}

          {!singles && draft.pairMode === 'manual' && (
            <div className="rounded-xl border border-dashed border-white/10 p-3">
              <p className={`${T4} mb-2 text-slate-400`}>
                {pick ? <>Đã chọn <b className="text-white">{players.find((p) => p.id === pick)?.full_name}</b>. Chạm người đánh cặp.</> : `Chưa ghép: ${unpaired.length} VĐV. Chạm lần lượt 2 người, hoặc kéo một người thả lên người kia.`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unpaired.map((p) => (
                  <button key={p.id} type="button" draggable
                    onDragStart={(e) => { dragPid.current = p.id; e.dataTransfer.setData('text/plain', p.id); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { manualPair(dragPid.current, p.id); dragPid.current = null; }}
                    onClick={() => (pick ? (pick === p.id ? setPick(null) : manualPair(pick, p.id)) : setPick(p.id))}
                    aria-pressed={pick === p.id}
                    className={`min-h-[36px] rounded-lg border px-2.5 ${T3} transition ${pick === p.id ? 'border-white bg-white text-slate-950' : 'border-white/10 bg-slate-950 text-slate-200 hover:border-white/30'}`}>
                    {p.full_name} <span className={`pm-num ${T4} opacity-60`}>{Number(p.skill_rating).toFixed(1)}</span>
                  </button>
                ))}
                {!unpaired.length && <span className={`${T4} text-slate-500`}>Đã ghép hết.</span>}
              </div>
              {unpaired.length >= 2 && (
                <button type="button" className={`${BTN_GHOST} mt-3 min-h-[36px] w-full`} onClick={() => setDraft({ pairs: [...pairs, ...pairBalanced(unpaired, players)], assign: {} })}>
                  <Scale className="h-4 w-4" /> Tự ghép phần còn lại (cân bằng)
                </button>
              )}
            </div>
          )}

          {pairs.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className={`${T4} text-slate-500`}>{pairs.length} {singles ? 'VĐV' : 'CẶP'}</span>
                {!singles && <span className={`pm-num ${T4} text-slate-400`}>Chênh lệch trình TB giữa các cặp: <b className="text-white">{pairSpread(pairs, players).toFixed(2)}</b></span>}
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {pairs.map((pids, i) => (
                  <PairCard key={pids.join('-')} pids={pids} players={players} index={i} tier={draft.pairMode === 'ab' && !singles}
                    onRemove={draft.pairMode === 'manual' ? () => setDraft({ pairs: pairs.filter((_, j) => j !== i), assign: {} }) : undefined} />
                ))}
              </ul>
            </>
          )}
          {!singles && unpaired.length === 1 && draft.pairMode !== 'manual' && <p className={`${T4} text-amber-300`}>{unpaired[0].full_name} chưa có cặp (số VĐV lẻ).</p>}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => setDraft({ sub: '2.1' })}>Quay lại</button>
            <button type="button" className={BTN_PRIMARY} disabled={!unlocked.includes('2.3')} onClick={goGroups}>Tiếp: Chia bảng <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* -------- 2.3 Chia bảng -------- */}
      {draft.sub === '2.3' && pairs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className={`${T2} text-white`}>2.3 · Chia bảng</h3>
            <p className={`${T4} text-slate-500`}>{pairs.length} {singles ? 'VĐV' : 'cặp'} · {groupsOn ? `${numGroups} bảng, Top ${advance} mỗi bảng → ${stageName(numGroups * advance)}` : advance === 2 ? '1 bảng vòng tròn, Top 2 → Chung kết' : '1 bảng vòng tròn, hạng 1 vô địch'}</p>
          </div>
          <Toggle checked={groupsOn} disabled={!groupOpts.length} onChange={(v) => setDraft({ groupsEnabled: v })} label={groupOpts.length ? 'Chia bảng (Bảng A / Bảng B…)' : 'Cần ít nhất 4 đội để chia bảng'} />
          <div className="grid grid-cols-2 gap-3">
            {groupsOn && (
              <Field label="SỐ BẢNG">
                <Segmented full value={numGroups} onChange={(g) => setDraft({ numGroups: g, groupMode: 'auto', assign: autoAssign(g) })} options={groupOpts.map((g) => ({ id: g, label: `${g} bảng` }))} />
              </Field>
            )}
            <Field label={groupsOn ? 'ĐI TIẾP MỖI BẢNG' : 'SỐ ĐỘI ĐI TIẾP'}>
              <Segmented full value={advance} onChange={(a) => setDraft({ advance: a })} options={advanceOpts.map((a) => ({ id: a, label: `Top ${a}` }))} />
            </Field>
          </div>
          {groupsOn && (
            <Segmented full value={draft.groupMode} onChange={(v) => setDraft(v === 'auto' ? { groupMode: v, assign: autoAssign() } : { groupMode: v })}
              options={[{ id: 'auto', label: 'Tự động cân bằng', icon: Scale }, { id: 'manual', label: 'Thủ công', icon: Hand }]} />
          )}

          <div className={`grid gap-3 ${groupsOn ? 'sm:grid-cols-2' : ''}`}>
            {(groupsOn ? labels : [null]).map((g) => {
              const idxs = pairs.map((_, i) => i).filter((i) => !g || assign[i] === g);
              const avg = idxs.length ? idxs.reduce((s, i) => s + teamAvgOf(pairs[i]), 0) / idxs.length : 0;
              return (
                <div key={g ?? 'all'}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const i = e.dataTransfer.getData('text/plain');
                    if (g && i !== '') setDraft({ assign: { ...assign, [Number(i)]: g }, groupMode: 'manual' });
                  }}
                  className={`rounded-xl border bg-slate-950 ${g && idxs.length < 2 ? 'border-rose-500/40' : 'border-white/5'}`}>
                  <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                    <span className={`${T2} text-white`}>{g ? `Bảng ${g}` : 'Bảng chung'}</span>
                    <span className={`pm-num ${T4} text-slate-400`}>{idxs.length} đội · TB {avg.toFixed(2)}</span>
                  </div>
                  <ul className="flex min-h-[64px] flex-col gap-1 p-2">
                    {idxs.map((i) => (
                      <li key={i} draggable={!!g} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))} className="flex min-h-[40px] items-center gap-2 rounded-lg bg-white/[0.03] px-2">
                        {g && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-600" aria-hidden="true" />}
                        <span className={`${T3} flex-1 truncate text-slate-200`}>{teamName({ pids: pairs[i] }, players)}</span>
                        <span className={`pm-num ${T4} text-slate-500`}>{teamAvgOf(pairs[i]).toFixed(2)}</span>
                        {g && (
                          <select aria-label="Chuyển bảng" value={assign[i]} onChange={(e) => setDraft({ assign: { ...assign, [i]: e.target.value }, groupMode: 'manual' })}
                            className={`h-8 rounded-md border border-white/10 bg-slate-950 px-1 ${T4} text-slate-200`}>
                            {labels.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        )}
                      </li>
                    ))}
                    {!idxs.length && <li className={`${T4} py-4 text-center text-slate-600`}>Kéo đội vào đây</li>}
                  </ul>
                </div>
              );
            })}
          </div>
          {!groupsValid && <p className={`${T4} text-rose-300`}>Mỗi bảng cần ít nhất 2 đội.</p>}
          {confirm ? (
            <Confirm
              text={`Tạo lịch vòng bảng mới cho ${ev.label} (${pairs.length} ${singles ? 'VĐV' : 'cặp'})?${doneInEvent ? ` ${doneInEvent} kết quả đã nhập của nội dung này sẽ bị xoá.` : ''}`}
              confirmLabel="Áp dụng" busy={busy} onConfirm={() => void apply()} onCancel={() => setConfirm(false)} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={BTN_GHOST} onClick={() => setDraft({ sub: '2.2' })}>Quay lại</button>
              <button type="button" className={BTN_PRIMARY} disabled={!groupsValid} onClick={() => setConfirm(true)}>Áp dụng & tạo lịch</button>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

/* ======================= STEP 3 — Điều hành & Knockout ======================= */
function CourtRow({ vm, court, toast, onOpen }: { vm: TournamentVM; court: { name: string; matchId: string | null }; toast: Toast; onOpen: (matchId: string) => void }) {
  const saved = vm.rules.referees?.[court.name] ?? '';
  const [ref, setRef] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRef(saved); }, [saved]);
  const m = court.matchId ? vm.matches.find((x) => x.id === court.matchId) : undefined;
  const dirty = ref.trim() !== saved;

  return (
    <div className="flex flex-col">
      {m ? <ScoreStrip m={m} vm={vm} onOpen={() => onOpen(m.id)} showEvent={vm.events.length > 1} /> : (
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span className={`${T3} text-slate-400`}>{court.name} · sân trống</span>
          {!vm.locked && (
            <button type="button" className={`${BTN_GHOST} min-h-[36px] px-3`} disabled={busy}
              onClick={async () => {
                setBusy(true);
                await run(async () => {
                  const id = await callNextMatch(vm.tournament.id, court.name);
                  toast(id ? `${court.name}: đã gọi trận kế tiếp` : 'Không còn trận nào đang chờ (hoặc các đội đang bận).', id ? 'ok' : 'error');
                }, toast);
                setBusy(false);
              }}>
              <Play className="h-4 w-4" /> Gọi trận kế tiếp
            </button>
          )}
        </div>
      )}
      <form
        className="flex items-center gap-2 px-4 pb-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty) return;
          setBusy(true);
          await run(() => assignCourtReferee(vm.tournament, court.name, ref), toast, ref.trim() ? `${court.name}: trọng tài ${ref.trim()}` : `${court.name}: đã bỏ trọng tài`);
          setBusy(false);
        }}
      >
        <UserRound className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <label htmlFor={`pm-ref-${court.name}`} className="sr-only">Trọng tài {court.name}</label>
        <input id={`pm-ref-${court.name}`} className={`${INPUT} min-h-[36px]`} value={ref} maxLength={60} placeholder={`Trọng tài ${court.name}`} disabled={vm.locked} onChange={(e) => setRef(e.target.value)} />
        <button type="submit" disabled={!dirty || busy || vm.locked} className={`${BTN_GHOST} min-h-[36px] shrink-0 px-3`}>Lưu</button>
      </form>
    </div>
  );
}

function Step3({ vm, ev, auth, toast }: { vm: TournamentVM; ev: EventVM; auth: AuthState; toast: Toast }) {
  const engine = useStandingsEngine(vm.tournament.id);
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openMatch = openId ? vm.matches.find((m) => m.id === openId) : undefined;

  const groupMs = vm.matches.filter((m) => m.eventId === ev.id && m.type === 'group');
  const groupDoneN = groupMs.filter((m) => m.status === 'completed').length;
  const groupDone = groupMs.length > 0 && groupDoneN === groupMs.length;
  const hasKnockout = vm.matches.some((m) => m.eventId === ev.id && m.type !== 'group');
  const qualifiers = qualifiersOf(ev.config);
  const stage = stageName(qualifiers);
  const ties = engine.knockoutFor(ev.id);
  const br = engine.bracketFor(ev.id);
  const liveN = vm.courts.filter((c) => c.matchId).length;
  const unfinished = vm.matches.filter((m) => m.status !== 'completed').length;

  const act = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    await run(fn, toast, okMsg);
    setBusy(null);
    setConfirm(null);
  };

  const makeKnockout = () => act('ko', async () => {
    const pairs = ties.filter((t) => t[0].team && t[1].team).map((t) => [t[0].team!.id, t[1].team!.id] as [string, string]);
    if (!pairs.length) throw new Error('Chưa đủ đội để tạo lịch loại trực tiếp.');
    await createKnockout({ tournamentId: vm.tournament.id, eventId: ev.id, type: stageType(qualifiers), pairs, orderOffset: eventOffset(vm, ev.id) + 900 });
  }, `${ev.label}: đã tạo lịch ${stage}`);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className={`${T4} text-slate-500`}>TIẾN ĐỘ VÒNG BẢNG · {ev.label.toUpperCase()}</span><span className={`pm-num ${T4} text-slate-300`}>{groupDoneN}/{groupMs.length}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-slate-300 transition-all" style={{ width: `${groupMs.length ? (groupDoneN / groupMs.length) * 100 : 0}%` }} /></div>
      </div>

      <StripGroup title="Sân & Trọng tài" right={liveN ? <LiveBadge label={`${liveN} SÂN`} /> : <span className={`${T4} text-slate-500`}>{vm.courts.length} sân</span>}>
        {vm.courts.map((c) => <CourtRow key={c.name} vm={vm} court={c} toast={toast} onOpen={setOpenId} />)}
      </StripGroup>
      <p className={`${T4} -mt-2 px-1 text-slate-500`}>Trọng tài của sân sẽ tự gán cho mỗi trận lên sân đó. Nhập điểm ở tab Trọng Tài.</p>

      <div className="flex flex-col gap-2">
        <span className={`${T4} text-slate-500`}>VÒNG LOẠI TRỰC TIẾP</span>
        <Bracket vm={vm} ev={ev} engine={engine} />
      </div>

      {!vm.locked && !hasKnockout && ties.length > 0 && (
        <button type="button" className={BTN_PRIMARY} disabled={!groupDone || busy === 'ko'} onClick={() => void makeKnockout()}>
          <GitBranch className="h-4 w-4" /> {busy === 'ko' ? 'Đang tạo…' : `Tạo lịch ${stage} (${ties.map((t) => `${t[0].label}–${t[1].label}`).join(', ')})`}
        </button>
      )}
      {!vm.locked && !hasKnockout && ties.length > 0 && !groupDone && <p className={`${T4} -mt-2 text-slate-500`}>Nút sẽ mở khi vòng bảng có đủ kết quả.</p>}

      {!vm.locked && br && br.semis.length === 2 && !br.final && !br.bronze && (
        <div className={`rounded-xl border p-3 ${br.canCreateFinals ? 'border-white/20 bg-white/[0.04]' : 'border-white/5'}`}>
          <div className="flex flex-col gap-1.5">
            {br.semis.map((m, i) => {
              const winner = m.status === 'completed' ? vm.teams.find((t) => t.id === (m.sa > m.sb ? m.a : m.b)) : undefined;
              return (
                <p key={m.id} className={`${T3} flex items-center gap-2 ${winner ? 'text-slate-200' : 'text-slate-500'}`}>
                  {winner ? <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-white/10" />}
                  <span className="truncate">Bán kết {i + 1}: {winner ? <>Thắng — <b className="text-white">{teamName(winner, vm.players)}</b></> : 'đang chờ kết quả'}</span>
                </p>
              );
            })}
          </div>
          <button type="button" disabled={!br.canCreateFinals || busy === 'finals'} className={`mt-3 w-full ${BTN_PRIMARY}`}
            onClick={() => void act('finals', async () => { await unwrap(createFinals(ev.id)); await refreshTournament(vm.tournament.id); }, `${ev.label}: đã tạo trận Chung kết & Tranh hạng 3`)}>
            <Trophy className="h-4 w-4" /> {busy === 'finals' ? 'Đang tạo…' : 'Tạo trận Chung kết & Tranh Hạng 3'}
          </button>
          {!br.canCreateFinals && <p className={`${T4} mt-1.5 text-slate-500`}>Nút sẽ mở khi cả 2 trận Bán kết có kết quả.</p>}
        </div>
      )}

      {vm.locked ? (
        <>
          <p className={`flex items-center gap-2 ${SURFACE} px-3 py-3 ${T3} text-slate-300`}>
            <Lock className="h-4 w-4 shrink-0 text-amber-300" /> Kết quả đã khoá. Khán giả xem được Bảng Vàng Vinh Danh.
          </p>
          {auth.isAdmin && (confirm === 'reopen' ? (
            <Confirm text="Mở lại giải để sửa kết quả? Trọng tài sẽ nhập điểm lại được." confirmLabel="Mở lại giải" busy={busy === 'reopen'}
              onCancel={() => setConfirm(null)}
              onConfirm={() => void act('reopen', async () => { await unwrap(reopenTournament(vm.tournament.id)); await refreshTournament(vm.tournament.id); }, 'Đã mở lại giải đấu')} />
          ) : (
            <button type="button" className={BTN_GHOST} onClick={() => setConfirm('reopen')}><LockOpen className="h-4 w-4" /> Mở lại giải (Admin)</button>
          ))}
        </>
      ) : confirm === 'close' ? (
        <Confirm danger busy={busy === 'close'}
          text={unfinished ? `Còn ${unfinished} trận chưa có kết quả. Sau khi đóng, không ai sửa được điểm nữa. Tiếp tục?` : 'Đóng giải và khoá toàn bộ kết quả? Bảng Vàng Vinh Danh sẽ mở cho khán giả.'}
          confirmLabel="Đóng giải"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void act('close', async () => { await unwrap(completeTournament(vm.tournament.id)); await refreshTournament(vm.tournament.id); }, 'Đã đóng giải. Bảng Vàng đã mở!')} />
      ) : (
        <button type="button" className={BTN_DANGER} onClick={() => setConfirm('close')}><Lock className="h-4 w-4" /> Đóng / Kết thúc Giải đấu</button>
      )}
      {openMatch && <MatchDrawer m={openMatch} vm={vm} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ======================= Dashboard ======================= */
export default function AdminDashboard({
  vm, auth, ui, setUi, toast, drafts, setDrafts, onOpenTournaments,
}: {
  vm: TournamentVM | null;
  auth: AuthState;
  ui: UIState;
  setUi: (patch: Partial<UIState>) => void;
  toast: Toast;
  drafts: Record<string, BtcDraft>;
  setDrafts: (fn: (d: Record<string, BtcDraft>) => Record<string, BtcDraft>) => void;
  onOpenTournaments: () => void;
}) {
  const hasSchedule = !!vm?.matches.length;
  const [step, setStep] = useState<number>(() => (!vm?.events.length ? 1 : hasSchedule ? 3 : 2));
  const tid = vm?.tournament.id;
  useEffect(() => { setStep(!vm?.events.length ? 1 : vm?.matches.length ? 3 : 2); }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps

  const ev = useMemo(() => vm?.events.find((e) => e.id === ui.adminEvent) ?? vm?.events[0], [vm?.events, ui.adminEvent]);

  if (!auth.isOrganizer) {
    return (
      <Empty>
        <Lock className="mx-auto mb-2 h-6 w-6 text-slate-500" />
        Dành cho Ban tổ chức. Đăng nhập bằng Gmail đã được Admin cấp quyền BTC.
      </Empty>
    );
  }
  if (!vm) {
    return (
      <Empty>
        <p>Chưa có giải nào đang mở.</p>
        <button type="button" className={`${BTN_PRIMARY} mt-4`} onClick={onOpenTournaments}><Plus className="h-4 w-4" /> Tạo giải trong Quản lý giải đấu</button>
      </Empty>
    );
  }

  const tag = STATUS_TAG[statusTagOf(vm.tournament)];
  const draft = ev ? drafts[ev.id] ?? initDraft(vm, ev) : null;
  const setDraft = (patch: Partial<BtcDraft>) => {
    if (!ev || !draft) return;
    setDrafts((d) => ({ ...d, [ev.id]: { ...(d[ev.id] ?? draft), ...patch } }));
  };
  const clearDraft = () => ev && setDrafts((d) => { const n = { ...d }; delete n[ev.id]; return n; });
  const teamsN = ev ? vm.teams.filter((t) => t.eventId === ev.id).length : 0;
  const liveN = vm.courts.filter((c) => c.matchId).length;
  const groupMs = vm.matches.filter((m) => m.type === 'group');
  const toggle = (n: number) => setStep(step === n ? 0 : n);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${T4} text-slate-500`}>{auth.isAdmin ? 'ADMIN · BAN TỔ CHỨC' : 'BAN TỔ CHỨC'}</p>
          <h1 className={`${T1} truncate text-white`}>{vm.tournament.title}</h1>
        </div>
        <span className={`${T4} shrink-0 rounded-md px-2 py-1 ${tag.cls}`}>{tag.label}</span>
      </div>
      {vm.locked && (
        <div role="status" className={`flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 ${T3} text-amber-200`}>
          <Lock className="h-4 w-4 shrink-0" /> Giải đã khoá. {auth.isAdmin ? 'Mở lại ở Bước 3 hoặc Quản lý giải đấu nếu cần sửa.' : 'Chỉ Admin mở lại được.'}
        </div>
      )}
      {vm.events.length > 1 && (
        <Segmented full label="Nội dung đang điều hành" value={ev?.id ?? ''} onChange={(v) => setUi({ adminEvent: v })} options={vm.events.map((e) => ({ id: e.id, label: e.short || e.label }))} />
      )}

      <StepShell n={1} title="Cấu hình Giải & Thể lệ"
        desc={`${vm.rules.courts.length} sân · ${vm.rules.target} điểm, cách ${vm.rules.winBy} · ${vm.events.length} nội dung`}
        done={vm.events.length > 0} open={step === 1} onToggle={() => toggle(1)}>
        <Step1 vm={vm} toast={toast} onDone={() => setStep(2)} />
      </StepShell>

      <StepShell n={2} title="VĐV & Chia Bảng"
        desc={ev ? `${ev.label} · ${teamsN} ${ev.singles ? 'VĐV' : 'cặp'} · ${ev.config.groupsEnabled ? `${groupsOfEvent(ev).length} bảng` : '1 bảng'}` : 'Thêm nội dung thi đấu ở Bước 1'}
        done={teamsN > 0} open={step === 2} onToggle={() => toggle(2)}>
        {ev && draft ? (
          <Step2 key={ev.id} vm={vm} ev={ev} draft={draft} setDraft={setDraft} clearDraft={clearDraft} toast={toast} onApplied={() => setStep(3)} />
        ) : <p className={`${T3} text-slate-500`}>Chưa có nội dung thi đấu. Thêm ở Bước 1.</p>}
      </StepShell>

      <StepShell n={3} title="Điều hành & Knockout"
        desc={`${liveN}/${vm.courts.length} sân đang đấu · ${groupMs.filter((m) => m.status === 'completed').length}/${groupMs.length} trận vòng bảng`}
        done={vm.locked} open={step === 3} onToggle={() => toggle(3)}>
        {ev ? <Step3 key={ev.id} vm={vm} ev={ev} auth={auth} toast={toast} /> : <p className={`${T3} text-slate-500`}>Chưa có nội dung thi đấu.</p>}
      </StepShell>
    </div>
  );
}
