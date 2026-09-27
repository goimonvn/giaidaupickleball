'use client';

import { useEffect, useRef } from 'react';
import { autoCreateKnockout } from '@/lib/client-actions';
import { firstStagePairs, knockoutBlocker, MATCH_TYPE_LABEL } from '@/lib/engine';
import type { TournamentVM } from '@/lib/types';

/**
 * Tự động tạo vòng loại trực tiếp đầu tiên (Bán kết / Chung kết) ngay khi vòng bảng của
 * một nội dung có đủ kết quả. Runs on every signed-in staff device (the referee who enters
 * the last result is always online); the SQL function is idempotent so parallel calls are safe.
 * Chung kết & Tranh hạng 3 are created by a database trigger, not here.
 * Skips an event when a tie can't be broken by the tie-breaker rules — BTC decides in Step 3.
 */
export function useAutoKnockout(vm: TournamentVM | null, isStaff: boolean, toast: (msg: string, kind?: 'ok' | 'error') => void) {
  const tried = useRef(new Map<string, string>());

  useEffect(() => {
    if (!vm || !isStaff || vm.locked || vm.rules.autoKnockout === false) return;
    const order = vm.rules.tieBreakers;
    for (const ev of vm.events) {
      if (ev.config.autoOff) continue;
      const group = vm.matches.filter((m) => m.eventId === ev.id && m.type === 'group');
      if (!group.length || group.some((m) => m.status !== 'completed')) continue;
      if (vm.matches.some((m) => m.eventId === ev.id && m.type !== 'group')) continue;
      if (knockoutBlocker(vm, ev, order)) continue;
      const stage = firstStagePairs(vm, ev, order);
      if (!stage) continue;
      // One attempt per pairing: a corrected result that changes the pairs allows a new attempt
      const sig = stage.pairs.flat().join(',');
      if (tried.current.get(ev.id) === sig) continue;
      tried.current.set(ev.id, sig);
      autoCreateKnockout(vm.tournament.id, ev.id, stage.type, stage.pairs)
        .then((n) => { if (n) toast(`${ev.label}: vòng bảng đã xong, đã tự tạo lịch ${MATCH_TYPE_LABEL[stage.type]}`); })
        .catch((e: Error) => toast(e.message, 'error'));
    }
  }, [vm, isStaff, toast]);
}
