'use client';

import { Activity, LayoutGrid, MapPin, Radio, Trophy } from 'lucide-react';
import { groupsOfEvent, qualifiersOf, stageName } from '@/lib/engine';
import { useStandingsEngine } from '@/lib/supabase';
import type { TournamentRow, TournamentVM, UIState } from '@/lib/types';
import { KnockoutPreview, MatchRow, StandingsList } from './Standings';
import { Card, GroupBadge, SectionTitle, Segmented, TieBreakerBadge } from './ui';

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
  const ev = vm.events.find((e) => e.id === ui.viewerEvent) ?? vm.events[0];
  const mTab = ui.viewerMatchTab;

  const doneCount = vm.matches.filter((m) => m.status === 'completed').length;
  const pct = Math.round((doneCount / Math.max(1, vm.matches.length)) * 100);

  const tournamentCard = (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 pm-grid-bg opacity-70" />
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#A3E635]/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between md:p-5">
        <div className="min-w-0">
          <label htmlFor="pm-tour" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Giải đấu đang theo dõi</label>
          <select
            id="pm-tour"
            value={vm.tournament.id}
            onChange={(e) => onSelectTournament(e.target.value)}
            className="min-h-[48px] w-full max-w-full rounded-xl border border-[#374151] bg-[#0B0F17] px-3 py-2 pm-display text-base font-bold uppercase text-white md:text-2xl"
          >
            {tournaments.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-[#A3E635]/15 px-2 py-1 font-semibold text-[#A3E635]">
              <LayoutGrid className="h-3 w-3" />{vm.tournament.format === 'group_knockout' ? 'Vòng bảng + Loại trực tiếp' : 'Vòng tròn tính điểm'}
            </span>
            {vm.tournament.status === 'ongoing' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-1 font-semibold text-red-400"><Radio className="h-3 w-3" />Đang diễn ra</span>
            )}
            {vm.tournament.venue && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#1F2937] px-2 py-1 text-slate-300"><MapPin className="h-3 w-3" />{vm.tournament.venue} · {vm.courts.length} sân</span>
            )}
          </div>
        </div>
        <div className="w-full md:w-72">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tiến độ giải</span>
            <span className="pm-num text-2xl font-extrabold text-white">{doneCount}<span className="text-base text-slate-500">/{vm.matches.length} trận</span></span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1F2937]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#06B6D4] to-[#A3E635] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </Card>
  );

  if (!ev) {
    return (
      <div className="flex flex-col gap-4">
        {tournamentCard}
        <Card className="p-8 text-center text-sm text-slate-400">Giải này chưa có nội dung thi đấu. Ban tổ chức sẽ cập nhật sớm.</Card>
      </div>
    );
  }

  const cfg = ev.config;
  const groups = groupsOfEvent(ev);
  const groupActive = cfg.groupsEnabled && groups.includes(ui.viewerGroup);
  const shownGroups = groupActive ? [ui.viewerGroup] : groups;
  const stage = stageName(qualifiersOf(cfg));

  const inView = (m: TournamentVM['matches'][number]) => m.eventId === ev.id && (!groupActive || m.group === ui.viewerGroup || m.type !== 'group');
  const lists = {
    live: vm.matches.filter((m) => m.status === 'live'),
    upcoming: vm.matches.filter((m) => m.status === 'upcoming' && inView(m)),
    completed: vm.matches.filter((m) => m.status === 'completed' && inView(m)).reverse(),
  };

  return (
    <div className="flex flex-col gap-4">
      {tournamentCard}

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="md:w-auto">
          <Segmented full value={ev.id} onChange={(v) => setUi({ viewerEvent: v, viewerGroup: 'all' })} options={vm.events.map((e) => ({ id: e.id, label: e.label }))} />
        </div>
        <TieBreakerBadge order={engine.tieBreakers} onClick={openRules} />
      </div>

      {cfg.groupsEnabled && (
        <div className="flex items-center gap-2 overflow-x-auto pm-noscroll">
          {['all', ...(groups as string[])].map((g) => {
            const on = g === 'all' ? !groupActive : ui.viewerGroup === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setUi({ viewerGroup: g })}
                className={`min-h-[40px] shrink-0 rounded-full border px-4 pm-display text-sm font-bold uppercase ${on ? 'border-[#A3E635] bg-[#A3E635]/15 text-[#A3E635]' : 'border-[#374151] text-slate-400'}`}
              >
                {g === 'all' ? 'Tất cả bảng' : `Bảng ${g}`}
              </button>
            );
          })}
          <span className="ml-auto hidden shrink-0 text-xs text-slate-500 sm:block">Top {cfg.advance} mỗi bảng vào {stage}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className={`grid gap-4 ${shownGroups.length > 1 ? 'xl:grid-cols-2' : ''}`}>
            {shownGroups.map((g) => (
              <Card key={g ?? 'all'}>
                <SectionTitle
                  icon={g ? null : Trophy}
                  right={<span className="text-[11px] text-slate-500">Thắng {vm.rules.pointsPerWin}đ · Top {cfg.advance} → {stage}</span>}
                >
                  {g ? <><GroupBadge g={g} /> Bảng {g}</> : `Bảng xếp hạng · ${ev.label}`}
                </SectionTitle>
                <StandingsList rows={engine.getStandings(ev.id, g)} players={vm.players} advance={cfg.advance} stage={stage} />
              </Card>
            ))}
          </div>
          <KnockoutPreview ties={engine.knockoutFor(ev.id)} stage={stage} players={vm.players} />
        </div>

        <Card>
          <SectionTitle icon={Activity}>Lịch thi đấu</SectionTitle>
          <div className="p-3">
            <Segmented
              full
              size="sm"
              value={mTab}
              onChange={(v) => setUi({ viewerMatchTab: v })}
              options={[
                { id: 'live', label: 'Trực tiếp', count: lists.live.length },
                { id: 'upcoming', label: 'Sắp tới', count: lists.upcoming.length },
                { id: 'completed', label: 'Kết quả', count: lists.completed.length },
              ]}
            />
            <div className="mt-3 flex flex-col gap-2 pm-scroll lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {lists[mTab].length === 0 && <p className="py-6 text-center text-sm text-slate-500">Chưa có trận nào ở mục này.</p>}
              {lists[mTab].map((m) => <MatchRow key={m.id} m={m} vm={vm} />)}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
