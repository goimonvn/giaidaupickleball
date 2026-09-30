'use client';

/* =====================================================================
   PickleMasters Live v1.2 — UI kit from the approved v4 demo.

   Type scale (exactly 4 levels, see T1–T4). Only exceptions: referee
   score digits and the TV frame.
   Colour discipline: neutral slate surfaces; Volt #84CC16 is reserved
   for LIVE (badge, live score, serve ball) + the active bottom-nav icon.
   ===================================================================== */
import type { LucideIcon } from 'lucide-react';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

export const T1 = 'text-lg font-bold'; // headers & titles
export const T2 = 'text-sm font-semibold'; // card titles & subheaders
export const T3 = 'text-xs font-medium'; // player names & body
export const T4 = 'text-[10px] font-medium tracking-wide'; // micro-labels & badges

export const VOLT_TEXT = 'text-[#84CC16]';
export const CARD = 'rounded-2xl border border-white/5 bg-slate-900/60';
export const SURFACE = 'rounded-xl border border-white/5 bg-slate-950';
export const BTN_PRIMARY = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 ${T2} text-slate-950 transition hover:bg-white disabled:opacity-40`;
export const BTN_GHOST = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 px-4 ${T2} text-slate-200 transition hover:bg-white/5 disabled:opacity-40`;
export const BTN_DANGER = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose-500/40 px-4 ${T2} text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-40`;
// Fixed height + min-w-0: iOS Safari ignores min-height on date/select and gives them an intrinsic min width
export const INPUT = `block h-11 w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-slate-950 px-3 ${T3} text-slate-100 placeholder:text-slate-600 focus:border-white/30 focus:outline-none disabled:opacity-50`;
/** Date / time inputs: strip the native iOS styling so the value is left-aligned and stays inside the box */
export const DATE_INPUT = `${INPUT} appearance-none text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:leading-[2.5rem]`;
export const ICON_BTN = 'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white disabled:opacity-25';

export type Toast = (msg: string, kind?: 'ok' | 'error') => void;

/** Option-button style used by Step 1 (courts, target, win-by). */
export const optionCls = (on: boolean) =>
  `flex min-h-[44px] flex-1 items-center justify-center rounded-xl border ${T3} transition ${on ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-slate-400 hover:text-slate-200'}`;
export const chipCls = (on: boolean) =>
  `min-h-[36px] shrink-0 rounded-full border px-3 ${T3} transition ${on ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-slate-400 hover:text-slate-200'}`;

/* ---------------------------- live indicators (Volt) ---------------------------- */

export function LiveBadge({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-[#84CC16]/10 px-1.5 py-0.5 ${T4} ${VOLT_TEXT}`}>
      <span className="pm-pulse h-1.5 w-1.5 rounded-full bg-[#84CC16]" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ServeDot() {
  return <span role="img" aria-label="Đang giao bóng" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#84CC16] shadow-[0_0_6px_#84CC16]" />;
}

/* ---------------------------- avatars ---------------------------- */

const initialOf = (name: string) => (name.trim().split(/\s+/).pop() ?? '?').slice(0, 1).toUpperCase();

export function Avatar({ name, src, size = 'h-6 w-6' }: { name: string; src?: string | null; size?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-slate-950`} />;
  }
  return (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-slate-800 ring-2 ring-slate-950 ${T4} text-slate-300`}>
      {initialOf(name)}
    </span>
  );
}

export function AvatarStack({ people }: { people: { id: string; name: string; src?: string | null }[] }) {
  if (!people.length) return <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-dashed border-white/10" />;
  return (
    <span className="flex shrink-0 -space-x-2">
      {people.map((p) => <Avatar key={p.id} name={p.name} src={p.src} />)}
    </span>
  );
}

/* ---------------------------- controls ---------------------------- */

export interface SegOption<V extends string | number> {
  id: V;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export function Segmented<V extends string | number>({
  value, onChange, options, full = false, label,
}: {
  value: V;
  onChange: (v: V) => void;
  options: SegOption<V>[];
  full?: boolean;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`${full ? 'flex w-full' : 'inline-flex'} pm-noscroll max-w-full overflow-x-auto rounded-xl border border-white/5 bg-slate-900/60 p-1`}>
      {options.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`${full ? 'flex-1' : ''} inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 ${T3} transition ${on ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {o.label}
            {o.count != null && <span className={`${T4} ${on ? 'text-slate-300' : 'text-slate-500'}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-[44px] w-full items-center justify-between gap-3 ${SURFACE} px-3 disabled:opacity-50`}
    >
      <span className={`${T3} text-slate-200`}>{label}</span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${checked ? 'bg-slate-100' : 'bg-slate-700'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full transition-all ${checked ? 'left-5 bg-slate-950' : 'left-1 bg-slate-300'}`} />
      </span>
    </button>
  );
}

export function Checkbox({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-slate-100 bg-slate-100' : 'border-slate-600'}`}>
      {on && <Check className="h-3 w-3 text-slate-950" />}
    </span>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {htmlFor ? <label htmlFor={htmlFor} className={`${T4} text-slate-500`}>{label}</label> : <span className={`${T4} text-slate-500`}>{label}</span>}
      {children}
    </div>
  );
}

/* ---------------------------- surfaces ---------------------------- */

export function StripGroup({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
        <h3 className={`${T2} text-slate-100`}>{title}</h3>
        {right}
      </header>
      <div className="divide-y divide-white/5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={`${CARD} p-8 text-center ${T3} text-slate-400`}>{children}</div>;
}

/** Bottom sheet on mobile, centred dialog on desktop. Closes on a tap on the dimmed backdrop, the ✕ button or Escape. */
export function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Only a tap that starts AND ends on the backdrop closes (dragging out of a text field doesn't)
  const downOnBackdrop = useRef(false);
  // Escape closes; outside taps are handled by the backdrop's onClick (a click, not pointerdown,
  // so the tap can't fall through and re-open whatever sits underneath)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div
      className="fixed inset-0 z-[60] flex cursor-pointer items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      // Tapping the dimmed area closes the sheet (explicit handler: reliable on iOS Safari too)
      onPointerDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`pm-sheet max-h-[88vh] w-full cursor-auto ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 sm:rounded-2xl`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/10 sm:hidden" />
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className={`${T2} text-white`}>{title}</h2>
          <button type="button" aria-label="Đóng" onClick={onClose} className={ICON_BTN}><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  text, confirmLabel, onConfirm, onCancel, danger = false, busy = false,
}: {
  text: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <div role="alertdialog" className={`rounded-xl border p-3 ${danger ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <p className={`${T3} text-slate-200`}>{text}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={BTN_GHOST}>Huỷ</button>
        <button type="button" onClick={onConfirm} disabled={busy} className={danger ? `${BTN_DANGER} bg-rose-500/10` : BTN_PRIMARY}>
          {busy ? 'Đang xử lý…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
