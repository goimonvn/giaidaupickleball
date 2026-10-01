'use client';

import { CalendarClock, Check, ChevronDown, Repeat, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { patchRules, rescheduleMatches, setCheckin, setCheckinMany, substitutePlayer, walkoverMatch } from '@/lib/client-actions';
import { dateInputOf, fmtHM, startsAtOf, teamName, timeInputOf } from '@/lib/engine';
import type { EventVM, MatchVM, TeamVM, TournamentVM } from '@/lib/types';
import {
  BTN_GHOST, BTN_PRIMARY, CARD, Confirm, DATE_INPUT, Field, INPUT, Segmented, Sheet, StripGroup, SURFACE, T2, T3, T4, Toggle, type Toast,
} from './kit';

/* =====================================================================
   Ngày thi đấu (BTC · Bước 3): Điểm danh VĐV, xử thua do vắng, thay người, Dời lịch.
   ===================================================================== */

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Next match of a team that hasn't been played yet (live first, then by schedule order). */
function nextMatchOf(vm: TournamentVM, teamId: string): MatchVM | undefined {
  const mine = vm.matches.filter((m) => (m.a === teamId || m.b === teamId) && m.status !== 'completed');
  return mine.find((m) => m.status === 'live') ?? mine.sort((a, b) => a.order - b.order)[0];
}

/* ---------------------------- Điểm danh ---------------------------- */
export function CheckInPanel({ vm, ev, toast }: { vm: TournamentVM; ev: EventVM; toast: Toast }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [walkover, setWalkover] = useState<string | null>(null); // team id being forfeited
  const [swap, setSwap] = useState<{ team: string; pid: string } | null>(null);
  const [swapTo, setSwapTo] = useState('');

  const present = useMemo(() => new Set(vm.checkedInIds), [vm.checkedInIds]);
  const teams = vm.teams.filter((t) => t.eventId === ev.id).sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.seed ?? 99) - (b.seed ?? 99));
  const pids = teams.flatMap((t) => t.pids);
  const presentN = pids.filter((id) => present.has(id)).length;
  const allIn = pids.length > 0 && presentN === pids.length;
  // Collapsed when everyone is already here (on open, and right after "Có mặt tất cả")
  const [collapsed, setCollapsed] = useState(allIn);
  const teamOk = (t: TeamVM) => t.pids.every((id) => present.has(id));
  const shown = onlyAbsent ? teams.filter((t) => !teamOk(t)) : teams;
  const inEvent = new Set(pids);
  const freeMembers = vm.players.filter((p) => !inEvent.has(p.id));
  const locked = vm.locked;

  const toggle = async (pid: string) => {
    setBusy(pid);
    try { await setCheckin(vm.tournament.id, pid, !present.has(pid)); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };
  const allPresent = async () => {
    setBusy('all');
    try {
      await setCheckinMany(vm.tournament.id, pids.filter((x) => !present.has(x)), true);
      toast(`${ev.label}: đã điểm danh tất cả VĐV`);
      setCollapsed(true);
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };
  const setRule = async (v: boolean) => {
    setBusy('rule');
    try { await patchRules(vm.tournament.id, { checkIn: v }); toast(v ? 'Chỉ gọi trận khi đủ VĐV có mặt' : 'Gọi trận không cần điểm danh'); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };
  const forfeit = async (t: TeamVM, m: MatchVM) => {
    setBusy(`wo-${t.id}`);
    try {
      await walkoverMatch(vm.tournament.id, m.id, m.a === t.id ? 'B' : 'A');
      toast(`${teamName(t, vm.players)} bị xử thua do vắng mặt`);
      setWalkover(null);
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };
  const doSwap = async () => {
    if (!swap || !swapTo) return;
    setBusy('swap');
    try {
      await substitutePlayer(vm.tournament.id, swap.team, swap.pid, swapTo);
      toast('Đã thay người');
      setSwap(null);
      setSwapTo('');
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };

  if (collapsed) {
    return (
      <button type="button" onClick={() => setCollapsed(false)} aria-expanded={false}
        className={`${CARD} flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${allIn ? 'bg-slate-100 text-slate-950' : 'border border-white/10 text-slate-400'}`}>
          {allIn ? <Check className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`${T2} block text-slate-100`}>Điểm danh · {ev.label}</span>
          <span className={`${T4} block text-slate-500`}>
            {allIn ? `Đủ ${presentN}/${pids.length} VĐV có mặt` : `${presentN}/${pids.length} có mặt · còn ${pids.length - presentN} VĐV chưa điểm danh`}
            {vm.rules.checkIn ? ' · chỉ gọi trận khi đủ người' : ''}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
    );
  }

  return (
    <StripGroup title={`Điểm danh · ${ev.label}`} right={
      <button type="button" onClick={() => setCollapsed(true)} aria-expanded className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 ${T4} text-slate-400 hover:bg-white/5 hover:text-white`}>
        <span className="pm-num">{presentN}/{pids.length} có mặt</span><ChevronDown className="h-4 w-4 rotate-180" /><span className="sr-only">Thu gọn</span>
      </button>
    }>
      <div className="flex flex-col gap-2 px-4 py-3">
        <Toggle checked={!!vm.rules.checkIn} disabled={locked || busy === 'rule'} onChange={(v) => void setRule(v)} label="Chỉ gọi trận lên sân khi đủ VĐV có mặt" />
        <div className="flex items-center justify-between gap-2">
          <Segmented value={onlyAbsent ? 'absent' : 'all'} onChange={(v) => setOnlyAbsent(v === 'absent')}
            options={[{ id: 'all', label: 'Tất cả', count: teams.length }, { id: 'absent', label: 'Còn thiếu', count: teams.filter((t) => !teamOk(t)).length }]} />
          {presentN < pids.length && !locked && (
            <button type="button" className={`${BTN_GHOST} min-h-[36px] px-3`} disabled={busy === 'all'} onClick={() => void allPresent()}>
              <Check className="h-4 w-4" /> {busy === 'all' ? 'Đang lưu…' : 'Có mặt tất cả'}
            </button>
          )}
        </div>
      </div>

      {shown.map((t) => {
        const next = nextMatchOf(vm, t.id);
        const opp = next ? vm.teams.find((x) => x.id === (next.a === t.id ? next.b : next.a)) : undefined;
        return (
          <div key={t.id} className="flex flex-col gap-2 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`${T4} w-10 shrink-0 text-slate-500`}>{t.group ? `Bảng ${t.group}` : ''}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {t.pids.map((pid) => {
                  const p = vm.players.find((x) => x.id === pid);
                  const on = present.has(pid);
                  return (
                    <span key={pid} className="inline-flex items-center">
                      <button type="button" disabled={locked || busy === pid} aria-pressed={on} onClick={() => void toggle(pid)}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-l-lg border px-2.5 ${T3} transition disabled:opacity-50 ${on ? 'border-white/30 bg-white/10 text-white' : 'border-dashed border-white/15 text-slate-400'}`}>
                        {on ? <Check className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}{p?.full_name ?? '?'}
                      </button>
                      <button type="button" disabled={locked} aria-label={`Thay ${p?.full_name ?? 'VĐV'}`} title="Thay người"
                        onClick={() => { setSwap({ team: t.id, pid }); setSwapTo(''); }}
                        className={`flex min-h-[36px] w-8 items-center justify-center rounded-r-lg border border-l-0 text-slate-500 hover:text-white disabled:opacity-40 ${on ? 'border-white/30' : 'border-dashed border-white/15'}`}>
                        <Repeat className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
              {!teamOk(t) && next && !locked && walkover !== t.id && (
                <button type="button" className={`h-9 shrink-0 rounded-lg px-2.5 ${T4} text-rose-300 hover:bg-rose-500/10`} onClick={() => setWalkover(t.id)}>Xử thua</button>
              )}
            </div>

            {walkover === t.id && next && (
              <Confirm danger busy={busy === `wo-${t.id}`}
                text={`Xử ${teamName(t, vm.players)} thua trận gặp ${teamName(opp, vm.players)} (${vm.rules.target}–0 cho đối thủ) do vắng mặt?`}
                confirmLabel="Xử thua" onCancel={() => setWalkover(null)} onConfirm={() => void forfeit(t, next)} />
            )}

            {swap?.team === t.id && (
              <div className={`${SURFACE} flex flex-col gap-2 p-2`}>
                <label htmlFor={`pm-swap-${t.id}`} className={`${T4} text-slate-500`}>
                  THAY {vm.players.find((x) => x.id === swap.pid)?.full_name?.toUpperCase()} BẰNG
                </label>
                <select id={`pm-swap-${t.id}`} className={INPUT} value={swapTo} onChange={(e) => setSwapTo(e.target.value)}>
                  <option value="">Chọn thành viên…</option>
                  {freeMembers.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {Number(p.skill_rating).toFixed(1)}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={`${BTN_GHOST} min-h-[36px]`} onClick={() => setSwap(null)}>Huỷ</button>
                  <button type="button" className={`${BTN_PRIMARY} min-h-[36px]`} disabled={!swapTo || busy === 'swap'} onClick={() => void doSwap()}>
                    {busy === 'swap' ? 'Đang lưu…' : 'Thay người'}
                  </button>
                </div>
                <p className={`${T4} text-slate-500`}>Kết quả các trận đã đấu của đội vẫn giữ nguyên.</p>
              </div>
            )}
          </div>
        );
      })}
      {!shown.length && <p className={`px-4 py-6 text-center ${T3} text-slate-500`}>{teams.length ? 'Tất cả các đội đã đủ người.' : 'Nội dung này chưa có đội.'}</p>}
    </StripGroup>
  );
}

/* ---------------------------- Dời lịch ---------------------------- */
const roundUp5 = (d: Date) => { const x = new Date(d); x.setSeconds(0, 0); x.setMinutes(Math.ceil(x.getMinutes() / 5) * 5); return x; };

export function RescheduleSheet({ vm, toast, onClose }: { vm: TournamentVM; toast: Toast; onClose: () => void }) {
  const initial = useMemo(() => {
    const planned = vm.tournament.starts_at ? new Date(vm.tournament.starts_at) : null;
    const now = roundUp5(new Date());
    return planned && planned > now ? planned : now;
  }, [vm.tournament.starts_at]);
  const [date, setDate] = useState(dateInputOf(initial.toISOString()));
  const [time, setTime] = useState(timeInputOf(initial.toISOString()));
  const [slot, setSlot] = useState(vm.rules.slotMinutes ?? 20);
  const [busy, setBusy] = useState(false);

  const upcoming = vm.matches.filter((m) => m.status === 'upcoming').length;
  const live = vm.matches.filter((m) => m.status === 'live').length;
  const courts = Math.max(1, vm.courts.length);
  const startIso = startsAtOf(date, time);
  const end = startIso && upcoming ? new Date(new Date(startIso).getTime() + Math.ceil(upcoming / courts) * slot * 60_000) : null;

  const apply = async () => {
    if (!startIso) return;
    setBusy(true);
    try {
      const n = await rescheduleMatches(vm.tournament.id, new Date(startIso), slot);
      toast(`Đã dời lịch ${n} trận chưa đấu`);
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  return (
    <Sheet title="Dời lịch" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className={`${T3} text-slate-400`}>Tính lại giờ dự kiến của {upcoming} trận chưa đấu theo {courts} sân. Trận đang đấu và kết quả đã nhập giữ nguyên.</p>
        {live > 0 && <p className={`${T4} -mt-1 text-amber-300`}>Đang có {live} trận trên sân: chọn giờ bắt đầu sau khi các trận này dự kiến xong.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="NGÀY" htmlFor="pm-rs-date"><input id="pm-rs-date" type="date" className={DATE_INPUT} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="TRẬN KẾ TIẾP BẮT ĐẦU LÚC" htmlFor="pm-rs-time"><input id="pm-rs-time" type="time" step={300} className={DATE_INPUT} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="MỖI TRẬN (GỒM NGHỈ GIỮA TRẬN)">
          <Segmented full value={slot} onChange={setSlot} options={[15, 20, 25, 30].map((n) => ({ id: n, label: `${n} phút` }))} />
        </Field>
        {end && (
          <p className={`${T4} rounded-lg bg-slate-950 px-3 py-2 text-slate-300`}>
            {courts} trận đầu lúc {fmtHM(startIso)}, mỗi lượt cách {slot} phút · dự kiến xong khoảng <b className="pm-num text-white">{fmtHM(end.toISOString())}</b>
          </p>
        )}
        <button type="button" className={BTN_PRIMARY} disabled={!startIso || !upcoming || busy} onClick={() => void apply()}>
          <CalendarClock className="h-4 w-4" /> {busy ? 'Đang dời lịch…' : 'Dời lịch'}
        </button>
      </div>
    </Sheet>
  );
}
