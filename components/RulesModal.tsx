'use client';

import { ArrowDown, ArrowUp, GripVertical, Lock, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_TIEBREAKERS, TB_LABELS } from '@/lib/engine';
import type { RulesConfig, TieBreaker } from '@/lib/types';
import { Segmented } from './ui';

export function TieBreakerList({ order, setOrder, disabled = false }: { order: TieBreaker[]; setOrder: (o: TieBreaker[]) => void; disabled?: boolean }) {
  const dragIdx = useRef<number | null>(null);
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (disabled || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <ol className="flex flex-col gap-2">
      {order.map((k, i) => (
        <li
          key={k}
          draggable={!disabled}
          onDragStart={() => { dragIdx.current = i; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            const from = dragIdx.current;
            if (disabled || from == null || from === i) return;
            const next = [...order];
            const [it] = next.splice(from, 1);
            next.splice(i, 0, it);
            setOrder(next);
            dragIdx.current = null;
          }}
          className="flex min-h-[52px] items-center gap-3 rounded-xl border border-[#374151] bg-[#0B0F17] px-3 py-2"
        >
          <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-slate-600 sm:block" />
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md pm-num text-base font-extrabold ${i === 0 ? 'bg-[#F59E0B] text-[#0B0F17]' : 'bg-[#1F2937] text-[#F59E0B]'}`}>{i + 1}</span>
          <span className="flex-1 text-sm font-semibold text-white">{TB_LABELS[k]}</span>
          {!disabled && (
            <div className="flex gap-1">
              <button type="button" aria-label="Lên" onClick={() => move(i, -1)} disabled={i === 0} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1F2937] hover:text-white disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Xuống" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1F2937] hover:text-white disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Rules sheet. Organizers edit (saved to tournaments.rules_config); everyone else reads. */
export default function RulesModal({
  open, onClose, rules, canEdit, onSave,
}: {
  open: boolean;
  onClose: () => void;
  rules: RulesConfig;
  canEdit: boolean;
  onSave: (patch: Partial<RulesConfig>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RulesConfig>(rules);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setDraft(rules); }, [open, rules]);
  if (!open) return null;

  const save = async () => {
    if (!canEdit) { onClose(); return; }
    setBusy(true);
    try {
      await onSave({ target: draft.target, winBy: draft.winBy, tieBreakers: draft.tieBreakers });
      onClose();
    } catch {
      // the caller already showed the error toast; keep the sheet open
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-rules-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#374151] bg-[#111827] shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#374151] sm:hidden" />
        <div className="flex items-center justify-between border-b border-[#374151] px-4 py-3">
          <h3 id="pm-rules-title" className="flex items-center gap-2 pm-display text-xl font-extrabold uppercase text-white"><Settings className="h-5 w-5 text-[#A3E635]" />Luật thi đấu</h3>
          <button type="button" aria-label="Đóng" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1F2937]"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-5 p-4">
          {!canEdit && (
            <p className="flex items-center gap-2 rounded-xl bg-[#0B0F17] px-3 py-2 text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Chỉ Ban tổ chức được thay đổi luật.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Điểm thắng game</p>
              <Segmented full disabled={!canEdit} value={draft.target} onChange={(v) => setDraft({ ...draft, target: v })} options={[11, 15, 21].map((n) => ({ id: n, label: String(n) }))} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cách biệt tối thiểu</p>
              <Segmented full disabled={!canEdit} value={draft.winBy} onChange={(v) => setDraft({ ...draft, winBy: v })} options={[1, 2].map((n) => ({ id: n, label: `Cách ${n}` }))} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Thứ tự ưu tiên khi bằng điểm</p>
            <TieBreakerList order={draft.tieBreakers} setOrder={(o) => setDraft({ ...draft, tieBreakers: o })} disabled={!canEdit} />
          </div>
          {canEdit ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDraft({ ...draft, tieBreakers: DEFAULT_TIEBREAKERS })} className="min-h-[48px] rounded-xl border border-[#374151] text-sm font-semibold text-slate-300">Mặc định</button>
              <button type="button" disabled={busy} onClick={() => void save()} className="min-h-[48px] rounded-xl bg-[#A3E635] pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-50">
                {busy ? 'Đang lưu…' : 'Lưu & áp dụng'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={onClose} className="min-h-[48px] rounded-xl border border-[#374151] text-sm font-semibold text-slate-300">Đóng</button>
          )}
        </div>
      </div>
    </div>
  );
}
