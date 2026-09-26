'use client';

/* Shared UI primitives — identical styling to the approved prototype. */
import { AlertTriangle, ChevronRight, Shield } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { TB_SHORT } from '@/lib/engine';
import type { TieBreaker } from '@/lib/types';

export const LIME = '#A3E635';
export const CYAN = '#06B6D4';

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export function LiveBadge({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const big = size === 'lg';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded bg-red-600 font-bold uppercase text-white pm-display ${big ? 'px-[0.8cqw] py-[0.25cqw] text-[length:1.1cqw]' : 'px-2 py-0.5 text-xs'}`}>
      <span className={`rounded-full bg-white pm-pulse ${big ? 'h-[0.6cqw] w-[0.6cqw]' : 'h-1.5 w-1.5'}`} />
      Live
    </span>
  );
}

export function ServeBall({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Đang giao bóng"
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ background: `radial-gradient(circle at 35% 30%, #ecfccb, ${LIME} 55%, #65a30d)`, boxShadow: `0 0 12px ${LIME}88` }}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#374151]/70 bg-[#111827]/85 ${className}`}>{children}</div>;
}

export function SectionTitle({ icon: Icon, children, right, eyebrow }: { icon?: IconType | null; children: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#374151]/70 px-4 py-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-wider text-[#06B6D4]">{eyebrow}</div>}
        <h3 className="flex items-center gap-2 pm-display text-lg font-bold uppercase leading-tight text-white">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-[#A3E635]" />}
          {children}
        </h3>
      </div>
      {right}
    </div>
  );
}

export interface SegOption<T> {
  id: T;
  label: ReactNode;
  icon?: IconType;
  count?: number;
}

export function Segmented<T extends string | number>({
  value, onChange, options, size = 'md', full = false, disabled = false,
}: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; size?: 'sm' | 'md'; full?: boolean; disabled?: boolean }) {
  return (
    <div className={`${full ? 'flex w-full' : 'inline-flex'} max-w-full overflow-x-auto rounded-xl border border-[#374151] bg-[#0B0F17] p-1 pm-noscroll`}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`${full ? 'flex-1' : ''} inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg pm-display font-bold uppercase transition disabled:cursor-not-allowed ${
            size === 'sm' ? 'min-h-[36px] px-3 text-xs' : 'min-h-[42px] px-3.5 text-sm'
          } ${value === o.id ? 'bg-[#A3E635] text-[#0B0F17]' : 'text-slate-400 hover:text-white'}`}
        >
          {o.icon && <o.icon className="h-4 w-4" />}
          {o.label}
          {o.count != null && <span className="opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-[#374151] bg-[#0B0F17] px-4 py-3 text-left"
    >
      <span className="text-sm font-bold text-white">{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-[#A3E635]' : 'bg-[#374151]'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export function TieBreakerBadge({ order, onClick }: { order: TieBreaker[]; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-left text-xs text-amber-200 hover:border-[#F59E0B]"
      title="Xem / chỉnh luật xếp hạng"
    >
      <Shield className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" />
      <span className="font-semibold text-[#F59E0B]">Ưu tiên:</span>
      {order.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          {TB_SHORT[k]}
          {i < order.length - 1 && <ChevronRight className="h-3 w-3 opacity-60" />}
        </span>
      ))}
    </button>
  );
}

const GROUP_COLORS: Record<string, string> = {
  A: 'bg-[#A3E635] text-[#0B0F17]',
  B: 'bg-[#06B6D4] text-[#0B0F17]',
  C: 'bg-[#F59E0B] text-[#0B0F17]',
  D: 'bg-fuchsia-400 text-[#0B0F17]',
  BK: 'bg-white text-[#0B0F17]',
  CK: 'bg-[#F59E0B] text-[#0B0F17]',
  TK: 'bg-slate-300 text-[#0B0F17]',
};

export function GroupBadge({ g, size = 'md' }: { g: string | null | undefined; size?: 'sm' | 'md' }) {
  if (!g) return null;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md pm-display font-extrabold ${GROUP_COLORS[g] ?? 'bg-slate-300 text-[#0B0F17]'} ${size === 'sm' ? 'h-5 min-w-[20px] px-1 text-[11px]' : 'h-7 min-w-[28px] px-1.5 text-base'}`}>
      {g}
    </span>
  );
}

export function ConfirmBar({ text, onCancel, onConfirm, confirmLabel, busy }: { text: ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel: string; busy?: boolean }) {
  return (
    <div className="rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 p-3">
      <p className="flex gap-2 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />{text}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-[#374151] text-sm font-semibold text-slate-300">Quay lại</button>
        <button type="button" disabled={busy} onClick={onConfirm} className="min-h-[44px] rounded-lg bg-[#F59E0B] text-sm font-bold text-[#0B0F17] disabled:opacity-50">
          {busy ? 'Đang lưu…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: IconType; title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <Icon className="h-8 w-8 text-[#A3E635]" />
      <p className="pm-display text-xl font-bold uppercase text-white">{title}</p>
      {children && <div className="max-w-md text-sm text-slate-400">{children}</div>}
    </Card>
  );
}
