'use client';

import { Activity, CheckCircle2, ClipboardEdit, Clock, Lock, Minus, Play, Plus, RefreshCw, Undo2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { callNextMatch, finalizeMatch, matchAction } from '@/lib/client-actions';
import { isGameOver, scoreCall, stageLabelOf, teamName } from '@/lib/engine';
import type { AuthState } from '@/lib/supabase';
import type { CourtVM, MatchActionType, MatchVM, TournamentVM, UIState } from '@/lib/types';
import {
  BTN_GHOST, BTN_PRIMARY, CARD, Confirm, Empty, INPUT, LiveBadge, Segmented, ServeDot, StripGroup, SURFACE, T2, T3, T4,
  type Toast,
} from './kit';
import { ScoreStrip } from './PublicView';

/* =====================================================================
   Trọng Tài — nhập điểm (approved v4 demo skin)
   · Từng quả: +1 điểm, người giao, đổi giao, hủy quả, kết thúc trận (RPC có khoá dòng)
   · Kết quả nhanh: chọn trận, nhập tỉ số chung cuộc
   Exception to the type scale: the big score digits, so the referee can read them at a glance.
   ===================================================================== */

/* ======================= Live point-by-point pad ======================= */
function ScorePad({ court, vm, hiddenOnMobile, toast }: { court: CourtVM; vm: TournamentVM; hiddenOnMobile: boolean; toast: Toast }) {
  const match = vm.matches.find((m) => m.id === court.matchId);
  const [confirm, setConfirm] = useState(false);
  const [bump, setBump] = useState<'A' | 'B' | null>(null);
  const [busy, setBusy] = useState(false);
  const rules = vm.rules;
  const wrap = `${hiddenOnMobile ? 'hidden lg:block' : ''} w-full`;

  const run = async (action: MatchActionType) => {
    if (!match) return;
    try {
      await matchAction(vm.tournament.id, match.id, action);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (!match) {
    const pending = vm.matches.some((m) => m.status === 'upcoming');
    return (
      <div className={wrap}>
        <div className={`${CARD} flex flex-col items-center gap-3 p-8 text-center`}>
          <p className={`${T2} text-white`}>{court.name}</p>
          <p className={`${T3} text-slate-400`}>{pending ? 'Sân đang trống. Gọi trận kế tiếp có đội rảnh.' : 'Sân đang trống. Không còn trận nào chờ.'}</p>
          {pending && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const id = await callNextMatch(vm.tournament.id, court.name);
                  if (!id) toast('Chưa có trận nào sẵn sàng (các đội còn lại đang thi đấu).', 'error');
                } catch (e) {
                  toast((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
              className={BTN_PRIMARY}
            >
              <Play className="h-4 w-4" /> {busy ? 'Đang gọi…' : 'Gọi trận kế tiếp'}
            </button>
          )}
        </div>
      </div>
    );
  }

  const A = vm.teams.find((t) => t.id === match.a);
  const B = vm.teams.find((t) => t.id === match.b);
  const ev = vm.events.find((e) => e.id === match.eventId);
  const singles = !!ev?.singles;
  const over = isGameOver(match.sa, match.sb, rules);
  const gamePoint = (s: number, o: number) => !over && s >= rules.target - 1 && s - o >= rules.winBy - 1;
  const winner = match.sa > match.sb ? A : B;

  const point = (side: 'A' | 'B') => {
    void run(side === 'A' ? 'point_a' : 'point_b');
    setBump(side);
    setTimeout(() => setBump(null), 360);
  };

  const end = async () => {
    setBusy(true);
    try {
      await finalizeMatch(vm.tournament.id, match.id, match.sa, match.sb);
      setConfirm(false);
      toast(`${court.name}: đã lưu kết quả ${Math.max(match.sa, match.sb)}–${Math.min(match.sa, match.sb)}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const panel = (key: 'A' | 'B', team: typeof A, score: number, other: number) => {
    const serving = match.serving === key;
    return (
      <div className={`rounded-xl border bg-slate-950 p-3 ${serving ? 'border-[#84CC16]/30' : 'border-white/5'}`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={`${T4} text-slate-500`}>ĐỘI {key}</p>
            <p className={`${T2} truncate text-white`}>{teamName(team, vm.players)}</p>
            <p className={`${T4} mt-0.5 flex h-4 items-center gap-1.5 text-slate-400`}>
              {serving ? <><ServeDot /> {singles ? 'Đang giao bóng' : `Giao bóng ${match.server}`}</> : 'Đỡ giao'}
              {gamePoint(score, other) && <span className="rounded bg-amber-500/15 px-1.5 text-amber-300">GAME POINT</span>}
            </p>
          </div>
          {/* Exception to the type scale: glanceable referee score */}
          <span className={`pm-num w-16 text-right text-5xl font-extrabold leading-none text-[#84CC16] ${bump === key ? 'pm-pop' : ''}`} aria-live="polite">{score}</span>
        </div>
        <button type="button" onClick={() => point(key)} disabled={over} className={`mt-3 ${BTN_PRIMARY} h-14 w-full`}>
          <Plus className="h-5 w-5" /> 1 điểm Đội {key}
        </button>
      </div>
    );
  };

  return (
    <div className={wrap}>
      <div className={`${CARD} flex flex-col gap-3 p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`${T2} text-white`}>{court.name}</p>
            <p className={`${T4} truncate text-slate-500`}>
              {[ev?.short, stageLabelOf(match), `Tới ${rules.target}, cách ${rules.winBy}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <LiveBadge label={`LIVE · Hiệp ${match.game}`} />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
          <span className={`${T4} text-slate-500`}>GỌI ĐIỂM</span>
          <span className={`pm-num ${T2} text-slate-100`}>{scoreCall(match, singles)}</span>
        </div>

        {panel('A', A, match.sa, match.sb)}
        {panel('B', B, match.sb, match.sa)}

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => void run('toggle_server')} disabled={singles} className={`${BTN_GHOST} h-14 flex-col gap-0.5 px-2`}>
            <span className={`pm-num ${T2}`}>{match.server === 1 ? '1→2' : '2→1'}</span>
            <span className={`${T4} text-slate-500`}>Người giao</span>
          </button>
          <button type="button" onClick={() => void run('side_out')} className={`${BTN_GHOST} h-14 flex-col gap-0.5 px-2`}>
            <RefreshCw className="h-4 w-4" />
            <span className={`${T4} text-slate-500`}>Đổi giao</span>
          </button>
          <button type="button" onClick={() => void run('undo')} disabled={match.historyLength === 0} className={`${BTN_GHOST} h-14 flex-col gap-0.5 px-2`}>
            <Undo2 className="h-4 w-4" />
            <span className={`${T4} text-slate-500`}>Hủy quả</span>
          </button>
        </div>

        {confirm ? (
          <Confirm
            busy={busy}
            text={match.sa === match.sb
              ? `Tỉ số đang hoà ${match.sa}–${match.sb}. Cần có đội thắng trước khi kết thúc.`
              : `Xác nhận ${teamName(winner, vm.players)} thắng ${Math.max(match.sa, match.sb)}–${Math.min(match.sa, match.sb)}?${over ? '' : ` Chưa đạt ${rules.target} điểm cách ${rules.winBy}.`}`}
            confirmLabel="Lưu & gọi trận kế"
            onConfirm={() => { if (match.sa !== match.sb) void end(); }}
            onCancel={() => setConfirm(false)}
          />
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className={over ? BTN_PRIMARY : BTN_GHOST}>
            <CheckCircle2 className="h-4 w-4" /> Kết thúc trận
          </button>
        )}

        <p className={`${T4} flex items-center gap-1.5 text-slate-500`}>
          <UserRound className="h-3.5 w-3.5" /> Trọng tài: <span className="text-slate-300">{match.referee ?? 'Chưa phân công'}</span>
        </p>
      </div>
    </div>
  );
}

/* ======================= Quick final score entry ======================= */
function Stepper({ id, label, sub, value, onChange }: { id: string; label: string; sub: string; value: string; onChange: (v: string) => void }) {
  const n = parseInt(value, 10);
  const set = (v: number) => onChange(String(Math.max(0, Math.min(99, v))));
  return (
    <div className={`flex items-center gap-2 ${SURFACE} p-3`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={`${T4} text-slate-500`}>{label}</label>
        <p className={`${T3} truncate text-slate-100`}>{sub}</p>
      </div>
      <button type="button" aria-label={`Giảm điểm ${label}`} onClick={() => set((Number.isNaN(n) ? 0 : n) - 1)} className={`${BTN_GHOST} w-11 px-0`}><Minus className="h-4 w-4" /></button>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onFocus={(e) => e.target.select()}
        className={`${INPUT} pm-num w-14 text-center ${T2}`}
      />
      <button type="button" aria-label={`Tăng điểm ${label}`} onClick={() => set((Number.isNaN(n) ? 0 : n) + 1)} className={`${BTN_GHOST} w-11 px-0`}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function QuickEntry({ vm, ui, setUi, toast }: { vm: TournamentVM; ui: UIState; setUi: (p: Partial<UIState>) => void; toast: Toast }) {
  const rules = vm.rules;
  const inEvent = (m: MatchVM) => ui.quickEvent === 'all' || m.eventId === ui.quickEvent;
  const pending = vm.matches
    .filter((m) => m.status !== 'completed' && inEvent(m))
    .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'));
  const recent = vm.matches.filter((m) => m.status === 'completed' && inEvent(m)).slice(-6).reverse();
  const sel = vm.matches.find((m) => m.id === ui.quickMatch) ?? null;
  const [sa, setSa] = useState('');
  const [sb, setSb] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sel) return;
    setSa(sel.status === 'upcoming' ? '' : String(sel.sa));
    setSb(sel.status === 'upcoming' ? '' : String(sel.sb));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const A = sel ? vm.teams.find((t) => t.id === sel.a) : undefined;
  const B = sel ? vm.teams.find((t) => t.id === sel.b) : undefined;
  const ev = sel ? vm.events.find((e) => e.id === sel.eventId) : undefined;
  const na = parseInt(sa, 10);
  const nb = parseInt(sb, 10);
  const filled = !Number.isNaN(na) && !Number.isNaN(nb);
  const tie = filled && na === nb;
  const offRule = filled && !tie && !isGameOver(na, nb, rules);

  const submit = async () => {
    if (!sel || !filled || tie) return;
    const nextPending = pending.find((m) => m.id !== sel.id);
    setBusy(true);
    try {
      await finalizeMatch(vm.tournament.id, sel.id, na, nb);
      const winner = na > nb ? A : B;
      toast(`Đã lưu: ${teamName(winner, vm.players, true)} thắng ${Math.max(na, nb)}–${Math.min(na, nb)}`);
      setUi({ quickMatch: sel.status === 'completed' ? null : nextPending ? nextPending.id : null });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const row = (m: MatchVM) => (
    <div key={m.id} className={sel?.id === m.id ? 'bg-white/[0.05]' : ''}>
      <ScoreStrip m={m} vm={vm} showEvent={vm.events.length > 1} onOpen={() => setUi({ quickMatch: m.id })} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {vm.events.length > 1 && (
        <Segmented full label="Nội dung" value={ui.quickEvent} onChange={(v) => setUi({ quickEvent: v })}
          options={[{ id: 'all', label: 'Tất cả' }, ...vm.events.map((e) => ({ id: e.id, label: e.short || e.label }))]} />
      )}

      {sel ? (
        <div className={`${CARD} flex flex-col gap-3 p-4`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`${T2} truncate text-white`}>{[ev?.label, stageLabelOf(sel)].filter(Boolean).join(' · ')}</p>
            {sel.status === 'live' ? <LiveBadge label={sel.court ?? 'LIVE'} />
              : sel.status === 'completed' ? <span className={`${T4} text-amber-300`}>Sửa kết quả</span>
              : <span className={`${T4} inline-flex items-center gap-1 text-slate-400`}><Clock className="h-3 w-3" />{sel.time || 'Chưa xếp giờ'}</span>}
          </div>
          <Stepper id="pm-qa" label="ĐỘI A" sub={teamName(A, vm.players)} value={sa} onChange={setSa} />
          <Stepper id="pm-qb" label="ĐỘI B" sub={teamName(B, vm.players)} value={sb} onChange={setSb} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSa(String(rules.target))} className={`${BTN_GHOST} min-h-[36px]`}>Đội A thắng {rules.target}</button>
            <button type="button" onClick={() => setSb(String(rules.target))} className={`${BTN_GHOST} min-h-[36px]`}>Đội B thắng {rules.target}</button>
          </div>
          {tie && <p className={`${T3} text-rose-300`}>Tỉ số không được hoà.</p>}
          {offRule && <p className={`${T4} text-amber-300`}>Tỉ số chưa đúng luật {rules.target} điểm cách {rules.winBy}. Vẫn lưu được nếu trận rút ngắn.</p>}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => setUi({ quickMatch: null })}>Bỏ chọn</button>
            <button type="button" onClick={() => void submit()} disabled={!filled || tie || busy} className={BTN_PRIMARY}>
              <CheckCircle2 className="h-4 w-4" /> {busy ? 'Đang lưu…' : 'Xác nhận kết quả'}
            </button>
          </div>
        </div>
      ) : (
        <p className={`${T3} px-1 text-slate-400`}>Chạm một trận để nhập tỉ số chung cuộc (dùng cho sân không có trọng tài bàn).</p>
      )}

      <StripGroup title="Chưa có kết quả" right={<span className={`${T4} text-slate-500`}>{pending.length} trận</span>}>
        {pending.map(row)}
        {!pending.length && <p className={`${T3} p-6 text-center text-slate-500`}>Tất cả trận đã có kết quả.</p>}
      </StripGroup>
      {recent.length > 0 && (
        <StripGroup title="Vừa nhập · chạm để sửa">{recent.map(row)}</StripGroup>
      )}
    </div>
  );
}

/* ======================= View ======================= */
export default function ScorekeeperView({ vm, auth, ui, setUi, toast }: { vm: TournamentVM; auth: AuthState; ui: UIState; setUi: (p: Partial<UIState>) => void; toast: Toast }) {
  if (!auth.isStaff) {
    return (
      <Empty>
        <Lock className="mx-auto mb-2 h-6 w-6 text-slate-500" />
        Dành cho Trọng tài / BTC. Đăng nhập bằng Gmail đã được cấp quyền để nhập điểm.
      </Empty>
    );
  }

  const activeCourt = ui.activeCourt && vm.courts.some((c) => c.name === ui.activeCourt) ? ui.activeCourt : vm.courts[0]?.name ?? null;
  const locked = vm.locked;

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <p className={`${T2} text-amber-200`}>Giải đấu đã kết thúc. Không thể thay đổi kết quả.</p>
            <p className={`${T3} text-slate-400`}>Mọi nút nhập điểm đã bị khoá. Liên hệ Admin nếu cần mở lại giải.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Segmented label="Cách nhập điểm" value={ui.scoreMode} onChange={(v) => setUi({ scoreMode: v })}
          options={[{ id: 'live' as const, label: 'Từng quả', icon: Activity }, { id: 'quick' as const, label: 'Kết quả nhanh', icon: ClipboardEdit }]} />
        {ui.scoreMode === 'live' && vm.courts.length > 1 && (
          <div className="lg:hidden">
            <Segmented label="Sân" value={activeCourt ?? ''} onChange={(v) => setUi({ activeCourt: v })}
              options={vm.courts.map((c) => ({ id: c.name, label: c.name }))} />
          </div>
        )}
      </div>

      {/* A disabled fieldset locks every button and input inside when the tournament is closed */}
      <fieldset disabled={locked} aria-disabled={locked} className={`m-0 min-w-0 border-0 p-0 ${locked ? 'opacity-50' : ''}`}>
        {ui.scoreMode === 'live' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {vm.courts.map((c) => (
              <ScorePad key={`${c.name}-${c.matchId}`} court={c} vm={vm} hiddenOnMobile={c.name !== activeCourt} toast={toast} />
            ))}
          </div>
        ) : (
          <QuickEntry vm={vm} ui={ui} setUi={setUi} toast={toast} />
        )}
      </fieldset>
    </div>
  );
}
