'use client';

import { Check, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export type ToastFn = (msg: string, kind?: 'ok' | 'error') => void;

/** Tiny toast used by the standalone /admin and /members pages (same look as the main app). */
export function useToast(bottomClass = 'bottom-6') {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback<ToastFn>((msg, kind = 'ok') => {
    setT({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), kind === 'error' ? 4200 : 2800);
  }, []);
  const node = t ? (
    <div
      role="status"
      className={`fixed inset-x-4 ${bottomClass} z-[80] mx-auto flex max-w-sm items-center gap-2 rounded-xl border bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-2xl ${t.kind === 'error' ? 'border-rose-500/40' : 'border-white/10'}`}
    >
      {t.kind === 'error' ? <X className="h-4 w-4 shrink-0 text-rose-300" /> : <Check className="h-4 w-4 shrink-0 text-slate-300" />}
      {t.msg}
    </div>
  ) : null;
  return { toast, node };
}
