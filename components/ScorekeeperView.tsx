'use client';

import { Activity, CheckCircle2, ChevronRight, ClipboardEdit, Clock, Crown, Lock, Minus, Play, Plus, RefreshCw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { callNextMatch, finalizeMatch, matchAction } from '@/lib/client-actions';
import { isGameOver, MATCH_TYPE_LABEL, MATCH_TYPE_SHORT, scoreCall, teamName } from '@/lib/engine';
import type { AuthState } from '@/lib/supabase';
import type { CourtVM, MatchActionType, TournamentVM, UIState } from '@/lib/types';
import { MatchRow } from './Standings';
import { CYAN, Card, EmptyState, GroupBadge, LIME, LiveBadge, SectionTitle, Segmented, ServeBall } from './ui';

type Toast = (msg: string, kind?: 'ok' | 'error') => void;

/* ======================= Live point-by-point pad ======================= */
function ScorePad({ court, vm, hiddenOnMobile, toast }: { court: CourtVM; vm: TournamentVM; hiddenOnMobile: boolean; toast: Toast }) {
  const match = vm.matches.find((m) => m.id === court.matchId);
  const [confirm, setConfirm] = useState(false);
  const [bump, setBump] = useState<'A' | 'B' | null>(null);
  const [busy, setBusy] = useState(false);
  const rules = vm.rules;
  const wrap = `${hiddenOnMobile ? 'hidden lg:block' : ''} mx-auto w-full max-w-[440px]`;

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
        <Card className="flex flex-col items-center gap-3 p-8 text-center text-slate-400">
          <CheckCircle2 className="h-8 w-8 text-[#A3E635]" />
          <p>{court.name} đang trống.</p>
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
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#A3E635] px-4 pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Gọi trận kế tiếp
            </button>
          )}
        </Card>
      </div>
    );
  }

  const A = vm.teams.find((t) => t.id === match.a);
  const B = vm.teams.find((t) => t.id === match.b);
  const ev = vm.events.find((e) => e.id === match.eventId);
  const singles = !!ev?.singles;
  const over = isGameOver(match.sa, match.sb, rules);
  const gamePoint = (s: number, o: number) => s >= rules.target - 1 && s - o >= rules.winBy - 1 && !over;

  const point = (side: 'A' | 'B') => {
    void run(side === 'A' ? 'point_a' : 'point_b');
    setBump(side);
    setTimeout(() => setBump(null), 360);
  };

  const panel = (key: 'A' | 'B', team: typeof A, score: number, other: number) => {
    const serving = match.serving === key;
    const accent = key === 'A' ? LIME : CYAN;
    return (
      <div className={`rounded-2xl border p-3 ${serving ? 'border-[#A3E635]/50 bg-[#A3E635]/[0.05]' : 'border-[#374151] bg-[#0B0F17]'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="pm-display text-xs font-bold uppercase" style={{ color: accent }}>Đội {key}</span>
            <div className="truncate text-base font-bold text-white">{teamName(team, vm.players)}</div>
            <div className="mt-1 flex h-5 items-center gap-1.5 text-xs">
              {serving ? (
                <><ServeBall className="h-3 w-3" /><span className="font-semibold text-[#A3E635]">{singles ? 'Đang giao' : `Giao bóng ${match.server}`}</span></>
              ) : <span className="text-slate-600">Đỡ giao</span>}
              {gamePoint(score, other) && <span className="ml-1 rounded bg-[#F59E0B] px-1.5 py-0.5 pm-display text-[10px] font-bold uppercase text-[#0B0F17]">Game point</span>}
            </div>
          </div>
          <span className={`pm-num text-6xl font-extrabold leading-none text-white ${bump === key ? 'pm-pop' : ''}`}>{score}</span>
        </div>
        <button
          type="button"
          onClick={() => point(key)}
          disabled={over}
          className="mt-3 flex h-[72px] w-full items-center justify-center gap-2 rounded-xl pm-display text-2xl font-extrabold uppercase text-[#0B0F17] transition active:scale-[0.98] disabled:opacity-30"
          style={{ background: accent }}
        >
          <Plus className="h-7 w-7" strokeWidth={3} /> 1 điểm Đội {key}
        </button>
      </div>
    );
  };

  const end = async () => {
    setBusy(true);
    try {
      await finalizeMatch(vm.tournament.id, match.id, match.sa, match.sb);
      setConfirm(false);
      toast(`Đã kết thúc trận trên ${court.name}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const badge = match.type === 'group' ? match.group : MATCH_TYPE_SHORT[match.type];

  return (
    <div className={wrap}>
      <Card className="p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="pm-display text-2xl font-extrabold uppercase leading-none text-white">{court.name}</div>
            <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-400">
              <GroupBadge g={badge} size="sm" /> {ev?.label} · {match.type === 'group' ? `Lượt ${match.round}` : MATCH_TYPE_LABEL[match.type]} · Tới {rules.target}, cách {rules.winBy}
            </div>
          </div>
          <LiveBadge />
        </div>

        <div className="mb-3 flex items-center justify-between rounded-xl bg-[#0B0F17] px-3 py-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Gọi điểm</span>
          <span className="pm-num text-2xl font-extrabold text-[#F59E0B]">{scoreCall(match, singles)}</span>
        </div>

        <div className="flex flex-col gap-2">
          {panel('A', A, match.sa, match.sb)}
          {panel('B', B, match.sb, match.sa)}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => void run('toggle_server')} disabled={singles} className="flex h-[68px] flex-col items-center justify-center rounded-xl border border-[#374151] bg-[#1F2937] text-white disabled:opacity-30">
            <span className="pm-num text-xl font-extrabold text-[#A3E635]">{match.server === 1 ? '1 → 2' : '2 → 1'}</span>
            <span className="text-[11px] text-slate-400">Người giao</span>
          </button>
          <button type="button" onClick={() => void run('side_out')} className="flex h-[68px] flex-col items-center justify-center rounded-xl border border-[#374151] bg-[#1F2937] text-white">
            <RefreshCw className="h-5 w-5 text-[#06B6D4]" />
            <span className="mt-1 text-[11px] text-slate-400">Đổi giao</span>
          </button>
          <button type="button" onClick={() => void run('undo')} disabled={match.historyLength === 0} className="flex h-[68px] flex-col items-center justify-center rounded-xl border border-[#374151] bg-[#1F2937] text-white disabled:opacity-30">
            <Undo2 className="h-5 w-5 text-[#F59E0B]" />
            <span className="mt-1 text-[11px] text-slate-400">Hủy quả vừa rồi</span>
          </button>
        </div>

        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className={`mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl pm-display text-lg font-bold uppercase transition ${over ? 'bg-[#F59E0B] text-[#0B0F17]' : 'border border-rose-500/50 text-rose-300'}`}
          >
            <CheckCircle2 className="h-5 w-5" /> Kết thúc trận đấu
          </button>
        ) : (
          <div className="mt-2 rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 p-3">
            {match.sa === match.sb ? (
              <p className="text-sm text-amber-200">Tỉ số đang hoà {match.sa}–{match.sb}. Cần có đội thắng trước khi kết thúc.</p>
            ) : (
              <p className="text-sm text-amber-100">
                Xác nhận <b>{teamName(match.sa > match.sb ? A : B, vm.players)}</b> thắng <span className="pm-num font-bold">{Math.max(match.sa, match.sb)}–{Math.min(match.sa, match.sb)}</span>?
                {!over && <span className="block text-xs text-amber-300/80">Chưa đạt {rules.target} điểm cách {rules.winBy}.</span>}
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="h-12 rounded-lg border border-[#374151] text-sm font-semibold text-slate-300">Quay lại</button>
              <button type="button" disabled={match.sa === match.sb || busy} onClick={() => void end()} className="h-12 rounded-lg bg-[#F59E0B] text-sm font-bold text-[#0B0F17] disabled:opacity-30">
                {busy ? 'Đang lưu…' : 'Xác nhận & gọi trận kế'}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ======================= Quick final score entry ======================= */
function ScoreStepper({ id, label, sub, value, onChange, accent }: { id: string; label: string; sub: string; value: string; onChange: (v: string) => void; accent: string }) {
  const n = parseInt(value, 10);
  const set = (v: number) => onChange(String(Math.max(0, Math.min(99, v))));
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#374151] bg-[#0B0F17] p-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="pm-display text-xs font-bold uppercase" style={{ color: accent }}>{label}</label>
        <div className="truncate text-sm font-semibold text-white">{sub}</div>
      </div>
      <button type="button" aria-label={`Giảm điểm ${label}`} onClick={() => set((Number.isNaN(n) ? 0 : n) - 1)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1F2937] text-white"><Minus className="h-5 w-5" /></button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        max={99}
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onFocus={(e) => e.target.select()}
        className="h-14 w-16 shrink-0 rounded-xl border-2 bg-[#111827] text-center pm-num text-3xl font-extrabold text-white placeholder:text-slate-700"
        style={{ borderColor: accent }}
      />
      <button type="button" aria-label={`Tăng điểm ${label}`} onClick={() => set((Number.isNaN(n) ? 0 : n) + 1)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1F2937] text-white"><Plus className="h-5 w-5" /></button>
    </div>
  );
}

function QuickEntry({ vm, ui, setUi, toast }: { vm: TournamentVM; ui: UIState; setUi: (p: Partial<UIState>) => void; toast: Toast }) {
  const rules = vm.rules;
  const inEvent = (m: TournamentVM['matches'][number]) => ui.quickEvent === 'all' || m.eventId === ui.quickEvent;
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
      toast(`Đã lưu: ${teamName(winner, vm.players, true)} thắng ${Math.max(na, nb)}–${Math.min(na, nb)}${sel.group ? ` · BXH Bảng ${sel.group} đã cập nhật` : ''}`);
      setUi({ quickMatch: sel.status === 'completed' ? null : nextPending ? nextPending.id : null });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="order-2 flex flex-col gap-3 lg:order-1">
        <Segmented full size="sm" value={ui.quickEvent} onChange={(v) => setUi({ quickEvent: v })} options={[{ id: 'all', label: 'Tất cả' }, ...vm.events.map((e) => ({ id: e.id, label: e.label }))]} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Chưa có kết quả · {pending.length} trận</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {pending.map((m) => <MatchRow key={m.id} m={m} vm={vm} selected={sel?.id === m.id} onClick={() => setUi({ quickMatch: m.id })} />)}
          {pending.length === 0 && <p className="py-6 text-center text-sm text-slate-500 sm:col-span-2">Tất cả các trận đã có kết quả.</p>}
        </div>
        {recent.length > 0 && (
          <>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vừa nhập · chạm để sửa</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {recent.map((m) => <MatchRow key={m.id} m={m} vm={vm} selected={sel?.id === m.id} onClick={() => setUi({ quickMatch: m.id })} />)}
            </div>
          </>
        )}
      </div>

      <div className="order-1 lg:order-2">
        <Card className="lg:sticky lg:top-24">
          <SectionTitle icon={ClipboardEdit} eyebrow="Nhập kết quả nhanh">
            {sel ? `${ev?.label ?? ''} · ${sel.type === 'group' ? `Lượt ${sel.round}` : MATCH_TYPE_LABEL[sel.type]}` : 'Chọn một trận'}
          </SectionTitle>
          {!sel ? (
            <p className="p-4 text-sm text-slate-400">Chạm vào một trận bên dưới để nhập tỉ số chung cuộc. Dùng cho các sân không có trọng tài bàn.</p>
          ) : (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <GroupBadge g={sel.type === 'group' ? sel.group : MATCH_TYPE_SHORT[sel.type]} size="sm" />
                {sel.status === 'live' && <><LiveBadge /><span>Đang đấu ở {sel.court}</span></>}
                {sel.status === 'completed' && <span className="text-[#F59E0B]">Sửa kết quả đã nhập</span>}
                {sel.status === 'upcoming' && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Dự kiến {sel.time}</span>}
              </div>
              <ScoreStepper id="pm-qa" label="Đội A" sub={teamName(A, vm.players)} value={sa} onChange={setSa} accent={LIME} />
              <ScoreStepper id="pm-qb" label="Đội B" sub={teamName(B, vm.players)} value={sb} onChange={setSb} accent={CYAN} />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSa(String(rules.target))} className="min-h-[40px] rounded-lg border border-[#374151] text-xs font-semibold text-slate-300">Đội A thắng {rules.target}</button>
                <button type="button" onClick={() => setSb(String(rules.target))} className="min-h-[40px] rounded-lg border border-[#374151] text-xs font-semibold text-slate-300">Đội B thắng {rules.target}</button>
              </div>
              {tie && <p className="text-xs text-rose-400">Tỉ số không được hoà. Pickleball luôn có đội thắng.</p>}
              {offRule && <p className="text-xs text-amber-300">Tỉ số chưa đúng luật {rules.target} điểm cách {rules.winBy}. Vẫn lưu được nếu trận rút ngắn.</p>}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!filled || tie || busy}
                className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-[#A3E635] pm-display text-lg font-extrabold uppercase text-[#0B0F17] disabled:opacity-35"
              >
                <CheckCircle2 className="h-5 w-5" /> {busy ? 'Đang lưu…' : 'Xác nhận kết quả'}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ======================= View ======================= */
export default function ScorekeeperView({ vm, auth, ui, setUi, toast }: { vm: TournamentVM; auth: AuthState; ui: UIState; setUi: (p: Partial<UIState>) => void; toast: Toast }) {
  if (!auth.isStaff) {
    return (
      <EmptyState icon={Lock} title="Dành cho trọng tài / BTC">
        <p>Đăng nhập bằng tài khoản Google đã được cấp quyền Trọng tài hoặc Ban tổ chức để nhập điểm.</p>
        {!auth.session && (
          <button type="button" onClick={() => void auth.signInWithGoogle()} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0B0F17]">
            Đăng nhập Google <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </EmptyState>
    );
  }

  const activeCourt = ui.activeCourt ?? vm.courts[0]?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#06B6D4]">Trọng tài / Ban tổ chức</p>
        <h2 className="pm-display text-3xl font-extrabold uppercase leading-none text-white">Nhập điểm</h2>
      </div>
      <Segmented
        full
        value={ui.scoreMode}
        onChange={(v) => setUi({ scoreMode: v })}
        options={[{ id: 'live' as const, label: 'Nhập từng quả', icon: Activity }, { id: 'quick' as const, label: 'Kết quả nhanh', icon: ClipboardEdit }]}
      />
      {vm.locked && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#F59E0B]/60 bg-[#F59E0B]/10 px-4 py-3">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
          <div>
            <p className="pm-display text-lg font-bold uppercase text-[#F59E0B]">Giải đấu đã kết thúc. Không thể thay đổi kết quả.</p>
            <p className="text-xs text-amber-200/80">Mọi nút nhập điểm đã bị khoá. Liên hệ Admin nếu cần mở lại giải.</p>
          </div>
        </div>
      )}
      {ui.scoreMode === 'live' ? (
        <>
          <div className="lg:hidden">
            <Segmented full size="sm" value={activeCourt ?? ''} onChange={(v) => setUi({ activeCourt: v })} options={vm.courts.map((c) => ({ id: c.name, label: c.name }))} />
          </div>
          {/* A disabled fieldset locks every button and input inside when the tournament is closed */}
          <fieldset disabled={vm.locked} className={`m-0 min-w-0 border-0 p-0 ${vm.locked ? 'pointer-events-none opacity-50 grayscale' : ''}`} aria-disabled={vm.locked}>
            <div className="grid gap-6 lg:grid-cols-2">
              {vm.courts.map((c) => (
                <ScorePad key={`${c.name}-${c.matchId}`} court={c} vm={vm} hiddenOnMobile={c.name !== activeCourt} toast={toast} />
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <fieldset disabled={vm.locked} className={`m-0 min-w-0 border-0 p-0 ${vm.locked ? 'pointer-events-none opacity-50 grayscale' : ''}`} aria-disabled={vm.locked}>
          <QuickEntry vm={vm} ui={ui} setUi={setUi} toast={toast} />
        </fieldset>
      )}
    </div>
  );
}
