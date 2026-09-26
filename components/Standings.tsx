'use client';

import { CheckCircle2, ChevronDown, ChevronRight, Clock, Target, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { fmtDiff, MATCH_TYPE_LABEL, MATCH_TYPE_SHORT, teamAvg, teamName } from '@/lib/engine';
import type { EventVM, KnockoutSeed, MatchVM, PlayerRow, StandingRow, TournamentVM } from '@/lib/types';
import { Card, GroupBadge, LiveBadge, SectionTitle, ServeBall } from './ui';

/* ---------------------------- Mobile-first standings ---------------------------- */
export function StandingsList({ rows, players, advance, stage }: { rows: StandingRow[]; players: PlayerRow[]; advance: number; stage: string }) {
  const cols = 'grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_2.75rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_2.75rem_2.75rem_2.75rem_3.25rem_3.25rem]';
  if (!rows.length) return <p className="px-4 py-6 text-center text-sm text-slate-500">Chưa có đội nào trong bảng này.</p>;
  return (
    <div>
      <div className={`grid ${cols} items-center gap-2 px-3 py-2 pm-display text-[11px] font-bold uppercase tracking-wider text-slate-500`}>
        <span>#</span><span>Đội</span>
        <span className="hidden text-center sm:block">Trận</span>
        <span className="hidden text-center sm:block">Thắng</span>
        <span className="hidden text-center sm:block">Thua</span>
        <span className="text-center">+/-</span><span className="text-right">Điểm</span>
      </div>
      {rows.map((r, i) => {
        const q = i < advance;
        return (
          <div key={r.team.id} className={`grid ${cols} items-center gap-2 px-3 py-3 ${i === advance ? 'border-t-2 border-dashed border-[#374151]' : 'border-t border-[#374151]/50'} ${q ? 'bg-[#A3E635]/[0.05]' : ''}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg pm-num text-lg font-extrabold ${i === 0 ? 'bg-[#F59E0B] text-[#0B0F17]' : q ? 'bg-[#A3E635]/15 text-[#A3E635]' : 'bg-[#1F2937] text-slate-400'}`}>
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold text-white">{teamName(r.team, players)}</span>
                {r.live && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 pm-pulse" title="Đang thi đấu" />}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                <span className="pm-num text-xs text-slate-400 sm:hidden">{r.p} trận · {r.w}T–{r.l}B</span>
                <span>TB {teamAvg(r.team, players).toFixed(2)}</span>
                {q && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-[#A3E635] px-1.5 py-px pm-display text-[10px] font-bold uppercase text-[#0B0F17]">
                    <CheckCircle2 className="h-2.5 w-2.5" /> {stage}
                  </span>
                )}
              </div>
            </div>
            <span className="hidden text-center pm-num text-base text-slate-300 sm:block">{r.p}</span>
            <span className="hidden text-center pm-num text-base font-bold text-white sm:block">{r.w}</span>
            <span className="hidden text-center pm-num text-base text-slate-400 sm:block">{r.l}</span>
            <span className={`text-center pm-num text-base font-semibold ${r.diff > 0 ? 'text-[#A3E635]' : r.diff < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{fmtDiff(r.diff)}</span>
            <span className="text-right pm-num text-xl font-extrabold text-[#06B6D4]">{r.pts}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------- TV compact standings (cqw units) ---------------------------- */
export function CompactStandings({ rows, players, advance }: { rows: StandingRow[]; players: PlayerRow[]; advance: number }) {
  const cols = 'grid-cols-[2.2cqw_1fr_3cqw_3cqw_4.2cqw_3.6cqw]';
  return (
    <div className="flex flex-col">
      <div className={`grid ${cols} items-center gap-[0.6cqw] px-[0.8cqw] pb-[0.4cqw] pm-display text-[length:0.95cqw] font-bold uppercase text-slate-500`}>
        <span>#</span><span>Đội</span><span className="text-center">T</span><span className="text-center">B</span><span className="text-center">+/-</span><span className="text-right">Đ</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.team.id} className={`grid ${cols} items-center gap-[0.6cqw] px-[0.8cqw] py-[0.5cqw] ${i === advance ? 'border-t-[0.15cqw] border-dashed border-slate-500' : 'border-t border-[#374151]/60'} ${i < advance ? 'bg-[#A3E635]/[0.07]' : ''}`}>
          <span className={`pm-num text-[length:1.5cqw] font-extrabold ${i === 0 ? 'text-[#F59E0B]' : i < advance ? 'text-[#A3E635]' : 'text-slate-500'}`}>{i + 1}</span>
          <span className="flex min-w-0 items-center gap-[0.5cqw] text-[length:1.25cqw] font-semibold text-white">
            <span className="truncate">{teamName(r.team, players, true)}</span>
            {r.live && <span className="h-[0.6cqw] w-[0.6cqw] shrink-0 rounded-full bg-red-500 pm-pulse" />}
            {i < advance && <CheckCircle2 className="h-[1.1cqw] w-[1.1cqw] shrink-0 text-[#A3E635]" />}
          </span>
          <span className="pm-num text-center text-[length:1.4cqw] font-bold text-white">{r.w}</span>
          <span className="pm-num text-center text-[length:1.4cqw] text-slate-400">{r.l}</span>
          <span className={`pm-num text-center text-[length:1.4cqw] font-semibold ${r.diff > 0 ? 'text-[#A3E635]' : r.diff < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{fmtDiff(r.diff)}</span>
          <span className="pm-num text-right text-[length:1.6cqw] font-extrabold text-[#06B6D4]">{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- Knockout projection ---------------------------- */
export function KnockoutPreview({ ties, stage, players, action }: { ties: KnockoutSeed[][]; stage: string; players: PlayerRow[]; action?: ReactNode }) {
  if (!ties.length) return null;
  return (
    <Card>
      <SectionTitle icon={Target} eyebrow="Dự kiến theo BXH hiện tại" right={action}>{stage}</SectionTitle>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {ties.map((tie, i) => (
          <div key={i} className="rounded-xl border border-[#374151] bg-[#0B0F17] p-3">
            <div className="mb-1.5 pm-display text-[11px] font-bold uppercase tracking-wider text-slate-500">{stage} {ties.length > 1 ? i + 1 : ''}</div>
            {tie.map((s, j) => (
              <div key={j} className="flex items-center gap-2 py-1">
                <span className="w-7 pm-num text-sm font-extrabold text-[#F59E0B]">{s.label}</span>
                <span className="truncate text-sm font-semibold text-white">{s.team ? teamName(s.team, players) : 'Chờ xác định'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------- Match card ---------------------------- */
export function MatchRow({ m, vm, onClick, selected }: { m: MatchVM; vm: TournamentVM; onClick?: () => void; selected?: boolean }) {
  const A = vm.teams.find((t) => t.id === m.a);
  const B = vm.teams.find((t) => t.id === m.b);
  const ev: EventVM | undefined = vm.events.find((e) => e.id === m.eventId);
  const done = m.status === 'completed';
  const live = m.status === 'live';
  const aWin = done && m.sa > m.sb;
  const bWin = done && m.sb > m.sa;
  const badge = m.type === 'group' ? m.group : MATCH_TYPE_SHORT[m.type];
  const roundLabel = m.type === 'group' ? `Lượt ${m.round}` : MATCH_TYPE_LABEL[m.type];
  const inner = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <GroupBadge g={badge} size="sm" />
          <span className="truncate">{ev?.label} · {roundLabel}</span>
        </span>
        {live ? (
          <span className="flex shrink-0 items-center gap-2"><span className="text-slate-400">{m.court}</span><LiveBadge /></span>
        ) : done ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-slate-400"><CheckCircle2 className="h-3 w-3 text-[#A3E635]" />Kết thúc</span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[#06B6D4]"><Clock className="h-3 w-3" />{m.time}</span>
        )}
      </div>
      {([[A, m.sa, aWin, m.serving === 'A'], [B, m.sb, bWin, m.serving === 'B']] as const).map(([t, s, win, serving], i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-0.5">
          <span className={`flex min-w-0 items-center gap-1.5 text-sm ${win ? 'font-bold text-white' : done ? 'text-slate-400' : 'text-slate-200'}`}>
            {live && serving ? <ServeBall className="h-2 w-2" /> : <span className="h-2 w-2 shrink-0" />}
            <span className="truncate">{teamName(t, vm.players)}</span>
          </span>
          <span className={`pm-num text-lg font-extrabold ${win ? 'text-[#A3E635]' : live ? 'text-white' : 'text-slate-500'}`}>
            {m.status === 'upcoming' ? '–' : s}
          </span>
        </div>
      ))}
    </>
  );
  const cls = `block w-full rounded-xl border px-3 py-2.5 text-left transition ${
    selected ? 'border-[#A3E635] bg-[#A3E635]/[0.08]' : live ? 'border-red-500/40 bg-red-500/[0.06]' : 'border-[#374151]/60 bg-[#0B0F17]/60'
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-slate-500`}>{inner}</button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ---------------------------- Knockout bracket ---------------------------- */
function BracketSlot({ label, match, seeds, vm }: { label: string; match?: MatchVM; seeds?: KnockoutSeed[]; vm: TournamentVM }) {
  const rows = match
    ? [
        { team: vm.teams.find((t) => t.id === match.a), score: match.sa, win: match.status === 'completed' && match.sa > match.sb },
        { team: vm.teams.find((t) => t.id === match.b), score: match.sb, win: match.status === 'completed' && match.sb > match.sa },
      ]
    : (seeds ?? [undefined, undefined]).map((s) => ({ team: s?.team, score: null as number | null, win: false, seed: s?.label }));
  const live = match?.status === 'live';
  return (
    <div className={`w-full overflow-hidden rounded-xl border ${live ? 'border-red-500/50' : match?.status === 'completed' ? 'border-[#374151]' : 'border-dashed border-[#374151]'} bg-[#0B0F17]`}>
      <div className="flex items-center justify-between bg-[#111827] px-3 py-1.5 pm-display text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        {live ? <LiveBadge /> : match?.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-[#A3E635]" /> : match ? <span className="text-[#06B6D4]">{match.time}</span> : <span>Dự kiến</span>}
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`flex min-h-[44px] items-center gap-2 px-3 ${i ? 'border-t border-[#374151]/60' : ''} ${r.win ? 'bg-[#A3E635]/[0.07]' : ''}`}>
          {'seed' in r && r.seed && <span className="w-7 pm-num text-xs font-extrabold text-[#F59E0B]">{r.seed}</span>}
          <span className={`min-w-0 flex-1 truncate text-sm ${r.win ? 'font-bold text-white' : r.team ? 'text-slate-200' : 'text-slate-600'}`}>
            {r.team ? teamName(r.team, vm.players) : 'Chờ xác định'}
          </span>
          {r.score != null && match?.status !== 'upcoming' && (
            <span className={`pm-num text-lg font-extrabold ${r.win ? 'text-[#A3E635]' : 'text-slate-500'}`}>{r.score}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Semis → Final + Bronze. Shows projected seeds until the knockout matches exist. */
export function KnockoutBracket({ bracket, vm, stage }: {
  bracket: { semis: MatchVM[]; final?: MatchVM; bronze?: MatchVM; projected: KnockoutSeed[][] };
  vm: TournamentVM;
  stage: string;
}) {
  const { semis, final, bronze, projected } = bracket;
  const semiSlots = semis.length ? semis.map((m, i) => ({ key: m.id, match: m, label: `Bán kết ${i + 1}` }))
    : projected.length === 2 ? projected.map((s, i) => ({ key: `p${i}`, seeds: s, label: `${stage} ${i + 1}` })) : [];
  const finalSeeds = !semis.length && projected.length === 1 ? projected[0] : undefined;

  if (!semiSlots.length && !final && !finalSeeds) {
    return <p className="p-6 text-center text-sm text-slate-500">Nội dung này chưa có vòng loại trực tiếp.</p>;
  }
  return (
    <div className="grid gap-4 p-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
      {semiSlots.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="pm-display text-xs font-bold uppercase tracking-wider text-slate-500">Bán kết</p>
          {semiSlots.map((s) => <BracketSlot key={s.key} label={s.label} match={'match' in s ? s.match : undefined} seeds={'seeds' in s ? s.seeds : undefined} vm={vm} />)}
        </div>
      )}
      {semiSlots.length > 0 && (
        <div className="flex items-center justify-center text-slate-600" aria-hidden="true">
          <ChevronRight className="hidden h-6 w-6 md:block" />
          <ChevronDown className="h-6 w-6 md:hidden" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-1.5 pm-display text-xs font-bold uppercase tracking-wider text-[#F59E0B]"><Trophy className="h-3.5 w-3.5" /> Chung kết</p>
        <BracketSlot label="Chung kết" match={final} seeds={finalSeeds} vm={vm} />
        {(bronze || semiSlots.length > 0) && (
          <>
            <p className="pm-display text-xs font-bold uppercase tracking-wider text-slate-500">Tranh hạng Ba</p>
            <BracketSlot label="Tranh hạng 3" match={bronze} vm={vm} />
          </>
        )}
      </div>
    </div>
  );
}
