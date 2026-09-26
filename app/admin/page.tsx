'use client';

import { ArrowLeft, Crown, Loader2, Lock, Mail, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Navbar from '@/components/Navbar';
import { useToast } from '@/components/Toast';
import { Card, EmptyState, SectionTitle, Segmented } from '@/components/ui';
import { adminExists, claimFirstAdmin, listUserRoles, revokeUserRole, updateUserRole, upsertUserRole } from '@/lib/actions';
import { useAuth } from '@/lib/supabase';
import type { StaffRole, UserRoleRow } from '@/lib/types';

const ROLE_META: Record<StaffRole, { label: string; desc: string; cls: string }> = {
  admin: { label: 'Admin', desc: 'Toàn quyền: phân quyền, tạo & khoá giải, mở lại giải.', cls: 'bg-[#F59E0B] text-[#0B0F17]' },
  organizer: { label: 'Ban Tổ Chức', desc: 'Tạo giải, ghép cặp, chia bảng, quản lý thành viên, đóng giải.', cls: 'bg-[#A3E635] text-[#0B0F17]' },
  scorekeeper: { label: 'Trọng Tài', desc: 'Nhập điểm từng quả và kết quả nhanh.', cls: 'bg-[#06B6D4] text-[#0B0F17]' },
};
const ROLE_OPTIONS = (['organizer', 'scorekeeper', 'admin'] as StaffRole[]).map((r) => ({ id: r, label: ROLE_META[r].label }));

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
    body = <div className="flex items-center justify-center gap-2 py-24 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang kiểm tra quyền…</div>;
  } else if (!auth.session) {
    body = (
      <EmptyState icon={Lock} title="Khu vực Admin">
        <p>Đăng nhập bằng Gmail có quyền Admin để quản lý Ban tổ chức và Trọng tài.</p>
        <button type="button" onClick={() => void auth.signInWithGoogle()} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0B0F17]">Đăng nhập Google</button>
      </EmptyState>
    );
  } else if (!auth.isAdmin) {
    body = hasAdmin === false ? (
      <EmptyState icon={Crown} title="Thiết lập Admin đầu tiên">
        <p>Hệ thống chưa có Admin. Gmail <b className="text-white">{auth.email}</b> sẽ trở thành Admin và có thể cấp quyền cho người khác.</p>
        <button type="button" disabled={busy === 'claim'} onClick={() => void claim()} className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#F59E0B] px-5 pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-50">
          <Crown className="h-4 w-4" /> {busy === 'claim' ? 'Đang xử lý…' : 'Nhận quyền Admin'}
        </button>
      </EmptyState>
    ) : (
      <EmptyState icon={Lock} title="Chỉ dành cho Admin">
        <p>Gmail <b className="text-white">{auth.email}</b> chưa có quyền Admin. Hãy nhờ Admin hiện tại cấp quyền.</p>
      </EmptyState>
    );
  } else {
    const counts = (r: StaffRole) => rows?.filter((x) => x.role === r).length ?? 0;
    body = (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {(['admin', 'organizer', 'scorekeeper'] as StaffRole[]).map((r) => (
            <Card key={r} className="p-3">
              <span className={`inline-block rounded px-1.5 py-0.5 pm-display text-[10px] font-bold uppercase ${ROLE_META[r].cls}`}>{ROLE_META[r].label}</span>
              <p className="mt-1 pm-num text-3xl font-extrabold text-white">{counts(r)}</p>
            </Card>
          ))}
        </div>

        <Card>
          <SectionTitle icon={Plus} eyebrow="Mời người dùng">Cấp quyền bằng Gmail</SectionTitle>
          <form onSubmit={add} className="flex flex-col gap-3 p-4">
            <div>
              <label htmlFor="pm-role-email" className="mb-1 block text-xs text-slate-500">Địa chỉ Gmail</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="pm-role-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ten.cua.ban@gmail.com"
                  className="min-h-[48px] w-full rounded-xl border border-[#374151] bg-[#0B0F17] pl-9 pr-3 text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-slate-500">Vai trò</p>
              <Segmented full value={role} onChange={setRole} options={ROLE_OPTIONS} />
              <p className="mt-1.5 text-xs text-slate-500">{ROLE_META[role].desc}</p>
            </div>
            <div>
              <label htmlFor="pm-role-note" className="mb-1 block text-xs text-slate-500">Ghi chú (tuỳ chọn)</label>
              <input id="pm-role-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Trọng tài sân 2" className="min-h-[44px] w-full rounded-xl border border-[#374151] bg-[#0B0F17] px-3 text-sm text-white placeholder:text-slate-600" />
            </div>
            <button type="submit" disabled={busy === 'add' || !email.trim()} className="min-h-[48px] rounded-xl bg-[#A3E635] pm-display text-base font-bold uppercase text-[#0B0F17] disabled:opacity-40">
              {busy === 'add' ? 'Đang lưu…' : 'Cấp quyền'}
            </button>
            <p className="text-xs text-slate-500">Người được cấp chỉ cần đăng nhập Google bằng đúng Gmail này, không cần làm gì thêm.</p>
          </form>
        </Card>

        <Card>
          <SectionTitle icon={ShieldCheck} eyebrow="Danh sách">{rows ? `${rows.length} người có quyền` : 'Đang tải…'}</SectionTitle>
          <div className="hidden grid-cols-[minmax(0,1fr)_220px_120px] gap-3 px-4 py-2 pm-display text-[11px] font-bold uppercase tracking-wider text-slate-500 md:grid">
            <span>Gmail</span><span>Vai trò</span><span className="text-right">Thao tác</span>
          </div>
          <ul>
            {rows?.map((r) => {
              const me = r.email === auth.email;
              return (
                <li key={r.id} className="flex flex-col gap-3 border-t border-[#374151]/60 px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_220px_120px] md:items-center">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
                      {r.email}
                      {me && <span className="rounded bg-[#1F2937] px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">Bạn</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{r.note || `Thêm ngày ${new Date(r.created_at).toLocaleDateString('vi-VN')}`}</p>
                  </div>
                  <div>
                    <label htmlFor={`pm-role-${r.id}`} className="sr-only">Vai trò của {r.email}</label>
                    <select
                      id={`pm-role-${r.id}`}
                      value={r.role}
                      disabled={busy === r.id}
                      onChange={(e) => void change(r, e.target.value as StaffRole)}
                      className="min-h-[44px] w-full rounded-xl border border-[#374151] bg-[#0B0F17] px-3 text-sm font-semibold text-white"
                    >
                      {ROLE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex justify-end">
                    {confirmId === r.id ? (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => setConfirmId(null)} className="min-h-[44px] rounded-lg px-3 text-xs text-slate-400">Huỷ</button>
                        <button type="button" disabled={busy === r.id} onClick={() => void revoke(r)} className="min-h-[44px] rounded-lg bg-rose-500/20 px-3 text-xs font-bold text-rose-300">Thu hồi</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(r.id)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-400 hover:bg-rose-500/10 hover:text-rose-300">
                        <Trash2 className="h-4 w-4" /> Thu hồi
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {rows && rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Chưa có ai.</li>}
          </ul>
        </Card>
      </div>
    );
  }

  return (
    <div className="pm-root min-h-screen bg-[#0B0F17] text-slate-200">
      <Navbar liveCount={0} auth={auth} connected />
      <main className={`mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 md:pb-12 md:pt-6 ${auth.isStaff ? 'pb-32' : 'pb-16'}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/?mode=admin" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Về Ban tổ chức</Link>
            <h1 className="flex items-center gap-2 pm-display text-3xl font-extrabold uppercase leading-none text-white"><UserCog className="h-7 w-7 text-[#F59E0B]" /> Phân quyền</h1>
          </div>
        </div>
        {body}
      </main>
      {node}
    </div>
  );
}
