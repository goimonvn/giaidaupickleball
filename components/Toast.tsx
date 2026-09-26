'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

export type ToastFn = (msg: string, kind?: 'ok' | 'error') => void;

/** Tiny toast used by the standalone /admin and /members pages. */
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
      className={`fixed inset-x-4 ${bottomClass} z-50 mx-auto flex max-w-md items-center gap-2 rounded-xl border bg-[#111827] px-4 py-3 text-sm font-semibold text-white shadow-2xl ${t.kind === 'error' ? 'border-rose-500/60' : 'border-[#A3E635]/50'}`}
    >
      {t.kind === 'error' ? <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-[#A3E635]" />}
      {t.msg}
    </div>
  ) : null;
  return { toast, node };
}
