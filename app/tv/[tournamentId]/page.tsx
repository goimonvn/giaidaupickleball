'use client';

import { useCallback, useEffect, useState } from 'react';
import TVBroadcastView from '@/components/TVBroadcastView';
import { useRealtimeMatches, useTournamentData } from '@/lib/supabase';
import type { UIState } from '@/lib/types';

type TVState = Pick<UIState, 'tvCycle' | 'tvIdx' | 'tvView'>;

/**
 * Chromeless 16:9 broadcast page for the venue TV / projector — no login needed.
 *   /tv/<tournamentId>              live courts + standings
 *   /tv/<tournamentId>?view=podium  awarding ceremony (auto when the tournament is completed)
 */
export default function TVPage({ params, searchParams }: { params: { tournamentId: string }; searchParams: { view?: string } }) {
  const { vm, status, error } = useTournamentData(params.tournamentId);
  const { connected } = useRealtimeMatches(params.tournamentId);
  const [ui, setUiState] = useState<TVState>({ tvCycle: true, tvIdx: 0, tvView: searchParams.view === 'podium' ? 'podium' : 'live' });
  const setUi = useCallback(
    (patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) =>
      setUiState((u) => ({ ...u, ...(typeof patch === 'function' ? patch(u as UIState) : patch) })),
    [],
  );

  // When BTC closes the tournament, the venue screen switches to the podium by itself
  const locked = vm?.locked ?? false;
  useEffect(() => {
    if (locked && !searchParams.view) setUiState((u) => ({ ...u, tvView: 'podium', tvIdx: 0 }));
  }, [locked, searchParams.view]);

  if (!vm) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-lg font-bold text-slate-500">
        {status === 'error' ? `Lỗi tải dữ liệu: ${error}` : 'Đang tải màn hình TV…'}
      </div>
    );
  }
  return (
    <>
      <TVBroadcastView vm={vm} ui={ui} setUi={setUi} standalone />
      {!connected && (
        <div className="fixed left-3 top-3 rounded-md bg-rose-600/90 px-2 py-1 text-[10px] font-medium tracking-wide text-white">Mất kết nối realtime · đang thử lại</div>
      )}
    </>
  );
}
