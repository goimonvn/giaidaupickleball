'use client';

import { CalendarDays, Lock, LockOpen, Pencil, Plus, QrCode, Radio, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { completeTournament, createTournament, deleteTournament, reopenTournament, updateTournament } from '@/lib/actions';
import { refreshTournament } from '@/lib/client-actions';
import { DEFAULT_RULES, dateInputOf, fmtDateVN, startsAtOf, STATUS_TAG, statusTagOf, timeInputOf, withDefaults } from '@/lib/engine';
import type { AuthState } from '@/lib/supabase';
import type { EventInput, RulesConfig, TournamentInput, TournamentRow, TournamentStatusTag } from '@/lib/types';
import { EVENT_PRESETS } from './AdminDashboard';
import { QRShareSheet } from './QRCode';
import {
  BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, chipCls, Confirm, DATE_INPUT, Empty, Field, ICON_BTN, INPUT, Segmented, Sheet, T1, T2, T3, T4, Toggle, type Toast,
} from './kit';

/* =====================================================================
   Quản lý giải đấu (from the avatar menu) — approved v4 demo.
   Cards with status tags and actions: Mở · Chỉnh sửa · Đóng/Khoá · Xoá.
   ===================================================================== */

const inputOf = (t: TournamentRow): TournamentInput => {
  const r = withDefaults<RulesConfig>(DEFAULT_RULES, t.rules_config);
  return {
    title: t.title,
    date: dateInputOf(t.starts_at),
    time: timeInputOf(t.starts_at),
    startsAt: t.starts_at,
    venue: t.venue ?? '',
    courts: Math.max(1, Math.min(4, r.courts.length || 2)),
    target: r.target,
    winBy: r.winBy,
    tieBreakers: r.tieBreakers,
    autoKnockout: r.autoKnockout !== false,
    bronzeMatch: r.bronzeMatch !== false,
  };
};

const today = () => dateInputOf(new Date().toISOString());

function TournamentForm({ initial, onSave, onClose }: { initial: TournamentRow | null; onSave: (f: TournamentInput, events: EventInput[]) => Promise<boolean>; onClose: () => void }) {
  const [f, setF] = useState<TournamentInput>(() => (initial ? inputOf(initial) : {
    title: '', date: today(), time: '08:00', startsAt: null, venue: '', courts: 2, target: DEFAULT_RULES.target, winBy: DEFAULT_RULES.winBy, tieBreakers: DEFAULT_RULES.tieBreakers, autoKnockout: true, bronzeMatch: true,
  }));
  const [events, setEvents] = useState<string[]>(['Đôi Nam']);
  const [busy, setBusy] = useState(false);
  const valid = f.title.trim().length >= 3 && (initial || events.length > 0);

  return (
    <Sheet title={initial ? 'Chỉnh sửa giải' : 'Tạo giải mới'} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          const ok = await onSave({ ...f, startsAt: startsAtOf(f.date, f.time) }, EVENT_PRESETS.filter((p) => events.includes(p.name)));
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <Field label="TÊN GIẢI" htmlFor="pm-tm-title">
          <input id="pm-tm-title" autoFocus className={INPUT} value={f.title} maxLength={120} placeholder="VD: Giải Tất Niên 2026" onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NGÀY THI ĐẤU" htmlFor="pm-tm-date"><input id="pm-tm-date" type="date" className={DATE_INPUT} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="GIỜ BẮT ĐẦU" htmlFor="pm-tm-time"><input id="pm-tm-time" type="time" step={300} className={DATE_INPUT} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        </div>
        <Field label="ĐỊA ĐIỂM" htmlFor="pm-tm-venue"><input id="pm-tm-venue" className={INPUT} value={f.venue} placeholder="Sân…" onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
        <Field label="SỐ LƯỢNG SÂN">
          <Segmented full value={f.courts} onChange={(v) => setF({ ...f, courts: v })} options={[1, 2, 3, 4].map((n) => ({ id: n, label: `${n} sân` }))} />
        </Field>
        <Field label="ĐIỂM THẮNG GAME">
          <Segmented full value={f.target} onChange={(v) => setF({ ...f, target: v })} options={[11, 15, 21].map((n) => ({ id: n, label: `${n} điểm` }))} />
        </Field>
        <Field label="CÁCH BIỆT TỐI THIỂU">
          <Segmented full value={f.winBy} onChange={(v) => setF({ ...f, winBy: v })} options={[{ id: 1, label: '1 điểm' }, { id: 2, label: '2 điểm · Win by 2' }]} />
        </Field>
        <Toggle checked={f.bronzeMatch} onChange={(v) => setF({ ...f, bronzeMatch: v })} label="Tổ chức trận Tranh hạng 3" />
        {!f.bronzeMatch && <p className={`${T4} -mt-2 text-slate-500`}>2 đội thua Bán kết đồng hạng 3.</p>}
        {!initial && (
          <Field label="NỘI DUNG THI ĐẤU">
            <div className="flex flex-wrap gap-1.5">
              {EVENT_PRESETS.map((p) => {
                const on = events.includes(p.name);
                return (
                  <button key={p.name} type="button" aria-pressed={on} className={chipCls(on)} onClick={() => setEvents(on ? events.filter((x) => x !== p.name) : [...events, p.name])}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        {initial && <p className={`${T4} text-slate-500`}>Thứ tự ưu tiên xếp hạng và nội dung thi đấu chỉnh ở BTC → Bước 1.</p>}
        <button type="submit" disabled={!valid || busy} className={BTN_PRIMARY}>{busy ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Tạo giải'}</button>
      </form>
    </Sheet>
  );
}

export default function TournamentManager({
  tournaments, activeId, auth, toast, onOpen,
}: {
  tournaments: TournamentRow[];
  activeId: string | null;
  auth: AuthState;
  toast: Toast;
  /** Open a tournament; `goBtc` jumps to the BTC screen (after creating) */
  onOpen: (id: string, goBtc?: boolean) => void;
}) {
  const [edit, setEdit] = useState<TournamentRow | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'delete' | 'lock' | 'unlock' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | TournamentStatusTag>('all');
  const [qr, setQr] = useState<TournamentRow | null>(null);

  if (!auth.isOrganizer) return <Empty>Chỉ Ban tổ chức và Admin quản lý được giải đấu.</Empty>;

  const shown = tournaments.filter((t) => filter === 'all' || statusTagOf(t) === filter);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, id?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setConfirm(null);
    if (!r.ok) { toast(r.error ?? 'Có lỗi xảy ra', 'error'); return false; }
    if (id) await refreshTournament(id).catch(() => undefined);
    toast(okMsg);
    return true;
  };

  const save = async (f: TournamentInput, events: EventInput[]) => {
    if (edit === 'new') {
      const r = await createTournament({ ...f, events });
      if (!r.ok) { toast(r.error, 'error'); return false; }
      toast(`Đã tạo "${r.data.title}". Tiếp tục chọn VĐV ở BTC.`);
      onOpen(r.data.id, true);
      return true;
    }
    if (!edit) return false;
    const r = await updateTournament(edit.id, f);
    if (!r.ok) { toast(r.error, 'error'); return false; }
    await refreshTournament(edit.id).catch(() => undefined);
    toast(r.data.requeued ? `Đã lưu. ${r.data.requeued} trận ở sân bị bỏ đã về hàng chờ.` : 'Đã lưu thông tin giải');
    return true;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`${T4} text-slate-500`}>QUẢN LÝ</p>
          <h1 className={`${T1} text-white`}>Tất cả giải đấu</h1>
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> Tạo giải</button>
      </div>

      <Segmented full label="Lọc theo trạng thái" value={filter} onChange={setFilter} options={[
        { id: 'all' as const, label: 'Tất cả', count: tournaments.length },
        ...(Object.keys(STATUS_TAG) as TournamentStatusTag[]).map((id) => ({ id, label: STATUS_TAG[id].label, count: tournaments.filter((t) => statusTagOf(t) === id).length })),
      ]} />

      {!shown.length && <Empty>{tournaments.length ? 'Không có giải nào ở trạng thái này.' : 'Chưa có giải nào. Bấm “Tạo giải” để bắt đầu.'}</Empty>}

      <ul className="flex flex-col gap-2">
        {shown.map((t) => {
          const st = statusTagOf(t);
          const tag = STATUS_TAG[st];
          const isActive = t.id === activeId;
          const locked = t.status === 'completed';
          const courts = withDefaults<RulesConfig>(DEFAULT_RULES, t.rules_config).courts.length;
          const c = confirm?.id === t.id ? confirm : null;
          return (
            <li key={t.id} className={`${CARD} p-4 ${isActive ? 'ring-1 ring-white/20' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  {locked ? <Trophy className="h-5 w-5 text-amber-300" /> : <CalendarDays className="h-5 w-5 text-slate-300" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`${T2} min-w-0 truncate text-white`}>{t.title}</h3>
                    <span className={`${T4} rounded-md px-1.5 py-0.5 ${tag.cls}`}>{tag.label}</span>
                    {isActive && <span className={`${T4} rounded-md bg-white/10 px-1.5 py-0.5 text-slate-200`}>Đang mở</span>}
                  </div>
                  <p className={`${T3} mt-0.5 text-slate-400`}>{fmtDateVN(t.starts_at)}{t.starts_at ? ` · ${timeInputOf(t.starts_at)}` : ''} · {courts} sân{t.venue ? ` · ${t.venue}` : ''}</p>
                </div>
                <button type="button" aria-label={`Mã QR của ${t.title}`} title="Mã QR của giải" onClick={() => setQr(t)} className={ICON_BTN}><QrCode className="h-4 w-4" /></button>
              </div>

              {c?.kind === 'delete' ? (
                <div className="mt-3">
                  <Confirm danger busy={busy} text={`Xoá vĩnh viễn "${t.title}" cùng toàn bộ nội dung, lịch và kết quả? Không thể hoàn tác.`} confirmLabel="Xoá giải"
                    onCancel={() => setConfirm(null)} onConfirm={() => void act(() => deleteTournament(t.id), `Đã xoá ${t.title}`)} />
                </div>
              ) : c?.kind === 'lock' ? (
                <div className="mt-3">
                  <Confirm busy={busy} text={`Đóng "${t.title}"? Mọi nút nhập điểm sẽ bị khoá và Bảng Vàng mở cho khán giả.`} confirmLabel="Đóng / Khoá"
                    onCancel={() => setConfirm(null)} onConfirm={() => void act(() => completeTournament(t.id), `Đã khoá ${t.title}`, t.id)} />
                </div>
              ) : c?.kind === 'unlock' ? (
                <div className="mt-3">
                  <Confirm busy={busy} text={`Mở khoá "${t.title}" để sửa kết quả?`} confirmLabel="Mở khoá"
                    onCancel={() => setConfirm(null)} onConfirm={() => void act(() => reopenTournament(t.id), `Đã mở khoá ${t.title}`, t.id)} />
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" className={BTN_GHOST} disabled={isActive} onClick={() => { onOpen(t.id); toast(`Đang mở ${t.title}`); }}><Radio className="h-4 w-4" /> Mở giải</button>
                  <button type="button" className={BTN_GHOST} disabled={locked} title={locked ? 'Mở khoá giải trước khi chỉnh sửa' : undefined} onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /> Chỉnh sửa</button>
                  {locked ? (
                    <button type="button" className={BTN_GHOST} disabled={!auth.isAdmin} title={auth.isAdmin ? undefined : 'Chỉ Admin mở khoá được'} onClick={() => setConfirm({ id: t.id, kind: 'unlock' })}><LockOpen className="h-4 w-4" /> Mở khoá</button>
                  ) : (
                    <button type="button" className={BTN_GHOST} onClick={() => setConfirm({ id: t.id, kind: 'lock' })}><Lock className="h-4 w-4" /> Đóng / Khoá</button>
                  )}
                  <button type="button" className={BTN_DANGER} disabled={locked && !auth.isAdmin} title={locked && !auth.isAdmin ? 'Chỉ Admin xoá được giải đã kết thúc' : undefined} onClick={() => setConfirm({ id: t.id, kind: 'delete' })}><Trash2 className="h-4 w-4" /> Xoá</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {edit && <TournamentForm initial={edit === 'new' ? null : edit} onSave={save} onClose={() => setEdit(null)} />}
      {qr && <QRShareSheet tournament={qr} toast={toast} onClose={() => setQr(null)} />}
    </div>
  );
}
