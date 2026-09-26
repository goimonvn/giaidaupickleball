# PickleMasters Live

Webapp tổ chức giải Pickleball phong trào: bảng xếp hạng realtime, chia bảng, nhập điểm trên điện thoại và màn hình TV 16:9.

**Công nghệ:** Next.js 14 (App Router), Tailwind CSS 3, lucide-react, Supabase (PostgreSQL, Realtime, Google Auth).

## Cấu trúc thư mục

```
app/
  layout.tsx               Font Barlow / Barlow Condensed (có tiếng Việt), theme #0B0F17
  page.tsx                 Khung app: 4 chế độ, state UI dùng chung, toast, chế độ Demo
  tv/[tournamentId]/       Trang TV không viền cho máy chiếu: /tv/<id>
  auth/callback/route.ts   Nhận code Google OAuth → cookie phiên
components/
  Navbar.tsx               Header gọn + thanh điều hướng đáy (mobile) + nút đăng nhập Google
  PublicView.tsx           BXH Bảng A/B, huy hiệu đi tiếp, lịch thi đấu, cặp đấu Bán kết dự kiến
  AdminDashboard.tsx       Tạo giải, ghép cặp, chia bảng (tự động rắn / thủ công), luật xếp hạng, VĐV, tạo lịch Bán kết
  ScorekeeperView.tsx      Nhập từng quả (+1, người giao, đổi giao, hủy quả) và Kết quả nhanh
  TVBroadcastView.tsx      Màn hình 16:9: 2 sân live, BXH tự chuyển bảng, trận kế tiếp, dòng chữ chạy
  RulesModal.tsx           Luật thi đấu (BTC sửa, người khác chỉ xem)
  Standings.tsx, ui.tsx    Thành phần dùng chung, giữ nguyên style của prototype
lib/
  supabase.ts              Client + store realtime + hook: useRealtimeMatches, useTournamentData,
                           useStandingsEngine, useTournaments, useAuth
  engine.ts                Logic thuần: BXH theo luật ưu tiên, chia bảng kiểu rắn, lịch vòng tròn, gọi điểm
  actions.ts               Ghi dữ liệu (qua RPC), có cập nhật lạc quan khi bấm điểm
  types.ts                 Kiểu dữ liệu bảng + view model
  supabase/server.ts       Client phía server (route handler / middleware)
middleware.ts              Làm mới cookie phiên Supabase
supabase/migrations/       Schema, RLS, Realtime, các hàm RPC
scripts/seed.ts            Nạp dữ liệu mẫu của prototype (22 VĐV, 3 nội dung, Bảng A/B)
```

## Cài đặt

### 1. Tạo project Supabase và chạy migration

- Cách 1: mở **SQL Editor** trên Supabase, dán toàn bộ `supabase/migrations/20260926000000_init_picklemasters.sql` rồi bấm Run.
- Cách 2 (Supabase CLI): `supabase link --project-ref <ref>` rồi `supabase db push`.

Migration chạy lại nhiều lần không lỗi.

### 2. Bật đăng nhập Google

1. Google Cloud Console → APIs & Services → Credentials → tạo **OAuth client ID** (Web application).
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → **Google**: dán Client ID và Client Secret, bật lên.
3. Supabase → Authentication → URL Configuration:
   - Site URL: `https://<domain-cua-ban>` (hoặc `http://localhost:3000` khi dev)
   - Redirect URLs: thêm `http://localhost:3000/auth/callback` và `https://<domain-cua-ban>/auth/callback`

### 3. Biến môi trường

```bash
cp .env.example .env.local
# điền NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL
# SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho npm run seed, không bao giờ đưa lên trình duyệt
```

### 4. Chạy

```bash
npm install
npm run seed        # tuỳ chọn: nạp dữ liệu mẫu giống prototype
npm run dev
```

### 5. Cấp quyền Ban tổ chức

Đăng nhập Google một lần trên app (tài khoản sẽ có quyền `viewer`), rồi chạy trong SQL Editor:

```sql
update public.profiles set role = 'organizer'
where id = (select id from auth.users where email = 'email-cua-ban@gmail.com');

-- Trọng tài bàn:
update public.profiles set role = 'scorekeeper'
where id = (select id from auth.users where email = 'trong-tai@gmail.com');
```

### 6. Deploy Vercel

Import repo vào Vercel, thêm các biến `NEXT_PUBLIC_*` như trong `.env.local`, đặt `NEXT_PUBLIC_SITE_URL` bằng domain Vercel và thêm `https://<domain>/auth/callback` vào Redirect URLs của Supabase.

## Phân quyền

| Vai trò | Xem giải / TV | Nhập điểm | Tạo giải, ghép cặp, chia bảng, sửa luật, quản lý VĐV |
|---|---|---|---|
| Khách (chưa đăng nhập), `viewer` | ✓ | | |
| `scorekeeper` | ✓ | ✓ | |
| `organizer` | ✓ | ✓ | ✓ |

RLS mở quyền đọc công khai. Ghi dữ liệu chỉ dành cho BTC. Việc tính điểm đi qua các hàm RPC có khoá dòng (`match_action`, `finalize_match`, `call_next_match`), nên hai điện thoại cùng bấm điểm một sân không ghi đè lên nhau.

## Realtime

Publication `supabase_realtime` gồm `matches`, `tournaments`, `tournament_events`, `tournament_groups`, `group_teams`.

Mỗi giải chỉ mở **một kênh**, dùng chung cho mọi component (store có đếm tham chiếu trong `lib/supabase.ts`). Khi mạng chập chờn và kết nối lại, app tự tải lại toàn bộ để không lỡ thay đổi nào.

## Hook chính

```ts
const { matches, connected } = useRealtimeMatches(tournamentId);   // trận đấu cập nhật trực tiếp
const { vm } = useTournamentData(tournamentId);                      // toàn bộ dữ liệu giải (view model)
const engine = useStandingsEngine(tournamentId);                     // BXH theo luật ưu tiên của giải
engine.getStandings(eventId, 'A');   // BXH Bảng A
engine.knockoutFor(eventId);         // cặp đấu 1A–2B, 1B–2A
```

## Chế độ Demo

Đặt `NEXT_PUBLIC_ENABLE_DEMO=true` thì trọng tài/BTC sẽ thấy nút **Demo**. Nút này tự bấm điểm qua đúng các RPC thật để xem realtime chạy. Chỉ bật trên môi trường thử nghiệm.
