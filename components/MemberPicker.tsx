'use client';

import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlayerRow } from '@/lib/types';

/** 1-click checkbox list of members with search, group filter and select-all. */
export default function MemberPicker({
  players, selected, onChange, disabled = false, idPrefix = 'pm-pick',
}: {
  players: PlayerRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('all');
  const [gender, setGender] = useState<'all' | 'M' | 'F'>('all');
  const tags = useMemo(() => Array.from(new Set(players.map((p) => p.group_tag))).sort(), [players]);
  const sel = new Set(selected);

  const shown = players.filter((p) =>
    (tag === 'all' || p.group_tag === tag)
    && (gender === 'all' || p.gender === gender)
    && (!q.trim() || p.full_name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const allShownOn = shown.length > 0 && shown.every((p) => sel.has(p.id));

  const toggle = (id: string) => {
    if (disabled) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };
  const toggleAllShown = () => {
    if (disabled) return;
    const next = new Set(sel);
    shown.forEach((p) => (allShownOn ? next.delete(p.id) : next.add(p.id)));
    onChange(Array.from(next));
  };

  const chip = (on: boolean) =>
    `min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-semibold ${on ? 'border-[#A3E635] bg-[#A3E635]/15 text-[#A3E635]' : 'border-[#374151] text-slate-400'}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <label htmlFor={`${idPrefix}-q`} className="sr-only">Tìm thành viên</label>
        <input
          id={`${idPrefix}-q`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên…"
          className="min-h-[44px] w-full rounded-xl border border-[#374151] bg-[#0B0F17] pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
        />
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pm-noscroll">
        <button type="button" className={chip(tag === 'all')} onClick={() => setTag('all')}>Tất cả nhóm</button>
        {tags.map((t) => <button key={t} type="button" className={chip(tag === t)} onClick={() => setTag(t)}>{t}</button>)}
        <span className="mx-1 h-5 w-px shrink-0 bg-[#374151]" />
        {(['all', 'M', 'F'] as const).map((g) => (
          <button key={g} type="button" className={chip(gender === g)} onClick={() => setGender(g)}>{g === 'all' ? 'Nam + Nữ' : g === 'M' ? 'Nam' : 'Nữ'}</button>
        ))}
      </div>
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <span><b className="pm-num text-sm text-white">{selected.length}</b> đã chọn / {players.length} thành viên</span>
        <button type="button" disabled={disabled || !shown.length} onClick={toggleAllShown} className="min-h-[36px] rounded-lg px-2 font-semibold text-[#06B6D4] disabled:opacity-40">
          {allShownOn ? 'Bỏ chọn danh sách này' : `Chọn tất cả (${shown.length})`}
        </button>
      </div>
      <ul className="grid max-h-[360px] gap-1 overflow-y-auto pr-1 pm-scroll sm:grid-cols-2">
        {shown.map((p) => {
          const on = sel.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => toggle(p.id)}
                className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3 text-left transition disabled:cursor-not-allowed ${on ? 'border-[#A3E635]/70 bg-[#A3E635]/[0.07]' : 'border-[#374151] bg-[#0B0F17]'}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? 'border-[#A3E635] bg-[#A3E635]' : 'border-slate-600'}`}>
                  {on && <Check className="h-3.5 w-3.5 text-[#0B0F17]" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{p.full_name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{p.group_tag} · {p.gender === 'M' ? 'Nam' : 'Nữ'}</span>
                </span>
                <span className="pm-num text-base font-extrabold text-[#A3E635]">{p.skill_rating.toFixed(1)}</span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="py-6 text-center text-sm text-slate-500 sm:col-span-2">Không có thành viên phù hợp.</li>}
      </ul>
    </div>
  );
}
