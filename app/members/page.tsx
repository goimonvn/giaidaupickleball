'use client';

import { ArrowLeft, Copy, Loader2, Pencil, Phone, Plus, Search, Trash2, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Navbar from '@/components/Navbar';
import { useToast } from '@/components/Toast';
import { Card, Segmented } from '@/components/ui';
import { createMember, deleteMember, getMembers, updateMember } from '@/lib/actions';
import { useAuth } from '@/lib/supabase';
import type { Member, MemberInput } from '@/lib/types';

const GROUP_PRESETS = ['Nhóm Nhà', 'Nhóm Đối Tác'];
const RATING_CHIPS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

/** Colour scale for skill badges (DUPR-style ratings) */
const ratingCls = (r: number) =>
  r >= 4.5 ? 'bg-[#F59E0B] text-[#0B0F17]' : r >= 4 ? 'bg-[#A3E635] text-[#0B0F17]' : r >= 3.5 ? 'bg-[#06B6D4] text-[#0B0F17]' : r >= 3 ? 'bg-[#1F2937] text-[#A3E635]' : 'bg-[#1F2937] text-slate-300';

const EMPTY: MemberInput = { full_name: '', skill_rating: 3.5, group_tag: 'Nhóm Nhà', gender: 'M', phone: '', avatar_url: '' };

function MemberSheet({
  initial, tags, onClose, onSaved, onDeleted, toast,
}: {
  initial: Member | null;
  tags: string[];
  onClose: () => void;
  onSaved: (m: Member) => void;
  onDeleted: (id: string) => void;
  toast: (m: string, k?: 'ok' | 'error') => void;
}) {
  const [f, setF] = useState<MemberInput>(initial ? { ...initial, phone: initial.phone ?? '', avatar_url: initial.avatar_url ?? '' } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const inputCls = 'min-h-[48px] w-full rounded-xl border border-[#374151] bg-[#0B0F17] px-3 text-base text-white placeholder:text-slate-600';
  const allTags = Array.from(new Set([...GROUP_PRESETS, ...tags]));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = initial ? await updateMember(initial.id, f) : await createMember(f);
    setBusy(false);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(initial ? `Đã cập nhật ${res.data.full_name}` : `Đã thêm ${res.data.full_name}`);
    onSaved(res.data);
  };

  const remove = async () => {
    if (!initial) return;
    setBusy(true);
    const res = await deleteMember(initial.id);
    setBusy(false);
    if (!res.ok) { toast(res.error, 'error'); setConfirmDel(false); return; }
    toast(`Đã xoá ${initial.full_name}`);
    onDeleted(initial.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-member-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#374151] bg-[#111827] shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#374151] sm:hidden" />
        <div className="flex items-center justify-between border-b border-[#374151] px-4 py-3">
          <h2 id="pm-member-title" className="pm-display text-xl font-extrabold uppercase text-white">{initial ? 'Sửa thành viên' : 'Thêm thành viên'}</h2>
          <button type="button" aria-label="Đóng" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1F2937]"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="flex flex-col gap-4 p-4">
          <div>
            <label htmlFor="pm-m-name" className="mb-1 block text-xs text-slate-500">Họ tên</label>
            <input id="pm-m-name" autoFocus value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="VD: Minh Tuấn" className={inputCls} />
          </div>
          <div>
            <label htmlFor="pm-m-rating" className="mb-1 block text-xs text-slate-500">Trình độ (DUPR)</label>
            <div className="flex items-center gap-2">
              <input
                id="pm-m-rating"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="8"
                value={f.skill_rating}
                onChange={(e) => setF({ ...f, skill_rating: Number(e.target.value) })}
                className={`${inputCls} w-24 text-center pm-num text-xl font-bold`}
              />
              <div className="flex flex-wrap gap-1.5">
                {RATING_CHIPS.map((r) => (
                  <button key={r} type="button" onClick={() => setF({ ...f, skill_rating: r })}
                    className={`min-h-[40px] min-w-[48px] rounded-lg border pm-num text-sm font-bold ${f.skill_rating === r ? 'border-[#A3E635] bg-[#A3E635] text-[#0B0F17]' : 'border-[#374151] text-slate-300'}`}>
                    {r.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="pm-m-group" className="mb-1 block text-xs text-slate-500">Nhóm</label>
            <input id="pm-m-group" list="pm-m-groups" value={f.group_tag} onChange={(e) => setF({ ...f, group_tag: e.target.value })} className={inputCls} />
            <datalist id="pm-m-groups">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} type="button" onClick={() => setF({ ...f, group_tag: t })}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${f.group_tag === t ? 'border-[#06B6D4] bg-[#06B6D4]/15 text-cyan-300' : 'border-[#374151] text-slate-400'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs text-slate-500">Giới tính</p>
              <Segmented full value={f.gender} onChange={(g) => setF({ ...f, gender: g })} options={[{ id: 'M' as const, label: 'Nam' }, { id: 'F' as const, label: 'Nữ' }]} />
            </div>
            <div>
              <label htmlFor="pm-m-phone" className="mb-1 block text-xs text-slate-500">Số điện thoại</label>
              <input id="pm-m-phone" type="tel" inputMode="tel" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="09xx xxx xxx" className={inputCls} />
            </div>
          </div>
          <div>
            <label htmlFor="pm-m-avatar" className="mb-1 block text-xs text-slate-500">Ảnh đại diện (URL, tuỳ chọn)</label>
            <input id="pm-m-avatar" type="url" value={f.avatar_url ?? ''} onChange={(e) => setF({ ...f, avatar_url: e.target.value })} placeholder="https://…" className={inputCls} />
          </div>
          <button type="submit" disabled={busy || !f.full_name.trim()} className="min-h-[52px] rounded-xl bg-[#A3E635] pm-display text-lg font-bold uppercase text-[#0B0F17] disabled:opacity-40">
            {busy ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Thêm thành viên'}
          </button>
          {initial && (confirmDel ? (
            <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-3">
              <p className="text-sm text-rose-100">Xoá {initial.full_name} khỏi danh sách thành viên?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmDel(false)} className="min-h-[44px] rounded-lg border border-[#374151] text-sm text-slate-300">Quay lại</button>
                <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-[44px] rounded-lg bg-rose-500 text-sm font-bold text-white disabled:opacity-50">Xoá</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-rose-300 hover:bg-rose-500/10">
              <Trash2 className="h-4 w-4" /> Xoá thành viên
            </button>
          ))}
        </form>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const auth = useAuth();
  const { toast, node } = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [gender, setGender] = useState<'all' | 'M' | 'F'>('all');
  const [sheet, setSheet] = useState<Member | 'new' | null>(null);
  const canEdit = auth.isOrganizer;

  const load = useCallback(async () => {
    const res = await getMembers();
    if (res.ok) setMembers(res.data);
    else toast(res.error, 'error');
  }, [toast]);

  useEffect(() => { if (!auth.loading) void load(); }, [auth.loading, auth.isOrganizer, load]);

  const tags = useMemo(() => Array.from(new Set((members ?? []).map((m) => m.group_tag))).sort(), [members]);
  const shown = (members ?? []).filter((m) =>
    (group === 'all' || m.group_tag === group)
    && (gender === 'all' || m.gender === gender)
    && (!q.trim() || m.full_name.toLowerCase().includes(q.trim().toLowerCase()) || (m.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')),
  );
  const avg = shown.length ? shown.reduce((s, m) => s + m.skill_rating, 0) / shown.length : 0;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(`Đã sao chép ${text}`); } catch { toast('Không sao chép được', 'error'); }
  };

  const chip = (on: boolean) =>
    `min-h-[40px] shrink-0 rounded-full border px-4 pm-display text-sm font-bold uppercase ${on ? 'border-[#A3E635] bg-[#A3E635]/15 text-[#A3E635]' : 'border-[#374151] text-slate-400'}`;

  return (
    <div className="pm-root min-h-screen bg-[#0B0F17] text-slate-200">
      <Navbar liveCount={0} auth={auth} connected />
      <main className={`mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-4 md:pb-12 md:pt-6 ${auth.isStaff ? 'pb-32' : 'pb-16'}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/?mode=admin" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Về Ban tổ chức</Link>
            <h1 className="flex items-center gap-2 pm-display text-3xl font-extrabold uppercase leading-none text-white"><Users className="h-7 w-7 text-[#06B6D4]" /> Thành viên</h1>
          </div>
          {canEdit && (
            <button type="button" onClick={() => setSheet('new')} className="hidden min-h-[44px] items-center gap-2 rounded-xl bg-[#A3E635] px-4 pm-display text-base font-bold uppercase text-[#0B0F17] md:inline-flex">
              <Plus className="h-4 w-4" /> Thêm thành viên
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Thành viên</p><p className="pm-num text-3xl font-extrabold text-white">{members?.length ?? '–'}</p></Card>
          <Card className="p-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Đang lọc</p><p className="pm-num text-3xl font-extrabold text-[#06B6D4]">{shown.length}</p></Card>
          <Card className="p-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">Trình TB</p><p className="pm-num text-3xl font-extrabold text-[#A3E635]">{avg ? avg.toFixed(2) : '–'}</p></Card>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <label htmlFor="pm-m-search" className="sr-only">Tìm thành viên</label>
          <input id="pm-m-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc số điện thoại…"
            className="min-h-[48px] w-full rounded-xl border border-[#374151] bg-[#111827] pl-9 pr-3 text-base text-white placeholder:text-slate-600" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pm-noscroll">
          <button type="button" className={chip(group === 'all')} onClick={() => setGroup('all')}>Tất cả</button>
          {tags.map((t) => <button key={t} type="button" className={chip(group === t)} onClick={() => setGroup(t)}>{t}</button>)}
          <span className="mx-1 h-6 w-px shrink-0 bg-[#374151]" />
          {(['all', 'M', 'F'] as const).map((g) => <button key={g} type="button" className={chip(gender === g)} onClick={() => setGender(g)}>{g === 'all' ? 'Nam + Nữ' : g === 'M' ? 'Nam' : 'Nữ'}</button>)}
        </div>

        {!members ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải thành viên…</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((m) => (
              <li key={m.id}>
                <Card className="flex items-center gap-3 p-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1F2937] pm-display text-lg font-extrabold text-white">
                    {m.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={m.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      : m.full_name.split(' ').slice(-1)[0].slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{m.full_name} <span className="text-xs font-normal text-slate-500">· {m.gender === 'M' ? 'Nam' : 'Nữ'}</span></p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 pm-num text-xs font-extrabold ${ratingCls(m.skill_rating)}`}>{m.skill_rating.toFixed(1)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tags.indexOf(m.group_tag) % 2 === 0 ? 'bg-[#06B6D4]/15 text-cyan-300' : 'bg-[#F59E0B]/15 text-amber-300'}`}>{m.group_tag}</span>
                      {m.phone && (
                        <button type="button" onClick={() => void copy(m.phone!)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-white" title="Sao chép số điện thoại">
                          <Phone className="h-3 w-3" /> {m.phone} <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <button type="button" aria-label={`Sửa ${m.full_name}`} onClick={() => setSheet(m)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-[#1F2937] hover:text-white">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </Card>
              </li>
            ))}
            {!shown.length && <li className="py-10 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">Không có thành viên phù hợp.</li>}
          </ul>
        )}

        {!canEdit && !auth.loading && (
          <p className="text-center text-xs text-slate-500">Chỉ Ban tổ chức / Admin được thêm, sửa, xoá thành viên và xem số điện thoại.</p>
        )}
      </main>

      {canEdit && (
        <button
          type="button"
          onClick={() => setSheet('new')}
          aria-label="Thêm thành viên"
          className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#A3E635] text-[#0B0F17] shadow-[0_8px_30px_rgba(163,230,53,.35)] md:hidden"
        >
          <Plus className="h-7 w-7" strokeWidth={3} />
        </button>
      )}

      {sheet && (
        <MemberSheet
          key={sheet === 'new' ? 'new' : sheet.id}
          initial={sheet === 'new' ? null : sheet}
          tags={tags}
          toast={toast}
          onClose={() => setSheet(null)}
          onSaved={(m) => {
            setMembers((cur) => {
              const list = cur ?? [];
              return list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [m, ...list];
            });
            setSheet(null);
          }}
          onDeleted={(id) => { setMembers((cur) => (cur ?? []).filter((x) => x.id !== id)); setSheet(null); }}
        />
      )}
      {node}
    </div>
  );
}
