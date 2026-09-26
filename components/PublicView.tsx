'use client';

import { Activity, CalendarDays, Crown, GitBranch, LayoutGrid, MapPin, Radio, Trophy, Tv } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { groupsOfEvent, MATCH_TYPE_LABEL, MATCH_TYPE_SHORT, qualifiersOf, scoreCall, stageName, teamName } from '@/lib/engine';
import { useStandingsEngine } from '@/lib/supabase';
import type { MatchVM, PublicTab, TournamentRow, TournamentVM, UIState } from '@/lib/types';
import PodiumView from './PodiumView';
import { KnockoutBracket, MatchRow, StandingsList } from './Standings';
import { CYAN, Card, GroupBadge, LIME, LiveBadge, SectionTitle, Segmented, ServeBall, TieBreakerBadge } from './ui';

/* Big live scorecard for spectators */
function LiveCourtCard({ m, vm }: { m: MatchVM; vm: TournamentVM }) {
  const ev = vm.events.find((e) => e.id === m.eventId);
  const rows = [['A', m.a, m.sa, LIME], ['B', m.b, m.sb, CYAN]] as const;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[#374151]/70 bg-[#0B0F17]/60 px-4 py-3">
        <div className="min-w-0">
          <div className="pm-display text-xl font-extrabold uppercase italic leading-none text-white">{m.court}</div>
          <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-400">
            <GroupBadge g={m.type === 'group' ? m.group : MATCH_TYPE_SHORT[m.type]} size="sm" />
            {ev?.label} · {m.type === 'group' ? `Lượt ${m.round}` : MATCH_TYPE_LABEL[m.type]}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pm-num text-sm text-[#F59E0B]">{scoreCall(m, !!ev?.singles)}</span>
          <LiveBadge />
        </div>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {rows.map(([k, tid, score, accent]) => {
          const lead = score > (k === 'A' ? m.sb : m.sa);
          return (
            <div key={k} className="flex items-center gap-3">
              <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-base font-bold ${lead ? 'text-white' : 'text-slate-300'}`}>{teamName(vm.teams.find((t) => t.id === tid), vm.players)}</div>
                <div className="flex h-4 items-center gap-1.5 text-[11px]">
                  {m.serving === k && <><ServeBall className="h-2.5 w-2.5" /><span className="font-semibold text-[#A3E635]">{ev?.singles ? 'Giao bóng' : `Giao bóng ${m.server}`}</span></>}
                </div>
              </div>
              <span className={`pm-num flex h-14 min-w-[64px] items-center justify-center rounded-xl px-2 text-4xl font-extrabold ${lead ? 'bg-[#A3E635] text-[#0B0F17]' : 'bg-[#0B0F17] text-white'}`}>{score}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function PublicView({
  vm, tournaments, onSelectTournament, ui, setUi, openRules,
}: {
  vm: TournamentVM;
  tournaments: TournamentRow[];
  onSelectTournament: (id: string) => void;
  ui: UIState;
  setUi: (patch: Partial<UIState>) => void;
  openRules: () => void;
}) {
  const engine = useStandingsEngine(vm.tournament.id);
  const [schedTab, setSchedTab] = useState<'upcoming' | 'completed'>('upcoming');
  const ev = vm.events.find((e) => e.id === ui.viewerEvent) ?? vm.events[0];

  // Completed tournaments open on the podium the first time
  const [openedPodium, setOpenedPodium] = useState<string | null>(null);
  useEffect(() => {
    if (vm.locked && openedPodium !== vm.tournament.id) {
      setOpenedPodium(vm.tournament.id);
      setUi({ publicTab: 'podium' });
    }
  }, [vm.locked, vm.tournament.id, openedPodium, setUi]);

  const tab: PublicTab = ui.publicTab === 'podium' && !vm.locked ? 'live' : ui.publicTab;
  const live = vm.matches.filter((m) => m.status === 'live');
  const doneCount = vm.matches.filter((m) => m.status === 'completed').length;
  const pct = Math.round((doneCount / Math.max(1, vm.matches.length)) * 100);

  const tabs: { id: PublicTab; label: string; icon: typeof Trophy; count?: number }[] = [
    { id: 'live', label: 'Trực tiếp', icon: Radio, count: live.length },
    { id: 'standings', label: 'BXH', icon: Trophy },
    { id: 'bracket', label: 'Nhánh đấu', icon: GitBranch },
    { id: 'schedule', label: 'Lịch đấu', icon: CalendarDays },
    ...(vm.locked ? [{ id: 'podium' as const, label: 'Vinh danh', icon: Crown }] : []),
  ];

  const hero = (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 pm-grid-bg opacity-70" />
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#A3E635]/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="pm-tour" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Giải đấu</label>
            <select
              id="pm-tour"
              value={vm.tournament.id}
              onChange={(e) => onSelectTournament(e.target.value)}
              className="min-h-[48px] w-full max-w-full rounded-xl border border-[#374151] bg-[#0B0F17] px-3 py-2 pm-display text-base font-bold uppercase text-white md:text-2xl"
            >
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.title}{t.status === 'completed' ? ' · Đã kết thúc' : ''}</option>)}
            </select>
          </div>
          <a
            href={`/tv/${vm.tournament.id}${vm.locked ? '?view=podium' : ''}`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl border border-[#06B6D4]/60 bg-[#06B6D4]/10 px-3 text-sm font-bold text-cyan-300 hover:bg-[#06B6D4]/20"
            title="Mở màn hình TV / máy chiếu trong tab mới"
          >
            <Tv className="h-5 w-5" /> <span className="hidden sm:inline">Chế độ TV</span>
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-[#A3E635]/15 px-2 py-1 font-semibold text-[#A3E635]">
            <LayoutGrid className="h-3 w-3" />{vm.tournament.format === 'group_knockout' ? 'Vòng bảng + Loại trực tiếp' : 'Vòng tròn tính điểm'}
          </span>
          {vm.locked ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#F59E0B]/15 px-2 py-1 font-semibold text-[#F59E0B]"><Crown className="h-3 w-3" />Đã kết thúc</span>
          ) : vm.tournament.status === 'ongoing' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-1 font-semibold text-red-400"><Radio className="h-3 w-3" />Đang diễn ra</span>
          )}
          {vm.tournament.venue && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#1F2937] px-2 py-1 text-slate-300"><MapPin className="h-3 w-3" />{vm.tournament.venue} · {vm.courts.length} sân</span>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tiến độ giải</span>
            <span className="pm-num text-xl font-extrabold text-white">{doneCount}<span className="text-sm text-slate-500">/{vm.matches.length} trận</span></span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1F2937]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#06B6D4] to-[#A3E635] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </Card>
  );

  const eventPicker = ev && vm.events.length > 1 && (
    <Segmented full value={ev.id} onChange={(v) => setUi({ viewerEvent: v, viewerGroup: 'all' })} options={vm.events.map((e) => ({ id: e.id, label: e.label }))} />
  );

  let body: ReactNode = null;
  if (!ev) {
    body = <Card className="p-8 text-center text-sm text-slate-400">Giải này chưa có nội dung thi đấu. Ban tổ chức sẽ cập nhật sớm.</Card>;
  } else if (tab === 'live') {
    const next = vm.matches.filter((m) => m.status === 'upcoming').slice(0, 4);
    body = (
      <div className="flex flex-col gap-5">
        {live.length ? (
          <div className="grid gap-4 md:grid-cols-2">{live.map((m) => <LiveCourtCard key={m.id} m={m} vm={vm} />)}</div>
        ) : (
          <Card className="p-8 text-center text-sm text-slate-400">{vm.locked ? 'Giải đã kết thúc.' : 'Hiện chưa có sân nào đang thi đấu.'}</Card>
        )}
        {next.length > 0 && (
          <Card>
            <SectionTitle icon={Activity}>Sắp diễn ra</SectionTitle>
            <div className="grid gap-2 p-3 sm:grid-cols-2">{next.map((m) => <MatchRow key={m.id} m={m} vm={vm} />)}</div>
          </Card>
        )}
      </div>
    );
  } else if (tab === 'standings') {
    const cfg = ev.config;
    const groups = groupsOfEvent(ev);
    const groupActive = cfg.groupsEnabled && groups.includes(ui.viewerGroup);
    const shown = groupActive ? [ui.viewerGroup] : groups;
    const stage = stageName(qualifiersOf(cfg));
    body = (
      <div className="flex flex-col gap-4">
        {eventPicker}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {cfg.groupsEnabled ? (
            <div className="flex items-center gap-2 overflow-x-auto pm-noscroll">
              {['all', ...(groups as string[])].map((g) => {
                const on = g === 'all' ? !groupActive : ui.viewerGroup === g;
                return (
                  <button key={g} type="button" onClick={() => setUi({ viewerGroup: g })}
                    className={`min-h-[40px] shrink-0 rounded-full border px-4 pm-display text-sm font-bold uppercase ${on ? 'border-[#A3E635] bg-[#A3E635]/15 text-[#A3E635]' : 'border-[#374151] text-slate-400'}`}>
                    {g === 'all' ? 'Tất cả bảng' : `Bảng ${g}`}
                  </button>
                );
              })}
            </div>
          ) : <span />}
          <TieBreakerBadge order={engine.tieBreakers} onClick={openRules} />
        </div>
        <div className={`grid gap-4 ${shown.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {shown.map((g) => (
            <Card key={g ?? 'all'}>
              <SectionTitle icon={g ? null : Trophy} right={<span className="text-[11px] text-slate-500">Top {cfg.advance} → {stage}</span>}>
                {g ? <><GroupBadge g={g} /> Bảng {g}</> : `Bảng xếp hạng · ${ev.label}`}
              </SectionTitle>
              <StandingsList rows={engine.getStandings(ev.id, g)} players={vm.players} advance={cfg.advance} stage={stage} />
            </Card>
          ))}
        </div>
      </div>
    );
  } else if (tab === 'bracket') {
    const br = engine.bracketFor(ev.id);
    body = (
      <div className="flex flex-col gap-4">
        {eventPicker}
        <Card>
          <SectionTitle icon={GitBranch} eyebrow={ev.label}>Nhánh đấu loại trực tiếp</SectionTitle>
          {br && <KnockoutBracket bracket={br} vm={vm} stage={stageName(qualifiersOf(ev.config))} />}
        </Card>
      </div>
    );
  } else if (tab === 'schedule') {
    const inEvent = (m: MatchVM) => m.eventId === ev.id;
    const lists = {
      upcoming: vm.matches.filter((m) => m.status !== 'completed' && inEvent(m)),
      completed: vm.matches.filter((m) => m.status === 'completed' && inEvent(m)).reverse(),
    };
    body = (
      <div className="flex flex-col gap-4">
        {eventPicker}
        <Segmented full size="sm" value={schedTab} onChange={setSchedTab}
          options={[{ id: 'upcoming' as const, label: 'Sắp tới', count: lists.upcoming.length }, { id: 'completed' as const, label: 'Kết quả', count: lists.completed.length }]} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lists[schedTab].map((m) => <MatchRow key={m.id} m={m} vm={vm} />)}
          {!lists[schedTab].length && <p className="py-8 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">Chưa có trận nào ở mục này.</p>}
        </div>
      </div>
    );
  } else {
    body = (
      <Card className="p-4 md:p-6">
        <PodiumView
          podiums={vm.events.map((e) => engine.podiumFor(e.id)).filter(Boolean) as NonNullable<ReturnType<typeof engine.podiumFor>>[]}
          players={vm.players}
          eventId={ui.viewerEvent ?? undefined}
          onEventChange={(id) => setUi({ viewerEvent: id })}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {hero}
      {vm.locked && tab !== 'podium' && (
        <button type="button" onClick={() => setUi({ publicTab: 'podium' })}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-[#F59E0B]/60 bg-[#F59E0B]/10 px-4 pm-display text-base font-bold uppercase text-[#F59E0B]">
          <Crown className="h-5 w-5" /> Xem Bảng Vàng Vinh Danh
        </button>
      )}
      <Segmented full value={tab} onChange={(v) => setUi({ publicTab: v })} options={tabs} />
      {body}
    </div>
  );
}
