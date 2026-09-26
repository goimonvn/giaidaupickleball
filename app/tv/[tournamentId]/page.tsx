'use client';

import { useCallback, useState } from 'react';
import TVBroadcastView from '@/components/TVBroadcastView';
import { useRealtimeMatches, useTournamentData } from '@/lib/supabase';
import type { UIState } from '@/lib/types';

/** Chromeless 16:9 broadcast page for the venue TV / projector: /tv/<tournamentId> */
export default function TVPage({ params }: { params: { tournamentId: string } }) {
  const { vm, status, error } = useTournamentData(params.tournamentId);
  const { connected } = useRealtimeMatches(params.tournamentId);
  const [ui, setUiState] = useState<Pick<UIState, 'tvCycle' | 'tvIdx'>>({ tvCycle: true, tvIdx: 0 });
  const setUi = useCallback(
    (patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) =>
      setUiState((u) => ({ ...u, ...(typeof patch === 'function' ? patch(u as UIState) : patch) })),
    [],
  );

  if (!vm) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0F17] pm-display text-2xl font-bold uppercase text-slate-500">
        {status === 'error' ? `Lỗi tải dữ liệu: ${error}` : 'Đang tải màn hình TV…'}
      </div>
    );
  }
  return (
    <>
      <TVBroadcastView vm={vm} ui={ui} setUi={setUi} standalone />
      {!connected && (
        <div className="fixed left-3 top-3 rounded bg-red-600/90 px-2 py-1 text-xs font-bold text-white">Mất kết nối realtime · đang thử lại</div>
      )}
    </>
  );
}
