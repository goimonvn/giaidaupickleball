'use client';

import { ArrowLeft, Crown, Loader2, Lock, Mail, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  BTN_PRIMARY, CARD, Empty, Field, ICON_BTN, INPUT, Segmented, StripGroup, T1, T2, T3, T4,
} from '@/components/kit';
import Navbar from '@/components/Navbar';
import { useToast } from '@/components/Toast';
import { adminExists, claimFirstAdmin, listUserRoles, revokeUserRole, updateUserRole, upsertUserRole } from '@/lib/actions';
import { useAuth } from '@/lib/supabase';
import type { StaffRole, UserRoleRow } from '@/lib/types';

/* =====================================================================
   Phân quyền Gmail (Admin only) — v4 demo skin
   ===================================================================== */

const ROLE_META: Record<StaffRole, { label: string; desc: string; cls: string }> = {
  admin: { label: 'Admin', desc: 'Toàn quyền: phân quyền, tạo & khoá giải, mở lại và xoá giải đã kết thúc.', cls: 'bg-amber-500/10 text-amber-300' },
  organizer: { label: 'Ban Tổ Chức', desc: 'Tạo giải, ghép cặp, chia bảng, gán trọng tài, quản lý thành viên, đóng giải.', cls: 'bg-white/10 text-slate-100' },
  scorekeeper: { label: 'Trọng Tài', desc: 'Nhập điểm từng quả và kết quả nhanh.', cls: 'bg-sky-500/10 text-sky-300' },
};
const ROLE_ORDER: StaffRole[] = ['organizer', 'scorekeeper', 'admin'];

export default function AdminPage() {
  const auth = useAuth();
  const { toast, node } = useToast();
  const [rows, setRows] = useState<UserRoleRow[] | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('organizer');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listUserRoles();
    if (res.ok) setRows(res.data);
    else toast(res.error, 'error');
  }, [toast]);

  useEffect(() => {
    if (auth.loading) return;
    if (auth.isAdmin) void load();
    else void adminExists().then(setHasAdmin);
  }, [auth.loading, auth.isAdmin, load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('add');
    const res = await upsertUserRole({ email, role, note });
    setBusy(null);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`Đã cấp quyền ${ROLE_META[res.data.role].label} cho ${res.data.email}`);
    setEmail('');
    setNote('');
    await load();
  };

  const change = async (r: UserRoleRow, next: StaffRole) => {
    if (next === r.role) return;
    setBusy(r.id);
    const res = await updateUserRole(r.id, next);
    setBusy(null);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`${r.email} → ${ROLE_META[next].label}`);
    await load();
    if (r.email === auth.email) await auth.refreshRole();
  };

  const revoke = async (r: UserRoleRow) => {
    setBusy(r.id);
    const res = await revokeUserRole(r.id);
    setBusy(null);
    setConfirmId(null);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`Đã thu hồi quyền của ${r.email}`);
    await load();
    if (r.email === auth.email) await auth.refreshRole();
  };

  const claim = async () => {
    setBusy('claim');
    const res = await claimFirstAdmin();
    setBusy(null);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(`${res.data} đã trở thành Admin`);
    await auth.refreshRole();
  };

  let body;
  if (auth.loading) {
    body = <div className={`flex items-center justify-center gap-2 py-24 ${T3} text-slate-500`}><Loader2 className="h-5 w-5 animate-spin" /> Đang kiểm tra quyền…</div>;
  } else if (!auth.session) {
    body = (
      <Empty>
        <Lock className="mx-auto mb-2 h-6 w-6 text-slate-500" />
        <p>Đăng nhập bằng Gmail có quyền Admin để quản lý Ban tổ chức và Trọng tài.</p>
        <button type="button" onClick={() => void auth.signInWithGoogle()} className={`${BTN_PRIMARY} mt-4`}>Đăng nhập Google</button>
      </Empty>
    );
  } else if (!auth.isAdmin) {
    body = hasAdmin === false ? (
      <Empty>
        <Crown className="mx-auto mb-2 h-6 w-6 text-amber-300" />
        <p className={`${T2} text-white`}>Thiết lập Admin đầu tiên</p>
        <p className="mt-1">Hệ thống chưa có Admin. Gmail <b className="text-white">{auth.email}</b> sẽ trở thành Admin và cấp quyền cho người khác.</p>
        <button type="button" disabled={busy === 'claim'} onClick={() => void claim()} className={`${BTN_PRIMARY} mt-4`}>
          <Crown className="h-4 w-4" /> {busy === 'claim' ? 'Đang xử lý…' : 'Nhận quyền Admin'}
        </button>
      </Empty>
    ) : (
      <Empty>
        <Lock className="mx-auto mb-2 h-6 w-6 text-slate-500" />
        Gmail <b className="text-white">{auth.email}</b> chưa có quyền Admin. Hãy nhờ Admin hiện tại cấp quyền.
      </Empty>
    );
  } else {
    const counts = (r: StaffRole) => rows?.filter((x) => x.role === r).length ?? 0;
    body = (
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-2">
          {(['admin', 'organizer', 'scorekeeper'] as StaffRole[]).map((r) => (
            <div key={r} className={`${CARD} p-3`}>
              <dt><span className={`${T4} rounded-md px-1.5 py-0.5 ${ROLE_META[r].cls}`}>{ROLE_META[r].label}</span></dt>
              <dd className={`pm-num ${T1} mt-1 text-white`}>{counts(r)}</dd>
            </div>
          ))}
        </dl>

        <section className={`${CARD} p-4`}>
          <h2 className={`${T2} text-white`}>Cấp quyền bằng Gmail</h2>
          <p className={`${T4} text-slate-500`}>Người được cấp chỉ cần đăng nhập Google bằng đúng Gmail này.</p>
          <form onSubmit={add} className="mt-3 flex flex-col gap-3">
            <Field label="ĐỊA CHỈ GMAIL" htmlFor="pm-role-email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input id="pm-role-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten.cua.ban@gmail.com" className={`${INPUT} pl-9`} />
              </div>
            </Field>
            <Field label="VAI TRÒ">
              <Segmented full label="Vai trò" value={role} onChange={setRole} options={ROLE_ORDER.map((r) => ({ id: r, label: ROLE_META[r].label }))} />
            </Field>
            <p className={`${T4} -mt-1 text-slate-500`}>{ROLE_META[role].desc}</p>
            <Field label="GHI CHÚ (TUỲ CHỌN)" htmlFor="pm-role-note">
              <input id="pm-role-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Trọng tài sân 2" className={INPUT} />
            </Field>
            <button type="submit" disabled={busy === 'add' || !email.trim()} className={BTN_PRIMARY}>{busy === 'add' ? 'Đang lưu…' : 'Cấp quyền'}</button>
          </form>
        </section>

        <StripGroup title="Người có quyền" right={<span className={`${T4} text-slate-500`}>{rows ? `${rows.length} người` : 'Đang tải…'}</span>}>
          {rows?.map((r) => {
            const me = r.email === auth.email;
            return (
              <div key={r.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex min-h-[40px] items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`${T3} flex items-center gap-2 truncate text-slate-100`}>
                      <span className="truncate">{r.email}</span>
                      {me && <span className={`${T4} rounded-md bg-white/10 px-1.5 py-0.5 text-slate-300`}>Bạn</span>}
                    </p>
                    <p className={`${T4} truncate text-slate-500`}>{r.note || `Thêm ngày ${new Date(r.created_at).toLocaleDateString('vi-VN')}`}</p>
                  </div>
                  <label htmlFor={`pm-role-${r.id}`} className="sr-only">Vai trò của {r.email}</label>
                  <select
                    id={`pm-role-${r.id}`}
                    value={r.role}
                    disabled={busy === r.id}
                    onChange={(e) => void change(r, e.target.value as StaffRole)}
                    className={`h-9 rounded-lg border border-white/10 bg-slate-950 px-2 ${T4} text-slate-200`}
                  >
                    {ROLE_ORDER.map((o) => <option key={o} value={o}>{ROLE_META[o].label}</option>)}
                  </select>
                  {confirmId !== r.id && (
                    <button type="button" aria-label={`Thu hồi quyền của ${r.email}`} onClick={() => setConfirmId(r.id)} className={`${ICON_BTN} hover:bg-rose-500/10 hover:text-rose-300`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {confirmId === r.id && (
                  <div className="flex items-center justify-end gap-2">
                    <span className={`${T4} mr-auto text-rose-200`}>Thu hồi quyền của {r.email}?</span>
                    <button type="button" onClick={() => setConfirmId(null)} className={`h-9 rounded-lg px-3 ${T4} text-slate-400 hover:bg-white/5`}>Huỷ</button>
                    <button type="button" disabled={busy === r.id} onClick={() => void revoke(r)} className={`h-9 rounded-lg bg-rose-500/15 px-3 ${T4} text-rose-300 disabled:opacity-50`}>Thu hồi</button>
                  </div>
                )}
              </div>
            );
          })}
          {rows && rows.length === 0 && <p className={`px-4 py-8 text-center ${T3} text-slate-500`}>Chưa có ai.</p>}
        </StripGroup>
      </div>
    );
  }

  return (
    <div className="pm-root min-h-screen bg-slate-950 text-slate-200">
      <Navbar auth={auth} />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16 pt-4">
        <div>
          <Link href="/?screen=btc" className={`mb-1 inline-flex items-center gap-1 ${T4} text-slate-400 hover:text-white`}><ArrowLeft className="h-3.5 w-3.5" /> Về Ban tổ chức</Link>
          <p className={`${T4} text-slate-500`}>ADMIN</p>
          <h1 className={`${T1} text-white`}>Phân quyền Gmail</h1>
        </div>
        {body}
      </main>
      {node}
    </div>
  );
}
