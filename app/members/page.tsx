'use client';

import { ArrowLeft, Copy, Loader2, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Avatar, BTN_DANGER, BTN_PRIMARY, CARD, chipCls, Confirm, Empty, Field, ICON_BTN, INPUT, Segmented, Sheet, T1, T2, T3, T4,
} from '@/components/kit';
import Navbar from '@/components/Navbar';
import { useToast, type ToastFn } from '@/components/Toast';
import { createMember, deleteMember, getMembers, updateMember } from '@/lib/actions';
import { useAuth } from '@/lib/supabase';
import type { Member, MemberInput } from '@/lib/types';

/* =====================================================================
   Quản lý Thành viên — v4 demo skin.
   Phone numbers are only returned to BTC / Admin (RLS on player_contacts).
   ===================================================================== */

const GROUP_PRESETS = ['Nhóm Nhà', 'Nhóm Đối Tác'];
const RATING_CHIPS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const EMPTY: MemberInput = { full_name: '', skill_rating: 3.5, group_tag: 'Nhóm Nhà', gender: 'M', phone: '', avatar_url: '' };

function MemberSheet({
  initial, tags, onClose, onSaved, onDeleted, toast,
}: {
  initial: Member | null;
  tags: string[];
  onClose: () => void;
  onSaved: (m: Member) => void;
  onDeleted: (id: string) => void;
  toast: ToastFn;
}) {
  const [f, setF] = useState<MemberInput>(initial ? { ...initial, phone: initial.phone ?? '', avatar_url: initial.avatar_url ?? '' } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
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
    <Sheet title={initial ? 'Sửa thành viên' : 'Thêm thành viên'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="HỌ TÊN" htmlFor="pm-m-name">
          <input id="pm-m-name" autoFocus value={f.full_name} maxLength={80} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="VD: Minh Tuấn" className={INPUT} />
        </Field>
        <Field label="TRÌNH ĐỘ" htmlFor="pm-m-rating">
          <div className="flex items-center gap-2">
            <input id="pm-m-rating" type="number" inputMode="decimal" step="0.1" min="1" max="8" value={f.skill_rating}
              onChange={(e) => setF({ ...f, skill_rating: Number(e.target.value) })} className={`${INPUT} pm-num w-20 text-center ${T2}`} />
            <div className="pm-noscroll flex gap-1.5 overflow-x-auto">
              {RATING_CHIPS.map((r) => (
                <button key={r} type="button" onClick={() => setF({ ...f, skill_rating: r })} className={chipCls(f.skill_rating === r)}>{r.toFixed(1)}</button>
              ))}
            </div>
          </div>
        </Field>
        <Field label="NHÓM" htmlFor="pm-m-group">
          <input id="pm-m-group" list="pm-m-groups" value={f.group_tag} onChange={(e) => setF({ ...f, group_tag: e.target.value })} className={INPUT} />
          <datalist id="pm-m-groups">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {allTags.map((t) => <button key={t} type="button" onClick={() => setF({ ...f, group_tag: t })} className={chipCls(f.group_tag === t)}>{t}</button>)}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GIỚI TÍNH">
            <Segmented full label="Giới tính" value={f.gender} onChange={(g) => setF({ ...f, gender: g })} options={[{ id: 'M' as const, label: 'Nam' }, { id: 'F' as const, label: 'Nữ' }]} />
          </Field>
          <Field label="SỐ ĐIỆN THOẠI" htmlFor="pm-m-phone">
            <input id="pm-m-phone" type="tel" inputMode="tel" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="09xx xxx xxx" className={INPUT} />
          </Field>
        </div>
        <Field label="ẢNH ĐẠI DIỆN (URL, TUỲ CHỌN)" htmlFor="pm-m-avatar">
          <input id="pm-m-avatar" type="url" value={f.avatar_url ?? ''} onChange={(e) => setF({ ...f, avatar_url: e.target.value })} placeholder="https://…" className={INPUT} />
        </Field>
        <button type="submit" disabled={busy || !f.full_name.trim()} className={BTN_PRIMARY}>{busy ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Thêm thành viên'}</button>
        {initial && (confirmDel ? (
          <Confirm danger busy={busy} text={`Xoá ${initial.full_name} khỏi danh sách thành viên?`} confirmLabel="Xoá" onCancel={() => setConfirmDel(false)} onConfirm={() => void remove()} />
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className={BTN_DANGER}><Trash2 className="h-4 w-4" /> Xoá thành viên</button>
        ))}
      </form>
    </Sheet>
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
  const digits = q.replace(/\D/g, '');
  const shown = (members ?? []).filter((m) =>
    (group === 'all' || m.group_tag === group)
    && (gender === 'all' || m.gender === gender)
    && (!q.trim() || m.full_name.toLowerCase().includes(q.trim().toLowerCase()) || (!!digits && (m.phone ?? '').replace(/\D/g, '').includes(digits))),
  );
  const avg = shown.length ? shown.reduce((s, m) => s + m.skill_rating, 0) / shown.length : 0;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(`Đã sao chép ${text}`); } catch { toast('Không sao chép được', 'error'); }
  };

  return (
    <div className="pm-root min-h-screen bg-slate-950 text-slate-200">
      <Navbar auth={auth} />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-24 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Link href="/?screen=btc" className={`mb-1 inline-flex items-center gap-1 ${T4} text-slate-400 hover:text-white`}><ArrowLeft className="h-3.5 w-3.5" /> Về Ban tổ chức</Link>
            <p className={`${T4} text-slate-500`}>QUẢN LÝ</p>
            <h1 className={`${T1} text-white`}>Thành viên</h1>
          </div>
          {canEdit && <button type="button" onClick={() => setSheet('new')} className={BTN_PRIMARY}><Plus className="h-4 w-4" /> Thêm</button>}
        </div>

        <dl className="grid grid-cols-3 gap-2">
          {[['Thành viên', members ? String(members.length) : '–'], ['Đang lọc', String(shown.length)], ['Trình TB', avg ? avg.toFixed(2) : '–']].map(([k, v]) => (
            <div key={k} className={`${CARD} p-3`}>
              <dt className={`${T4} text-slate-500`}>{k.toUpperCase()}</dt>
              <dd className={`pm-num ${T1} text-white`}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <label htmlFor="pm-m-search" className="sr-only">Tìm thành viên</label>
          <input id="pm-m-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={canEdit ? 'Tìm theo tên hoặc số điện thoại…' : 'Tìm theo tên…'} className={`${INPUT} pl-9`} />
        </div>
        <div className="pm-noscroll flex items-center gap-1.5 overflow-x-auto">
          <button type="button" className={chipCls(group === 'all')} onClick={() => setGroup('all')}>Tất cả nhóm</button>
          {tags.map((t) => <button key={t} type="button" className={chipCls(group === t)} onClick={() => setGroup(t)}>{t}</button>)}
          <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
          {(['all', 'M', 'F'] as const).map((g) => <button key={g} type="button" className={chipCls(gender === g)} onClick={() => setGender(g)}>{g === 'all' ? 'Nam + Nữ' : g === 'M' ? 'Nam' : 'Nữ'}</button>)}
        </div>

        {!members ? (
          <div className={`flex items-center justify-center gap-2 py-20 ${T3} text-slate-500`}><Loader2 className="h-5 w-5 animate-spin" /> Đang tải thành viên…</div>
        ) : !shown.length ? (
          <Empty>Không có thành viên phù hợp.</Empty>
        ) : (
          <ul className={`${CARD} divide-y divide-white/5 overflow-hidden`}>
            {shown.map((m) => (
              <li key={m.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <Avatar name={m.full_name} src={m.avatar_url} size="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className={`${T3} truncate text-slate-100`}>{m.full_name} <span className="text-slate-500">· {m.gender === 'M' ? 'Nam' : 'Nữ'}</span></p>
                  <p className={`${T4} flex flex-wrap items-center gap-1.5 text-slate-500`}>
                    <span>{m.group_tag}</span>
                    {m.phone && (
                      <button type="button" onClick={() => void copy(m.phone!)} className="inline-flex items-center gap-1 text-slate-400 hover:text-white" title="Sao chép số điện thoại">
                        <Phone className="h-3 w-3" /> {m.phone} <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                </div>
                <span className={`pm-num ${T4} rounded-md bg-white/5 px-1.5 py-0.5 text-slate-200`}>{m.skill_rating.toFixed(1)}</span>
                {canEdit && (
                  <button type="button" aria-label={`Sửa ${m.full_name}`} onClick={() => setSheet(m)} className={ICON_BTN}><Pencil className="h-4 w-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!canEdit && !auth.loading && (
          <p className={`${T4} text-center text-slate-500`}>Chỉ Ban tổ chức / Admin được thêm, sửa, xoá thành viên và xem số điện thoại.</p>
        )}
      </main>

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
