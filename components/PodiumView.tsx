'use client';

import { Crown, Medal, PartyPopper, Trophy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fmtDiff } from '@/lib/engine';
import type { PlayerRow, PodiumEntry, PodiumVM } from '@/lib/types';
import { Segmented } from './ui';

const MEDAL = {
  1: { label: 'Vô địch', color: '#F59E0B', glow: 'rgba(245,158,11,.45)', grad: 'from-[#F59E0B] to-[#B45309]', height: 'h-40 sm:h-48', tv: 'h-[16cqw]' },
  2: { label: 'Á quân', color: '#CBD5E1', glow: 'rgba(203,213,225,.35)', grad: 'from-[#E2E8F0] to-[#64748B]', height: 'h-28 sm:h-36', tv: 'h-[11cqw]' },
  3: { label: 'Hạng Ba', color: '#D97706', glow: 'rgba(217,119,6,.35)', grad: 'from-[#D97706] to-[#7C2D12]', height: 'h-20 sm:h-24', tv: 'h-[7.5cqw]' },
} as const;

/** Fireworks via canvas-confetti (loaded on demand, honours reduced-motion). */
export function useConfetti() {
  return useCallback(async () => {
    const confetti = (await import('canvas-confetti')).default;
    const colors = ['#F59E0B', '#FDE68A', '#E2E8F0', '#84CC16', '#FFFFFF'];
    const base = { disableForReducedMotion: true, colors, zIndex: 60 };
    confetti({ ...base, particleCount: 140, spread: 80, startVelocity: 48, origin: { y: 0.65 } });
    const end = Date.now() + 1600;
    const frame = () => {
      confetti({ ...base, particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
      confetti({ ...base, particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    setTimeout(() => confetti({ ...base, particleCount: 90, spread: 120, startVelocity: 35, scalar: 1.1, origin: { y: 0.35 } }), 700);
  }, []);
}

function Avatars({ entry, players, tv }: { entry: PodiumEntry; players: PlayerRow[]; tv: boolean }) {
  const ps = entry.team.pids.map((id) => players.find((p) => p.id === id)).filter(Boolean) as PlayerRow[];
  const size = tv ? 'h-[5.2cqw] w-[5.2cqw] text-[length:2cqw]' : 'h-14 w-14 text-xl sm:h-16 sm:w-16';
  return (
    <div className="flex justify-center -space-x-3">
      {ps.map((p) => (
        <span
          key={p.id}
          className={`${size} flex items-center justify-center overflow-hidden rounded-full border-[3px] bg-[#1F2937] pm-display font-extrabold text-white`}
          style={{ borderColor: MEDAL[entry.place].color }}
          title={p.full_name}
        >
          {p.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            : p.full_name.split(' ').slice(-1)[0].slice(0, 1)}
        </span>
      ))}
    </div>
  );
}

function Step({ place, entries, players, tv }: { place: 1 | 2 | 3; entries: PodiumEntry[]; players: PlayerRow[]; tv: boolean }) {
  const m = MEDAL[place];
  const Icon = place === 1 ? Crown : Medal;
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center justify-end ${tv ? 'gap-[0.8cqw]' : 'gap-2'}`}>
      {entries.length === 0 && <p className={`text-center text-slate-600 ${tv ? 'text-[length:1.2cqw]' : 'text-xs'}`}>Chờ xác định</p>}
      {entries.map((e) => (
        <div key={e.team.id} className={`flex w-full flex-col items-center text-center ${tv ? 'gap-[0.4cqw]' : 'gap-1.5'}`}>
          <Avatars entry={e} players={players} tv={tv} />
          <p className={`w-full truncate pm-display font-extrabold uppercase text-white ${tv ? 'text-[length:1.9cqw]' : 'text-sm sm:text-lg'}`}>{e.team.name}</p>
          <p className={`pm-num text-slate-400 ${tv ? 'text-[length:1.2cqw]' : 'text-[11px] sm:text-xs'}`}>
            {e.stats.w}T–{e.stats.l}B · {fmtDiff(e.stats.diff)}
          </p>
        </div>
      ))}
      <div
        className={`relative flex w-full flex-col items-center justify-start rounded-t-2xl bg-gradient-to-b ${m.grad} ${tv ? `${m.tv} pt-[1cqw]` : `${m.height} pt-3`}`}
        style={{ boxShadow: `0 -10px 40px ${m.glow}` }}
      >
        <Icon className={tv ? 'h-[3cqw] w-[3cqw] text-[#0B0F17]' : 'h-7 w-7 text-[#0B0F17]'} strokeWidth={2.5} />
        <span className={`pm-num font-extrabold leading-none text-[#0B0F17] ${tv ? 'text-[length:5cqw]' : 'text-4xl sm:text-5xl'}`}>{place}</span>
        <span className={`pm-display font-bold uppercase text-[#0B0F17]/80 ${tv ? 'text-[length:1.2cqw]' : 'text-[11px] sm:text-xs'}`}>{place === 3 && entries.length > 1 ? 'Đồng hạng Ba' : m.label}</span>
      </div>
    </div>
  );
}

/**
 * Winner podium: Gold / Silver / Bronze with avatars and stats.
 * `variant="tv"` sizes everything in container-query units for the 16:9 broadcast frame.
 */
export default function PodiumView({
  podiums, players, variant = 'page', title, autoConfetti = true, eventId, onEventChange,
}: {
  podiums: PodiumVM[];
  players: PlayerRow[];
  variant?: 'page' | 'tv';
  title?: string;
  autoConfetti?: boolean;
  eventId?: string;
  onEventChange?: (id: string) => void;
}) {
  const tv = variant === 'tv';
  const fire = useConfetti();
  const [localId, setLocalId] = useState<string | undefined>(undefined);
  const decided = podiums.filter((p) => p.entries.length);
  const activeId = eventId ?? localId ?? decided[0]?.eventId ?? podiums[0]?.eventId;
  const podium = podiums.find((p) => p.eventId === activeId);
  const setActive = (id: string) => (onEventChange ? onEventChange(id) : setLocalId(id));

  useEffect(() => {
    if (autoConfetti && podium?.entries.length) void fire();
  }, [autoConfetti, podium?.eventId, podium?.entries.length, fire]);

  const byPlace = (n: 1 | 2 | 3) => podium?.entries.filter((e) => e.place === n) ?? [];

  return (
    <div className={`relative flex flex-col ${tv ? 'h-full gap-[1cqw]' : 'gap-4'}`}>
      <div className={`flex flex-wrap items-center justify-between ${tv ? 'gap-[1cqw]' : 'gap-3'}`}>
        <div className="min-w-0">
          <p className={`font-semibold uppercase tracking-wider text-[#F59E0B] ${tv ? 'text-[length:1.2cqw]' : 'text-[11px]'}`}>Bảng Vàng Vinh Danh</p>
          <h2 className={`flex items-center gap-2 pm-display font-extrabold uppercase leading-none text-white ${tv ? 'text-[length:3.2cqw]' : 'text-3xl'}`}>
            <Trophy className={tv ? 'h-[3cqw] w-[3cqw] text-[#F59E0B]' : 'h-7 w-7 text-[#F59E0B]'} />
            {title ?? podium?.label ?? 'Trao giải'}
          </h2>
        </div>
        {!tv && (
          <button type="button" onClick={() => void fire()} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#F59E0B]/60 px-3 text-sm font-semibold text-[#F59E0B] hover:bg-[#F59E0B]/10">
            <PartyPopper className="h-4 w-4" /> Bắn pháo hoa
          </button>
        )}
      </div>

      {!tv && podiums.length > 1 && (
        <Segmented full value={activeId ?? ''} onChange={setActive} options={podiums.map((p) => ({ id: p.eventId, label: p.label }))} />
      )}

      {!podium || podium.entries.length === 0 ? (
        <div className={`flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[#374151] text-center text-slate-500 ${tv ? 'p-[3cqw] text-[length:1.6cqw]' : 'p-10 text-sm'}`}>
          <Medal className={tv ? 'mb-[1cqw] h-[4cqw] w-[4cqw]' : 'mb-2 h-8 w-8'} />
          Chưa có kết quả Chung kết cho nội dung này.
        </div>
      ) : (
        <div
          className={`relative flex flex-1 items-end overflow-hidden rounded-2xl border border-[#374151] bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,.18),transparent_60%)] ${tv ? 'gap-[1.5cqw] px-[4cqw] pt-[2cqw]' : 'gap-2 px-3 pt-6 sm:gap-4 sm:px-8'}`}
        >
          <div className="absolute inset-0 pm-grid-bg opacity-60" />
          <div className={`relative flex w-full items-end ${tv ? 'gap-[1.5cqw]' : 'gap-2 sm:gap-4'}`}>
            <Step place={2} entries={byPlace(2)} players={players} tv={tv} />
            <Step place={1} entries={byPlace(1)} players={players} tv={tv} />
            <Step place={3} entries={byPlace(3)} players={players} tv={tv} />
          </div>
        </div>
      )}

      {!tv && podium && podium.entries.length > 0 && !podium.decided && (
        <p className="text-xs text-slate-500">Xếp hạng tạm theo bảng điểm hiện tại.</p>
      )}
    </div>
  );
}
