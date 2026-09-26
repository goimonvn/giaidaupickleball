'use client';

import {
  CheckCircle2, ChevronRight, Crown, Flag, Hand, LayoutGrid, Lock, LockOpen, Medal, Play, Plus, RefreshCw, Scale,
  Settings, Shield, Shuffle, Trophy, UserCog, Users, X, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { completeTournament, createFinals, createTournament, reopenTournament, setTournamentParticipants } from '@/lib/actions';
import { applyEventSetup, createKnockout, refreshTournament, updateRules } from '@/lib/client-actions';
import {
  GROUP_LETTERS, generatePairs, groupsOfEvent, qualifiersOf, snakeAssign, stageName, stageType, teamAvg, teamName,
  type DraftTeam,
} from '@/lib/engine';
import { useStandingsEngine, type AuthState } from '@/lib/supabase';
import type { EventVM, PlayerRow, TieBreaker, TournamentVM, UIState } from '@/lib/types';
import MemberPicker from './MemberPicker';
import { TieBreakerList } from './RulesModal';
import { KnockoutPreview, StandingsList } from './Standings';
import { Card, ConfirmBar, EmptyState, GroupBadge, SectionTitle, Segmented, Toggle } from './ui';

export interface GroupDraft {
  enabled: boolean;
  numGroups: number;
  advance: number;
  method: 'snake' | 'manual';
  assign: Record<string, string>;
}

type Toast = (msg: string, kind?: 'ok' | 'error') => void;

const eventOffset = (vm: TournamentVM, eventId: string) => Math.max(0, vm.events.findIndex((e) => e.id === eventId)) * 1000;

function initGroupDraft(vm: TournamentVM, ev: EventVM): GroupDraft {
  const cfg = ev.config;
  const teams = vm.teams.filter((t) => t.eventId === ev.id);
  const numGroups = cfg.groupsEnabled ? cfg.numGroups : 2;
  const assign = cfg.groupsEnabled
    ? Object.fromEntries(teams.map((t) => [t.id, t.group ?? 'A']))
    : snakeAssign(teams, numGroups, vm.players);
  return { enabled: cfg.groupsEnabled, numGroups, advance: cfg.advance, method: 'snake', assign };
}

/* ======================= Tournament creator wizard ======================= */
const EVENT_PRESETS = [
  { code: 'dn', name: 'Đôi Nam', short: 'ĐN', singles: false },
  { code: 'dnu', name: 'Đôi Nữ', short: 'ĐNỮ', singles: false },
  { code: 'dnn', name: 'Đôi Nam Nữ', short: 'ĐNN', singles: false },
  { code: 'don', name: 'Đơn Nam', short: 'ĐƠN', singles: true },
  { code: 'donu', name: 'Đơn Nữ', short: 'ĐƠN NỮ', singles: true },
];

function TournamentCreator({ players, onCreated, toast }: { players: PlayerRow[]; onCreated: (id: string) => void; toast: Toast }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [courts, setCourts] = useState(2);
  const [events, setEvents] = useState<string[]>(['dn', 'dnn', 'don']);
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inputCls = 'min-h-[44px] w-full rounded-xl border border-[#374151] bg-[#0B0F17] px-3 text-sm text-white placeholder:text-slate-600';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || !events.length) return;
    setBusy(true);
    const res = await createTournament({
      title: title.trim(),
      venue: venue.trim(),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      courts: Array.from({ length: courts }, (_, i) => `Sân ${i + 1}`),
      events: EVENT_PRESETS.filter((p) => events.includes(p.code)),
      playerIds,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`Đã tạo giải "${res.data.title}" với ${playerIds.length} VĐV`);
    setOpen(false);
    setTitle('');
    setPlayerIds([]);
    onCreated(res.data.id);
  };

  return (
    <Card>
      <SectionTitle
        icon={Trophy}
        eyebrow="Tạo giải mới"
        right={
          <button type="button" onClick={() => setOpen(!open)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#06B6D4] px-3 text-sm font-bold text-[#0B0F17]">
            {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {open ? 'Đóng' : 'Tạo giải'}
          </button>
        }
      >
        Trình tạo giải đấu
      </SectionTitle>
      {open && (
        <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="pm-t-title" className="mb-1 block text-xs text-slate-500">Tên giải</label>
            <input id="pm-t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Giải Pickleball Hà Nội Open 2026 - Mở Rộng" className={inputCls} />
          </div>
          <div>
            <label htmlFor="pm-t-venue" className="mb-1 block text-xs text-slate-500">Địa điểm</label>
            <input id="pm-t-venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="CLB Pickleball Cầu Giấy" className={inputCls} />
          </div>
          <div>
            <label htmlFor="pm-t-start" className="mb-1 block text-xs text-slate-500">Giờ bắt đầu</label>
            <input id="pm-t-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Số sân</p>
            <Segmented full size="sm" value={courts} onChange={setCourts} options={[1, 2, 3, 4].map((n) => ({ id: n, label: `${n} sân` }))} />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs text-slate-500">Nội dung thi đấu</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_PRESETS.map((p) => {
                const on = events.includes(p.code);
                return (
                  <button
                    key={p.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setEvents(on ? events.filter((x) => x !== p.code) : [...events, p.code])}
                    className={`min-h-[40px] rounded-lg border px-3 text-sm font-semibold ${on ? 'border-[#A3E635] bg-[#A3E635]/15 text-[#A3E635]' : 'border-[#374151] text-slate-400'}`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>VĐV tham gia (chọn từ danh sách thành viên)</span>
              <Link href="/members" className="font-semibold text-[#06B6D4]">Quản lý thành viên</Link>
            </p>
            <MemberPicker players={players} selected={playerIds} onChange={setPlayerIds} idPrefix="pm-create" />
          </div>
          <button type="submit" disabled={busy || title.trim().length < 3 || !events.length} className="min-h-[48px] rounded-xl bg-[#A3E635] pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-40 sm:col-span-2">
            {busy ? 'Đang tạo…' : `Tạo giải đấu${playerIds.length ? ` · ${playerIds.length} VĐV` : ''}`}
          </button>
        </form>
      )}
    </Card>
  );
}

/* ======================= Step 1 — pair generator ======================= */
function PairGenerator({ vm, ev, draft, clearDraft, toast }: { vm: TournamentVM; ev: EventVM; draft: GroupDraft; clearDraft: () => void; toast: Toast }) {
  const singles = ev.singles;
  // Pool = members registered for this tournament (or everyone when none registered yet)
  const players = vm.participantIds.length ? vm.players.filter((p) => vm.participantIds.includes(p.id)) : vm.players;
  const [method, setMethod] = useState<'skill' | 'club' | 'manual'>('skill');
  const [pool, setPool] = useState<'M' | 'F' | 'all'>(ev.code === 'dnn' ? 'all' : 'M');
  const [manualPairs, setManualPairs] = useState<PlayerRow[][]>([]);
  const [pick, setPick] = useState<PlayerRow | null>(null);
  const [preview, setPreview] = useState<PlayerRow[][] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const poolPlayers = players.filter((p) => pool === 'all' || p.gender === pool);
  const usedIds = new Set(manualPairs.flat().map((p) => p.id));

  const clickManual = (p: PlayerRow) => {
    if (usedIds.has(p.id)) return;
    if (!pick) { setPick(p); return; }
    if (pick.id === p.id) { setPick(null); return; }
    setManualPairs([...manualPairs, [pick, p]]);
    setPick(null);
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      let teams: DraftTeam[] = preview.map((pr, i) => ({ key: `t${i + 1}`, pids: pr.map((p) => p.id), group: null }));
      const enabled = draft.enabled && teams.length >= draft.numGroups * 2;
      if (enabled) {
        const asg = snakeAssign(teams.map((t) => ({ id: t.key, pids: t.pids })), draft.numGroups, players);
        teams = teams.map((t) => ({ ...t, group: asg[t.key] }));
      }
      await applyEventSetup({
        tournament: vm.tournament,
        eventId: ev.id,
        teams,
        config: enabled ? { groupsEnabled: true, numGroups: draft.numGroups, advance: draft.advance } : { groupsEnabled: false, numGroups: 1, advance: draft.advance },
        players,
        orderOffset: eventOffset(vm, ev.id),
      });
      clearDraft();
      setConfirm(false);
      setPreview(null);
      toast(`Đã tạo ${teams.length} ${singles ? 'VĐV' : 'cặp'} cho ${ev.label}${enabled ? ` · chia ${draft.numGroups} bảng` : ''}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const methods = [
    { id: 'skill' as const, title: 'Theo trình (Giỏi + Kém)', desc: 'Người trình cao nhất ghép với người thấp nhất.', icon: Zap },
    { id: 'club' as const, title: 'Đan xen nhóm (A + B)', desc: 'Mỗi cặp gồm 2 VĐV thuộc 2 nhóm khác nhau.', icon: Shuffle },
    { id: 'manual' as const, title: 'Tự do / Thủ công', desc: 'Chạm lần lượt 2 VĐV để ghép.', icon: Hand },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-[#1F2937] px-2.5 py-2 text-xs font-semibold text-slate-300">Thể thức: <b className="text-white">{singles ? 'Đơn' : 'Đôi'}</b></span>
        <Segmented size="sm" value={pool} onChange={(v) => { setPool(v); setPreview(null); setManualPairs([]); setPick(null); }} options={[{ id: 'M' as const, label: 'Nam' }, { id: 'F' as const, label: 'Nữ' }, { id: 'all' as const, label: 'Tất cả' }]} />
      </div>

      {!singles && (
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Cách ghép cặp">
          {methods.map((m) => {
            const on = method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { setMethod(m.id); setPreview(null); }}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${on ? 'border-[#A3E635] bg-[#A3E635]/[0.07]' : 'border-[#374151] bg-[#0B0F17]'}`}
              >
                <m.icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-[#A3E635]' : 'text-slate-500'}`} />
                <span>
                  <span className="block text-sm font-bold text-white">{m.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{m.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!singles && method === 'manual' && (
        <div className="rounded-xl border border-dashed border-[#374151] p-3">
          <p className="mb-2 text-xs text-slate-400">
            {pick ? <>Đã chọn <b className="text-[#A3E635]">{pick.full_name}</b>. Chọn người đánh cặp.</> : 'Chạm VĐV thứ nhất, rồi VĐV thứ hai để ghép cặp.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {poolPlayers.map((p) => {
              const used = usedIds.has(p.id);
              const sel = pick?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={used}
                  onClick={() => clickManual(p)}
                  className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-semibold transition ${sel ? 'border-[#A3E635] bg-[#A3E635] text-[#0B0F17]' : used ? 'border-transparent bg-[#1F2937] text-slate-600 line-through' : 'border-[#374151] bg-[#0B0F17] text-slate-200'}`}
                >
                  {p.full_name} <span className="opacity-70">{p.skill_rating.toFixed(1)}</span>
                </button>
              );
            })}
          </div>
          {manualPairs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {manualPairs.map((pr, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-[#06B6D4]/15 py-1 pl-2.5 pr-1 text-xs font-semibold text-cyan-300">
                  {pr[0].full_name} + {pr[1].full_name}
                  <button type="button" aria-label="Bỏ cặp" onClick={() => setManualPairs(manualPairs.filter((_, j) => j !== i))} className="flex h-7 w-7 items-center justify-center hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPreview(!singles && method === 'manual' ? manualPairs : generatePairs(poolPlayers, method, singles))}
        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#A3E635]/60 pm-display text-base font-bold uppercase text-[#A3E635] hover:bg-[#A3E635]/10"
      >
        <RefreshCw className="h-4 w-4" /> {singles ? 'Tạo danh sách VĐV' : 'Xem trước cặp đấu'}
      </button>

      {preview && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Xem trước · {preview.length} {singles ? 'VĐV' : 'cặp'}</p>
          {preview.length < 3 ? (
            <p className="text-sm text-slate-500">Cần ít nhất 3 {singles ? 'VĐV' : 'cặp'} để tạo lịch vòng tròn.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {preview.map((pr, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-[#374151] bg-[#0B0F17] px-3 py-2">
                  <span className="pm-num text-lg font-extrabold text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{pr.map((p) => p.full_name).join(' + ')}</div>
                    <div className="truncate text-[11px] text-slate-500">{pr.map((p) => `${p.skill_rating.toFixed(1)} · ${p.group_tag}`).join('  /  ')}</div>
                  </div>
                  <span className="pm-num text-base font-bold text-[#06B6D4]">{(pr.reduce((s, p) => s + p.skill_rating, 0) / pr.length).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {preview.length >= 3 && (confirm ? (
            <ConfirmBar
              text={`Thay toàn bộ đội của ${ev.label} bằng ${preview.length} ${singles ? 'VĐV' : 'cặp'} này và tạo lại lịch.`}
              onCancel={() => setConfirm(false)}
              onConfirm={() => void apply()}
              confirmLabel="Xác nhận"
              busy={busy}
            />
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#A3E635] pm-display text-base font-bold uppercase text-[#0B0F17]">
              <Play className="h-4 w-4" /> Áp dụng cho {ev.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================= Step 2 — group stage ======================= */
function GroupStagePanel({ vm, ev, draft, setDraft, clearDraft, toast }: { vm: TournamentVM; ev: EventVM; draft: GroupDraft; setDraft: (p: Partial<GroupDraft>) => void; clearDraft: () => void; toast: Toast }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragId = useRef<string | null>(null);
  const players = vm.players;
  const catTeams = vm.teams.filter((t) => t.eventId === ev.id);
  const n = catTeams.length;
  const groupOpts = [2, 3, 4].filter((g) => n / g >= 2);
  const labels = GROUP_LETTERS.slice(0, draft.numGroups) as readonly string[];
  const seedOrder = [...catTeams].sort((a, b) => teamAvg(b, players) - teamAvg(a, players));
  const seedOf = (id: string) => seedOrder.findIndex((t) => t.id === id) + 1;
  const counts = Object.fromEntries(labels.map((g) => [g, catTeams.filter((t) => draft.assign[t.id] === g).length]));
  const invalid = n < 2 || (draft.enabled && labels.some((g) => counts[g] < 2));
  const doneInCat = vm.matches.filter((m) => m.eventId === ev.id && m.status === 'completed').length;

  const setNumGroups = (g: number) => setDraft({ numGroups: g, assign: snakeAssign(catTeams, g, players) });
  const setMethod = (method: GroupDraft['method']) => setDraft(method === 'snake' ? { method, assign: snakeAssign(catTeams, draft.numGroups, players) } : { method });
  const moveTeam = (id: string, g: string) => setDraft({ assign: { ...draft.assign, [id]: g }, method: 'manual' });

  const apply = async () => {
    setBusy(true);
    try {
      const config = draft.enabled
        ? { groupsEnabled: true, numGroups: draft.numGroups, advance: draft.advance }
        : { groupsEnabled: false, numGroups: 1, advance: draft.advance };
      await applyEventSetup({
        tournament: vm.tournament,
        eventId: ev.id,
        teams: catTeams.map((t) => ({ key: t.id, pids: t.pids, group: draft.enabled ? draft.assign[t.id] : null })),
        config,
        players,
        orderOffset: eventOffset(vm, ev.id),
      });
      clearDraft();
      setConfirm(false);
      toast(draft.enabled ? `Đã chia ${ev.label} thành ${draft.numGroups} bảng và tạo lịch mới` : `${ev.label}: đã chuyển về 1 bảng vòng tròn`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const qualifiers = draft.enabled ? draft.numGroups * draft.advance : draft.advance;
  const matchesPreview = draft.enabled ? labels.reduce((s, g) => s + (counts[g] * (counts[g] - 1)) / 2, 0) : (n * (n - 1)) / 2;

  if (!n) {
    return <p className="p-4 text-sm text-slate-400">Chưa có đội nào. Hãy ghép cặp ở Bước 1 trước.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Toggle id="pm-groups-toggle" checked={draft.enabled} onChange={(v) => setDraft({ enabled: v })} label="Bật chế độ Chia Bảng" />

      <div className="grid grid-cols-2 gap-3">
        {draft.enabled && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Số bảng</p>
            <Segmented full size="sm" value={draft.numGroups} onChange={setNumGroups} options={groupOpts.map((g) => ({ id: g, label: `${g} bảng` }))} />
          </div>
        )}
        <div className={draft.enabled ? '' : 'col-span-2'}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{draft.enabled ? 'Đi tiếp mỗi bảng' : 'Số đội đi tiếp'}</p>
          <Segmented full size="sm" value={draft.advance} onChange={(v) => setDraft({ advance: v })} options={[1, 2].map((a) => ({ id: a, label: `Top ${a}` }))} />
        </div>
      </div>

      {draft.enabled && (
        <>
          <div role="radiogroup" aria-label="Phương thức chia bảng" className="grid gap-2 sm:grid-cols-2">
            {([
              { id: 'snake', icon: Scale, title: 'Tự động theo trình độ', desc: 'Xếp hạt giống theo trình TB rồi rải kiểu rắn: A-B-B-A…' },
              { id: 'manual', icon: Hand, title: 'Thủ công', desc: 'Chọn bảng cho từng đội hoặc kéo thả giữa các bảng.' },
            ] as const).map((m) => {
              const on = draft.method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMethod(m.id)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${on ? 'border-[#A3E635] bg-[#A3E635]/[0.07]' : 'border-[#374151] bg-[#0B0F17]'}`}
                >
                  <m.icon className={`mt-0.5 h-5 w-5 shrink-0 ${on ? 'text-[#A3E635]' : 'text-slate-500'}`} />
                  <span>
                    <span className="block text-sm font-bold text-white">{m.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{m.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {labels.map((g) => {
              const gTeams = catTeams.filter((t) => draft.assign[t.id] === g).sort((a, b) => seedOf(a.id) - seedOf(b.id));
              const avg = gTeams.length ? gTeams.reduce((s, t) => s + teamAvg(t, players), 0) / gTeams.length : 0;
              return (
                <div
                  key={g}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragId.current) moveTeam(dragId.current, g); dragId.current = null; }}
                  className={`rounded-xl border bg-[#0B0F17] ${counts[g] < 2 ? 'border-rose-500/60' : 'border-[#374151]'}`}
                >
                  <div className="flex items-center justify-between border-b border-[#374151]/70 px-3 py-2">
                    <span className="flex items-center gap-2 pm-display text-base font-extrabold uppercase text-white"><GroupBadge g={g} size="sm" /> Bảng {g}</span>
                    <span className="text-[11px] text-slate-400">{gTeams.length} đội · TB <b className="pm-num text-sm text-[#06B6D4]">{avg.toFixed(2)}</b></span>
                  </div>
                  <div className="flex flex-col gap-1 p-2">
                    {gTeams.length === 0 && <p className="px-1 py-3 text-center text-xs text-slate-500">Kéo đội vào đây</p>}
                    {gTeams.map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => { dragId.current = t.id; }}
                        className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[#111827] px-2 py-1.5"
                      >
                        <span className="w-7 pm-num text-xs font-bold text-[#F59E0B]" title="Hạt giống">#{seedOf(t.id)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{teamName(t, players)}</span>
                        <span className="pm-num text-xs text-slate-400">{teamAvg(t, players).toFixed(2)}</span>
                        <select
                          aria-label={`Chuyển ${teamName(t, players)} sang bảng`}
                          value={g}
                          onChange={(e) => moveTeam(t.id, e.target.value)}
                          className="h-9 rounded-md border border-[#374151] bg-[#0B0F17] px-1.5 text-xs font-bold text-white"
                        >
                          {labels.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-[#0B0F17] px-3 py-2.5 text-xs text-slate-400">
        <span><b className="pm-num text-sm text-white">{n}</b> đội</span>
        <span><b className="pm-num text-sm text-white">{matchesPreview}</b> trận vòng bảng</span>
        <span><b className="pm-num text-sm text-white">{qualifiers}</b> đội vào {stageName(qualifiers)}</span>
      </div>

      {invalid && <p className="text-xs text-rose-400">Mỗi bảng cần ít nhất 2 đội. Hãy chuyển thêm đội vào bảng đang thiếu.</p>}

      {confirm ? (
        <ConfirmBar
          text={`Lịch ${ev.label} sẽ được tạo lại${doneInCat ? ` và ${doneInCat} kết quả đã nhập sẽ bị xoá` : ''}.`}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void apply()}
          confirmLabel="Áp dụng & tạo lịch"
          busy={busy}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={clearDraft} className="min-h-[48px] rounded-xl border border-[#374151] text-sm font-semibold text-slate-300">Hoàn tác thay đổi</button>
          <button type="button" disabled={invalid} onClick={() => setConfirm(true)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#A3E635] pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-40">
            <CheckCircle2 className="h-4 w-4" /> Áp dụng chia bảng
          </button>
        </div>
      )}
    </div>
  );
}

/* ======================= Participants (from member database) ======================= */
function ParticipantsPanel({ vm, toast }: { vm: TournamentVM; toast: Toast }) {
  const [selected, setSelected] = useState<string[]>(vm.participantIds);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSelected(vm.participantIds); }, [vm.participantIds]);
  const dirty = selected.length !== vm.participantIds.length || selected.some((id) => !vm.participantIds.includes(id));

  const save = async () => {
    setBusy(true);
    const res = await setTournamentParticipants(vm.tournament.id, selected);
    setBusy(false);
    if (!res.ok) { toast(res.error, 'error'); return; }
    await refreshTournament(vm.tournament.id);
    toast(`Đã lưu ${res.data} VĐV tham gia giải`);
  };

  return (
    <Card>
      <SectionTitle
        icon={Users}
        eyebrow="VĐV tham gia giải"
        right={<Link href="/members" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#374151] px-3 text-sm font-semibold text-slate-300">Thành viên <ChevronRight className="h-4 w-4" /></Link>}
      >
        {vm.participantIds.length || 'Chưa chọn'} VĐV
      </SectionTitle>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-slate-400">
          Bước 1 chỉ ghép cặp trong danh sách này. Nếu chưa chọn ai, hệ thống dùng toàn bộ thành viên.
        </p>
        <MemberPicker players={vm.players} selected={selected} onChange={setSelected} disabled={vm.locked} idPrefix="pm-part" />
        {!vm.locked && (
          <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="min-h-[48px] rounded-xl bg-[#A3E635] pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-40">
            {busy ? 'Đang lưu…' : dirty ? `Lưu danh sách (${selected.length})` : 'Đã lưu'}
          </button>
        )}
      </div>
    </Card>
  );
}

/* ======================= Tournament lifecycle ======================= */
function LifecyclePanel({ vm, auth, toast }: { vm: TournamentVM; auth: AuthState; toast: Toast }) {
  const engine = useStandingsEngine(vm.tournament.id);
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const unfinished = vm.matches.filter((m) => m.status !== 'completed').length;
  const live = vm.matches.filter((m) => m.status === 'live').length;

  const finalsReady = vm.events
    .map((ev) => ({ ev, br: engine.bracketFor(ev.id) }))
    .filter((x) => x.br?.canCreateFinals);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    setConfirm(null);
    if (!res.ok) { toast(res.error ?? 'Có lỗi xảy ra', 'error'); return; }
    await refreshTournament(vm.tournament.id);
    toast(okMsg);
  };

  return (
    <Card>
      <SectionTitle icon={Flag} eyebrow="Vòng đời giải đấu">
        {vm.locked ? 'Giải đã kết thúc' : 'Loại trực tiếp & kết thúc giải'}
      </SectionTitle>
      <div className="flex flex-col gap-3 p-4">
        {!vm.locked && finalsReady.map(({ ev }) => (
          <div key={ev.id} className="flex flex-col gap-2 rounded-xl border border-[#A3E635]/40 bg-[#A3E635]/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-200"><b className="text-white">{ev.label}</b>: 2 trận Bán kết đã xong.</p>
            <button
              type="button"
              disabled={busy === ev.id}
              onClick={() => void run(ev.id, () => createFinals(ev.id), `Đã tạo Chung kết & Tranh hạng Ba · ${ev.label}`)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#A3E635] px-4 pm-display text-sm font-bold uppercase text-[#0B0F17] disabled:opacity-50"
            >
              <Medal className="h-4 w-4" /> {busy === ev.id ? 'Đang tạo…' : 'Tạo trận Chung kết & Tranh Hạng Ba'}
            </button>
          </div>
        ))}

        {vm.locked ? (
          <>
            <p className="flex items-center gap-2 rounded-xl bg-[#0B0F17] px-3 py-3 text-sm text-slate-300">
              <Lock className="h-4 w-4 shrink-0 text-[#F59E0B]" /> Kết quả đã khoá. Khán giả xem được Bảng Vàng Vinh Danh.
            </p>
            {auth.isAdmin && (confirm === 'reopen' ? (
              <ConfirmBar
                text="Mở lại giải để sửa kết quả? Trọng tài sẽ nhập điểm lại được."
                onCancel={() => setConfirm(null)}
                onConfirm={() => void run('reopen', () => reopenTournament(vm.tournament.id), 'Đã mở lại giải đấu')}
                confirmLabel="Mở lại giải"
                busy={busy === 'reopen'}
              />
            ) : (
              <button type="button" onClick={() => setConfirm('reopen')} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#374151] text-sm font-semibold text-slate-300">
                <LockOpen className="h-4 w-4" /> Mở lại giải (Admin)
              </button>
            ))}
          </>
        ) : confirm === 'close' ? (
          <ConfirmBar
            text={unfinished
              ? `Còn ${unfinished} trận chưa có kết quả${live ? ` (${live} trận đang đấu)` : ''}. Sau khi đóng, không ai sửa được điểm nữa.`
              : 'Đóng giải và khoá toàn bộ kết quả? Bảng Vàng Vinh Danh sẽ hiện cho khán giả.'}
            onCancel={() => setConfirm(null)}
            onConfirm={() => void run('close', () => completeTournament(vm.tournament.id), 'Đã kết thúc giải đấu. Bảng Vàng đã mở!')}
            confirmLabel="Đóng giải"
            busy={busy === 'close'}
          />
        ) : (
          <button type="button" onClick={() => setConfirm('close')} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-rose-500/60 pm-display text-base font-bold uppercase text-rose-300 hover:bg-rose-500/10">
            <Lock className="h-4 w-4" /> Đóng / Kết thúc Giải đấu
          </button>
        )}
      </div>
    </Card>
  );
}

/* ======================= Dashboard ======================= */
export default function AdminDashboard({
  vm, auth, ui, setUi, openRules, toast, groupDrafts, setGroupDrafts, onSelectTournament,
}: {
  vm: TournamentVM | null;
  auth: AuthState;
  ui: UIState;
  setUi: (patch: Partial<UIState>) => void;
  openRules: () => void;
  toast: Toast;
  groupDrafts: Record<string, GroupDraft>;
  setGroupDrafts: Dispatch<SetStateAction<Record<string, GroupDraft>>>;
  onSelectTournament: (id: string) => void;
}) {
  const engine = useStandingsEngine(vm?.tournament.id);
  const [tbBusy, setTbBusy] = useState(false);
  const [koBusy, setKoBusy] = useState(false);

  if (!auth.isOrganizer) {
    return (
      <EmptyState icon={Lock} title="Dành cho Ban tổ chức">
        <p>Đăng nhập bằng Gmail đã được Admin cấp quyền BTC để tạo giải, ghép cặp, chia bảng và chỉnh luật.</p>
        {!auth.session && (
          <button type="button" onClick={() => void auth.signInWithGoogle()} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0B0F17]">
            Đăng nhập Google <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </EmptyState>
    );
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#06B6D4]">{auth.isAdmin ? 'Admin · Ban Tổ Chức' : 'Ban Tổ Chức'}</p>
        <h2 className="pm-display text-3xl font-extrabold uppercase leading-none text-white">Thiết lập giải</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/members" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#374151] bg-[#1F2937] px-3 text-sm font-semibold text-white hover:border-[#A3E635]">
          <Users className="h-4 w-4 text-[#06B6D4]" /> Thành viên
        </Link>
        {auth.isAdmin && (
          <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#374151] bg-[#1F2937] px-3 text-sm font-semibold text-white hover:border-[#A3E635]">
            <UserCog className="h-4 w-4 text-[#F59E0B]" /> Phân quyền
          </Link>
        )}
        {vm && (
          <button type="button" onClick={openRules} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#374151] bg-[#1F2937] px-3 text-sm font-semibold text-white hover:border-[#A3E635]">
            <Settings className="h-4 w-4 text-[#A3E635]" /> {vm.rules.target} điểm · cách {vm.rules.winBy}
          </button>
        )}
      </div>
    </div>
  );

  const creator = <TournamentCreator players={vm?.players ?? []} onCreated={onSelectTournament} toast={toast} />;

  if (!vm) {
    return <div className="flex flex-col gap-4">{header}{creator}</div>;
  }

  const ev = vm.events.find((e) => e.id === ui.adminEvent) ?? vm.events[0];
  const saveTieBreakers = async (o: TieBreaker[]) => {
    setTbBusy(true);
    try { await updateRules(vm.tournament, { tieBreakers: o }); } catch (e) { toast((e as Error).message, 'error'); } finally { setTbBusy(false); }
  };

  const lockedBanner = vm.locked && (
    <div className="flex items-center gap-3 rounded-2xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-3 text-sm text-amber-100">
      <Crown className="h-5 w-5 shrink-0 text-[#F59E0B]" />
      Giải “{vm.tournament.title}” đã kết thúc. Thiết lập và kết quả đang bị khoá.
    </div>
  );

  if (!ev) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        {creator}
        <Card className="p-6 text-sm text-slate-400">Giải này chưa có nội dung thi đấu.</Card>
      </div>
    );
  }

  const draft = groupDrafts[ev.id] ?? initGroupDraft(vm, ev);
  const setDraft = (patch: Partial<GroupDraft>) => setGroupDrafts((d) => ({ ...d, [ev.id]: { ...(d[ev.id] ?? draft), ...patch } }));
  const clearDraft = () => setGroupDrafts((d) => { const n = { ...d }; delete n[ev.id]; return n; });
  const groups = groupsOfEvent(ev);
  const cfg = ev.config;
  const qualifiers = qualifiersOf(cfg);
  const stage = stageName(qualifiers);
  const ties = engine.knockoutFor(ev.id);
  const hasKnockout = vm.matches.some((m) => m.eventId === ev.id && m.type !== 'group');
  const groupDone = vm.matches.filter((m) => m.eventId === ev.id && m.type === 'group').every((m) => m.status === 'completed');

  const makeKnockout = async () => {
    const pairs = ties.filter((t) => t[0].team && t[1].team).map((t) => [t[0].team!.id, t[1].team!.id] as [string, string]);
    if (!pairs.length) return;
    setKoBusy(true);
    try {
      await createKnockout({ tournamentId: vm.tournament.id, eventId: ev.id, type: stageType(qualifiers), pairs, orderOffset: eventOffset(vm, ev.id) + 900 });
      toast(`Đã tạo ${pairs.length} trận ${stage} cho ${ev.label}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setKoBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {header}
      {lockedBanner}
      {creator}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nội dung đang thiết lập · {vm.tournament.title}</p>
        <Segmented full value={ev.id} onChange={(v) => setUi({ adminEvent: v })} options={vm.events.map((e) => ({ id: e.id, label: e.label }))} />
      </div>

      {!vm.locked && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionTitle icon={Users} eyebrow="Bước 1">Ghép cặp / danh sách</SectionTitle>
            <PairGenerator key={ev.id} vm={vm} ev={ev} draft={draft} clearDraft={clearDraft} toast={toast} />
          </Card>
          <Card>
            <SectionTitle icon={LayoutGrid} eyebrow="Bước 2">Chia bảng</SectionTitle>
            <GroupStagePanel key={ev.id} vm={vm} ev={ev} draft={draft} setDraft={setDraft} clearDraft={clearDraft} toast={toast} />
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={Shield} eyebrow="Bước 3" right={tbBusy ? <span className="text-[11px] text-slate-500">Đang lưu…</span> : null}>Luật xếp hạng</SectionTitle>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-sm text-slate-400">Đổi thứ tự ưu tiên khi các đội bằng điểm. Bảng xếp hạng của khán giả và TV cập nhật ngay.</p>
            <TieBreakerList order={vm.rules.tieBreakers} setOrder={(o) => void saveTieBreakers(o)} disabled={vm.locked} />
          </div>
        </Card>
        <Card>
          <SectionTitle icon={Trophy} eyebrow="Đang áp dụng" right={<span className="text-[11px] text-slate-500">Top {cfg.advance} → {stage}</span>}>
            BXH {ev.label}
          </SectionTitle>
          <div className="flex flex-col gap-3 p-3">
            {groups.map((g) => (
              <div key={g ?? 'all'} className="overflow-hidden rounded-xl border border-[#374151]/70">
                {g && <div className="flex items-center gap-2 bg-[#0B0F17] px-3 py-2 pm-display text-sm font-bold uppercase text-white"><GroupBadge g={g} size="sm" /> Bảng {g}</div>}
                <StandingsList rows={engine.getStandings(ev.id, g)} players={vm.players} advance={cfg.advance} stage={stage} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <KnockoutPreview
        ties={ties}
        stage={stage}
        players={vm.players}
        action={
          hasKnockout ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A3E635]"><CheckCircle2 className="h-3.5 w-3.5" /> Đã tạo lịch</span>
          ) : vm.locked ? null : (
            <button
              type="button"
              disabled={koBusy || !groupDone}
              title={groupDone ? undefined : 'Cần hoàn tất vòng bảng trước'}
              onClick={() => void makeKnockout()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#A3E635] px-3 text-sm font-bold text-[#0B0F17] disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> Tạo lịch {stage}
            </button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <LifecyclePanel vm={vm} auth={auth} toast={toast} />
        <ParticipantsPanel vm={vm} toast={toast} />
      </div>
    </div>
  );
}
