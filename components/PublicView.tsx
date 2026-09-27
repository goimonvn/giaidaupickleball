'use client';

import { Check, CheckCircle2, ChevronRight, Crown, Medal, PartyPopper, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fmtDiff, groupsOfEvent, MATCH_TYPE_LABEL, qualifiersOf, stageLabelOf, stageName, TB_LABELS, teamName,
} from '@/lib/engine';
import { getTournamentStore, useStandingsEngine, type StandingsEngine } from '@/lib/supabase';
import type {
  EventVM, KnockoutSeed, MatchType, MatchVM, PlayerRow, PodiumVM, PublicTab, ServerSnapshot, StandingRow, TeamVM,
  TournamentVM, UIState,
} from '@/lib/types';
import {
  AvatarStack, Avatar, BTN_GHOST, CARD, Empty, LiveBadge, Segmented, ServeDot, Sheet, StripGroup, SURFACE, T1, T2, T3, T4,
} from './kit';
import { useConfetti } from './PodiumView';

/* =====================================================================
   Public view — the 3 spectator tabs (approved v4 demo):
   🎾 Trận Đấu (FotMob score strips) · 📊 Xếp Hạng & Nhánh · 🏆 Vinh Danh
   The active tab is chosen by the header tabs (guests) or the bottom nav (staff).
   ===================================================================== */

const peopleOf = (team: Pick<TeamVM, 'pids'> | undefined, players: PlayerRow[]) =>
  (team?.pids ?? []).map((id) => {
    const p = players.find((x) => x.id === id);
    return { id, name: p?.full_name ?? '?', src: p?.avatar_url ?? null };
  });

const teamOf = (vm: TournamentVM, id: string | undefined) => (id ? vm.teams.find((t) => t.id === id) : undefined);
const winnerIdOf = (m: MatchVM) => (m.sa > m.sb ? m.a : m.b);

/** Live label: "LIVE · Hiệp 1" */
const liveLabel = (m: MatchVM) => `LIVE · Hiệp ${m.game}`;

/* ---------------------------- FotMob score strip ---------------------------- */
export function ScoreStrip({ m, vm, onOpen, showEvent = false }: { m: MatchVM; vm: TournamentVM; onOpen: () => void; showEvent?: boolean }) {
  const live = m.status === 'live';
  const done = m.status === 'completed';
  const ev = vm.events.find((e) => e.id === m.eventId);
  const meta = [m.court, showEvent ? ev?.short : null, stageLabelOf(m)].filter(Boolean).join(' • ');
  const rows = [['A', m.a, m.sa], ['B', m.b, m.sb]] as const;

  return (
    <button type="button" onClick={onOpen} className="block w-full px-4 py-2.5 text-left transition hover:bg-white/[0.03]" aria-label={`Chi tiết trận ${teamName(teamOf(vm, m.a), vm.players)} gặp ${teamName(teamOf(vm, m.b), vm.players)}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`${T4} truncate text-slate-500`}>{meta}</span>
        {live ? <LiveBadge label={liveLabel(m)} /> : done ? <span className={`${T4} shrink-0 text-slate-500`}>Kết thúc</span> : <span className={`${T4} shrink-0 text-slate-400`}>{m.time}</span>}
      </div>
      {rows.map(([k, tid, score]) => {
        const team = teamOf(vm, tid);
        const win = done && tid === winnerIdOf(m);
        return (
          <div key={k} className="flex h-7 items-center gap-2">
            <AvatarStack people={peopleOf(team, vm.players)} />
            <span className={`${T3} min-w-0 flex-1 truncate ${done ? (win ? 'text-white' : 'text-slate-500') : 'text-slate-200'}`}>{teamName(team, vm.players)}</span>
            {live && m.serving === k && <ServeDot />}
            <span className={`num pm-num w-6 text-right ${T2} ${live ? 'text-[#84CC16]' : win ? 'text-white' : 'text-slate-500'}`}>{m.status === 'upcoming' ? '–' : score}</span>
          </div>
        );
      })}
    </button>
  );
}

/* ---------------------------- match detail drawer ---------------------------- */
interface LogLine { key: number; text: string; score: string }

/** Rebuild a readable point log from server_state.history (snapshots before each action). */
function pointLog(tournamentId: string, m: MatchVM, singles: boolean): LogLine[] {
  const row = getTournamentStore(tournamentId).getMatch(m.id);
  const hist: ServerSnapshot[] = row?.server_state?.history ?? [];
  if (!hist.length) return [];
  const states: ServerSnapshot[] = [...hist, { a: m.sa, b: m.sb, serving: m.serving, server: m.server }];
  const out: LogLine[] = [];
  for (let i = 1; i < states.length; i++) {
    const p = states[i - 1];
    const c = states[i];
    const score = `${c.a}–${c.b}`;
    if (c.a > p.a) out.push({ key: i, text: 'Đội A ghi điểm', score });
    else if (c.b > p.b) out.push({ key: i, text: 'Đội B ghi điểm', score });
    else if (c.serving !== p.serving) out.push({ key: i, text: `Đổi giao · Đội ${c.serving} giao bóng`, score });
    else if (c.server !== p.server) out.push({ key: i, text: singles ? 'Đổi người giao' : `Người giao số ${c.server}`, score });
  }
  return out.reverse();
}

export function MatchDrawer({ m, vm, onClose }: { m: MatchVM; vm: TournamentVM; onClose: () => void }) {
  const ev = vm.events.find((e) => e.id === m.eventId);
  const live = m.status === 'live';
  const log = useMemo(() => pointLog(vm.tournament.id, m, !!ev?.singles), [vm.tournament.id, m, ev?.singles]);
  const title = [ev?.label, stageLabelOf(m)].filter(Boolean).join(' · ');

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <span className={`${T4} text-slate-500`}>{m.court ?? (m.time ? `Dự kiến ${m.time}` : 'Chưa xếp sân')}</span>
        {live ? <LiveBadge label={liveLabel(m)} /> : <span className={`${T4} text-slate-400`}>{m.status === 'completed' ? 'Kết thúc' : 'Chưa thi đấu'}</span>}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {([['A', m.a, m.sa], ['B', m.b, m.sb]] as const).map(([k, tid, score]) => {
          const team = teamOf(vm, tid);
          return (
            <div key={k} className={`${SURFACE} p-3`}>
              <div className="flex items-center justify-between">
                <span className={`${T2} flex items-center gap-2 text-white`}>Đội {k}{live && m.serving === k && <ServeDot />}</span>
                <span className={`pm-num ${T1} ${live ? 'text-[#84CC16]' : 'text-white'}`}>{m.status === 'upcoming' ? '–' : score}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {(team?.pids ?? []).map((pid) => {
                  const p = vm.players.find((x) => x.id === pid);
                  return (
                    <li key={pid} className="flex items-center gap-2">
                      <Avatar name={p?.full_name ?? '?'} src={p?.avatar_url} size="h-8 w-8" />
                      <span className={`${T3} min-w-0 flex-1 truncate text-slate-200`}>{p?.full_name ?? '?'}</span>
                      {p?.group_tag && <span className={`${T4} rounded bg-white/5 px-1.5 py-0.5 text-slate-300`}>{p.group_tag}</span>}
                      <span className={`pm-num ${T4} rounded bg-white/5 px-1.5 py-0.5 text-slate-200`}>Trình {Number(p?.skill_rating ?? 0).toFixed(1)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className={`mt-3 flex items-center gap-2 ${SURFACE} px-3 py-2.5`}>
        <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
        <span className={`${T4} text-slate-500`}>TRỌNG TÀI</span>
        <span className={`${T3} ml-auto truncate text-slate-200`}>{m.referee ?? 'Chưa phân công'}</span>
      </div>

      <div className="mt-3">
        <p className={`${T4} mb-1.5 text-slate-500`}>NHẬT KÝ ĐIỂM</p>
        {log.length ? (
          <ol className={`${SURFACE} max-h-56 divide-y divide-white/5 overflow-y-auto`}>
            {log.slice(0, 40).map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className={`${T3} text-slate-300`}>{l.text}</span>
                <span className={`pm-num ${T3} text-slate-400`}>{l.score}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={`${T3} text-slate-500`}>{m.status === 'upcoming' ? 'Trận chưa bắt đầu.' : 'Không có nhật ký (kết quả được nhập nhanh).'}</p>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------------------- standings ---------------------------- */
function StandingsTable({ title, rows, players, advance, stage }: { title: string; rows: StandingRow[]; players: PlayerRow[]; advance: number; stage: string }) {
  const cols = 'grid grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_2.25rem_2rem] gap-2';
  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <h3 className={`${T2} text-slate-100`}>{title}</h3>
        <span className={`${T4} text-slate-500`}>Top {advance} → {stage}</span>
      </header>
      <div className={`${cols} px-4 py-2 ${T4} text-slate-500`}>
        <span>#</span><span>Đội</span><span className="text-center">T-B</span><span className="text-center">+/-</span><span className="text-right">Đ</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.team.id} className={`${cols} items-center px-4 py-2 ${i === advance ? 'border-t border-dashed border-white/10' : 'border-t border-white/5'}`}>
          <span className={`pm-num ${T3} ${i < advance ? 'text-white' : 'text-slate-500'}`}>{i + 1}</span>
          <span className={`${T3} flex min-w-0 items-center gap-1.5 ${i < advance ? 'text-slate-100' : 'text-slate-400'}`}>
            <span className="truncate">{teamName(r.team, players)}</span>
            {r.live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#84CC16]" aria-label="Đang thi đấu" />}
            {i < advance && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Đi tiếp" />}
          </span>
          <span className={`pm-num ${T3} text-center text-slate-300`}>{r.w}-{r.l}</span>
          <span className={`pm-num ${T3} text-center text-slate-400`}>{fmtDiff(r.diff)}</span>
          <span className={`pm-num ${T2} text-right text-white`}>{r.pts}</span>
        </div>
      ))}
      {!rows.length && <p className={`${T3} border-t border-white/5 p-4 text-center text-slate-500`}>Chưa có đội.</p>}
    </section>
  );
}

/* ---------------------------- knockout bracket ---------------------------- */
const seed = (label: string, team?: TeamVM): KnockoutSeed => ({ label, team });

function BracketCard({ label, m, vm, placeholder }: { label: string; m?: MatchVM; vm: TournamentVM; placeholder?: KnockoutSeed[] }) {
  const live = m?.status === 'live';
  const done = m?.status === 'completed';
  const rows = m
    ? [{ key: 'a', seed: '', team: teamOf(vm, m.a), score: m.sa }, { key: 'b', seed: '', team: teamOf(vm, m.b), score: m.sb }]
    : (placeholder ?? [seed(''), seed('')]).map((s, i) => ({ key: String(i), seed: s.label, team: s.team, score: null as number | null }));
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className={`${T4} truncate text-slate-500`}>{label}</span>
        {live ? <LiveBadge /> : done ? <Check className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Đã xong" /> : <span className={`${T4} shrink-0 text-slate-600`}>{m ? m.time || 'Chờ sân' : 'Dự kiến'}</span>}
      </div>
      {rows.map((r) => {
        const win = !!(done && m && r.team?.id === winnerIdOf(m));
        return (
          <div key={r.key} className="flex h-9 items-center gap-2 px-3">
            {r.team && r.seed && <span className={`pm-num ${T4} w-6 shrink-0 text-slate-500`}>{r.seed}</span>}
            <span className={`${T3} min-w-0 flex-1 truncate ${r.team ? (win ? 'text-white' : done ? 'text-slate-500' : 'text-slate-200') : 'text-slate-600'}`}>
              {r.team ? teamName(r.team, vm.players) : r.seed || 'Chờ xác định'}
            </span>
            {m && m.status !== 'upcoming' && r.score != null && (
              <span className={`pm-num ${T2} ${live ? 'text-[#84CC16]' : win ? 'text-white' : 'text-slate-500'}`}>{r.score}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tứ kết / Bán kết → Chung kết + Tranh hạng 3. Before the knockout exists, shows pairings projected from the standings. */
export function Bracket({ vm, ev, engine }: { vm: TournamentVM; ev: EventVM; engine: StandingsEngine }) {
  const br = engine.bracketFor(ev.id);
  if (!br) return null;
  const ko = vm.matches.filter((m) => m.eventId === ev.id && m.type !== 'group');
  const q = qualifiersOf(ev.config);
  const projectedType: MatchType = q >= 8 ? 'quarterfinal' : q >= 4 ? 'semifinal' : 'final';

  if (!ko.length && !br.projected.length) {
    return <p className={`${T3} px-1 text-slate-500`}>Nội dung này xếp hạng theo vòng tròn, không có nhánh loại trực tiếp.</p>;
  }

  const left: ReactNode[] = [];
  ko.filter((m) => m.type === 'quarterfinal').forEach((m, i) => left.push(<BracketCard key={m.id} label={`Tứ kết ${i + 1}`} m={m} vm={vm} />));
  br.semis.forEach((m, i) => left.push(<BracketCard key={m.id} label={`Bán kết ${i + 1}`} m={m} vm={vm} />));
  if (!ko.length && projectedType !== 'final') {
    br.projected.forEach((t, i) => left.push(
      <BracketCard key={`p${i}`} label={`${MATCH_TYPE_LABEL[projectedType]} ${i + 1} · ${t[0].label} – ${t[1].label}`} vm={vm} placeholder={t} />,
    ));
  }
  const hasSemis = br.semis.length > 0 || (!ko.length && projectedType === 'semifinal');
  const finalSeeds = !ko.length && projectedType === 'final' ? br.projected[0] : hasSemis ? [seed('Thắng BK1'), seed('Thắng BK2')] : undefined;

  const right = (
    <div className="flex flex-col gap-3">
      <p className={`${T4} text-slate-500`}>CHUNG KẾT</p>
      <BracketCard label="Chung kết" m={br.final} vm={vm} placeholder={finalSeeds} />
      {(br.bronze || (hasSemis && vm.rules.bronzeMatch !== false)) && <BracketCard label={MATCH_TYPE_LABEL.bronze} m={br.bronze} vm={vm} placeholder={[seed('Thua BK1'), seed('Thua BK2')]} />}
      {!br.bronze && hasSemis && vm.rules.bronzeMatch === false && (
        <p className={`${T4} px-1 text-slate-500`}>Không đá Tranh hạng 3 · 2 đội thua Bán kết đồng hạng 3.</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {!ko.length && <p className={`${T4} px-1 text-slate-500`}>Dự kiến theo bảng xếp hạng hiện tại · {stageName(q)}</p>}
      {left.length ? (
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="flex flex-col gap-3">
            <p className={`${T4} text-slate-500`}>{projectedType === 'quarterfinal' ? 'TỨ KẾT & BÁN KẾT' : 'BÁN KẾT'}</p>
            {left}
          </div>
          <ChevronRight className="mx-auto hidden h-5 w-5 text-slate-600 md:block" aria-hidden="true" />
          {right}
        </div>
      ) : right}
    </div>
  );
}

/* ---------------------------- podium ---------------------------- */
function Podium({ podium, players }: { podium: PodiumVM; players: PlayerRow[] }) {
  const cols = [
    { place: 2 as const, h: 'h-20', grad: 'from-slate-200 to-slate-500', label: 'Á quân', icon: Medal },
    { place: 1 as const, h: 'h-28', grad: 'from-amber-300 to-amber-600', label: 'Vô địch', icon: Crown },
    { place: 3 as const, h: 'h-14', grad: 'from-orange-400 to-orange-800', label: 'Hạng Ba', icon: Medal },
  ];
  return (
    <div className="flex items-end gap-2 sm:gap-4">
      {cols.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.place} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            {podium.entries.filter((e) => e.place === c.place).map((e) => (
              <div key={e.team.id} className="flex w-full flex-col items-center gap-1 text-center">
                <span className="flex -space-x-2">
                  {peopleOf(e.team, players).map((p) => <Avatar key={p.id} name={p.name} src={p.src} size="h-10 w-10" />)}
                </span>
                <span className={`${T3} w-full truncate text-white`}>{teamName(e.team, players)}</span>
                <span className={`pm-num ${T4} text-slate-500`}>{e.stats.w}T-{e.stats.l}B · {fmtDiff(e.stats.diff)}</span>
              </div>
            ))}
            <div className={`flex w-full flex-col items-center justify-start gap-0.5 rounded-t-2xl bg-gradient-to-b ${c.grad} ${c.h} pt-2`}>
              <Icon className="h-5 w-5 text-slate-950" aria-hidden="true" />
              <span className={`pm-num ${T1} text-slate-950`}>{c.place}</span>
              <span className={`${T4} text-slate-950/80`}>{c.place === 3 && podium.entries.filter((e) => e.place === 3).length > 1 ? 'Đồng hạng Ba' : c.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ======================= PublicView ======================= */
export default function PublicView({ vm, tab, ui, setUi }: { vm: TournamentVM; tab: PublicTab; ui: UIState; setUi: (patch: Partial<UIState>) => void }) {
  const engine = useStandingsEngine(vm.tournament.id);
  const fire = useConfetti();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  const multi = vm.events.length > 1;
  // Trận Đấu may show all events (null); the other tabs need one event
  const selected = vm.events.find((e) => e.id === ui.viewerEvent) ?? null;
  const ev = selected ?? vm.events[0];
  const podium = ev ? engine.podiumFor(ev.id) : null;
  const podiumReady = !!podium && podium.entries.length > 0 && (podium.decided || vm.locked);

  useEffect(() => {
    if (tab === 'podium' && podiumReady) void fire();
  }, [tab, podiumReady, ev?.id, fire]);

  if (!ev) return <Empty>Giải chưa có nội dung thi đấu. Ban tổ chức sẽ cập nhật sớm.</Empty>;

  const eventPicker = (allowAll: boolean) => multi && (
    <Segmented
      full
      label="Nội dung thi đấu"
      value={allowAll ? (selected?.id ?? 'all') : ev.id}
      onChange={(v) => setUi({ viewerEvent: v === 'all' ? null : v, viewerGroup: 'all' })}
      options={[...(allowAll ? [{ id: 'all', label: 'Tất cả' }] : []), ...vm.events.map((e) => ({ id: e.id, label: e.short || e.label }))]}
    />
  );

  const openMatch = openId ? vm.matches.find((m) => m.id === openId) : undefined;
  let body: ReactNode;

  if (tab === 'matches') {
    const inScope = (m: MatchVM) => !selected || m.eventId === selected.id;
    const live = vm.matches.filter((m) => m.status === 'live' && inScope(m)).sort((a, b) => (a.court ?? '').localeCompare(b.court ?? ''));
    const upcoming = vm.matches.filter((m) => m.status === 'upcoming' && inScope(m));
    const done = vm.matches.filter((m) => m.status === 'completed' && inScope(m)).reverse();
    const strip = (m: MatchVM) => <ScoreStrip key={m.id} m={m} vm={vm} showEvent={multi && !selected} onOpen={() => setOpenId(m.id)} />;
    const more = (shown: boolean, total: number, set: (v: boolean) => void) => total > 8 && (
      <button type="button" onClick={() => set(!shown)} className={`w-full px-4 py-2.5 ${T3} text-slate-400 hover:bg-white/[0.03] hover:text-white`}>
        {shown ? 'Thu gọn' : `Xem thêm ${total - 8} trận`}
      </button>
    );

    body = (
      <>
        {eventPicker(true)}
        {!vm.matches.length ? (
          <Empty>Giải chưa có lịch thi đấu. Ban tổ chức sẽ cập nhật sớm.</Empty>
        ) : (
          <>
            {live.length > 0 && (
              <StripGroup title="Đang diễn ra" right={<LiveBadge label={`${live.length} SÂN`} />}>{live.map(strip)}</StripGroup>
            )}
            {upcoming.length > 0 && (
              <StripGroup title="Sắp diễn ra" right={<span className={`${T4} text-slate-500`}>{upcoming.length} trận</span>}>
                {(showAllUpcoming ? upcoming : upcoming.slice(0, 8)).map(strip)}
                {more(showAllUpcoming, upcoming.length, setShowAllUpcoming)}
              </StripGroup>
            )}
            {done.length > 0 && (
              <StripGroup title="Kết quả" right={<span className={`${T4} text-slate-500`}>{done.length} trận</span>}>
                {(showAllDone ? done : done.slice(0, 8)).map(strip)}
                {more(showAllDone, done.length, setShowAllDone)}
              </StripGroup>
            )}
            {!live.length && !upcoming.length && !done.length && <Empty>Nội dung này chưa có trận nào.</Empty>}
          </>
        )}
      </>
    );
  } else if (tab === 'table') {
    const cfg = ev.config;
    const stage = stageName(qualifiersOf(cfg));
    const groups = groupsOfEvent(ev);
    body = (
      <>
        {eventPicker(false)}
        <div className={`grid gap-4 ${groups.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {groups.map((g) => (
            <StandingsTable key={g ?? 'all'} title={g ? `Bảng ${g}` : `Bảng xếp hạng · ${ev.label}`} rows={engine.getStandings(ev.id, g)} players={vm.players} advance={cfg.advance} stage={stage} />
          ))}
        </div>
        <p className={`${T4} px-1 text-slate-500`}>Ưu tiên khi bằng điểm: {engine.tieBreakers.map((k) => TB_LABELS[k]).join(' → ')}</p>
        <section className="flex flex-col gap-3">
          <h3 className={`${T2} px-1 text-slate-100`}>Nhánh loại trực tiếp</h3>
          <Bracket vm={vm} ev={ev} engine={engine} />
        </section>
      </>
    );
  } else {
    body = (
      <>
        {eventPicker(false)}
        <section className={`${CARD} relative overflow-hidden p-4`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,.14),transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`${T4} text-amber-300`}>BẢNG VÀNG VINH DANH</p>
              <h2 className={`${T1} truncate text-white`}>{vm.tournament.title}</h2>
              <p className={`${T3} text-slate-400`}>{ev.label}</p>
            </div>
            {podiumReady && (
              <button type="button" onClick={() => void fire()} className={BTN_GHOST}>
                <PartyPopper className="h-4 w-4" /> Pháo hoa
              </button>
            )}
          </div>
          <div className="relative mt-6">
            {podiumReady && podium ? (
              <>
                <Podium podium={podium} players={vm.players} />
                {!podium.decided && <p className={`${T4} mt-3 text-slate-500`}>Xếp hạng tạm theo bảng điểm.</p>}
              </>
            ) : (
              <p className={`${T3} py-10 text-center text-slate-400`}>Bảng vàng sẽ hiện khi trận Chung kết kết thúc.</p>
            )}
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {body}
      {openMatch && <MatchDrawer m={openMatch} vm={vm} onClose={() => setOpenId(null)} />}
    </div>
  );
}
