# PickleMasters Live

Webapp tổ chức giải Pickleball phong trào: bảng xếp hạng realtime, chia bảng, nhập điểm trên điện thoại và màn hình TV 16:9.

**Công nghệ:** Next.js 14 (App Router), Tailwind CSS 3, lucide-react, Supabase (PostgreSQL, Realtime, Google Auth).

## Cấu trúc thư mục

```
app/
  admin/page.tsx           Phân quyền bằng Gmail (Admin): cấp / đổi / thu hồi quyền BTC, Trọng tài
  members/page.tsx         Quản lý thành viên: tìm kiếm, lọc nhóm, thêm / sửa / xoá, số điện thoại (chỉ BTC xem)
  layout.tsx               Font Be Vietnam Pro (chữ) + Barlow Condensed (số điểm), nền slate-950
  page.tsx                 Khung app: màn hình Trận Đấu / Xếp Hạng & Nhánh / Vinh Danh / BTC / Trọng Tài / Quản lý giải đấu
  tv/[tournamentId]/       Trang TV không viền cho máy chiếu: /tv/<id>
  auth/callback/route.ts   Nhận code Google OAuth → cookie phiên
components/
  kit.tsx                  Bộ UI dùng chung theo bản demo v4: thang chữ 4 cấp (T1–T4), thẻ, nút, Sheet, Confirm, LiveBadge
  Navbar.tsx               Header (chọn giải · 📺 TV · menu avatar) + thanh điều hướng đáy 52px cho nhân sự;
                           khách không có thanh đáy mà có 3 tab ngay dưới header. Tự ẩn khi cuộn xuống (ngưỡng 15px)
  TournamentManager.tsx    Quản lý giải đấu (menu avatar): trạng thái, Mở, Chỉnh sửa, Đóng/Khoá, Xoá
  PodiumView.tsx           Bục trao giải Vàng / Bạc / Đồng + pháo hoa canvas-confetti (bản trang và bản TV 16:9)
  PublicView.tsx           3 tab khán giả: Trận Đấu (thẻ tỉ số kiểu FotMob + ngăn chi tiết trận),
                           Xếp Hạng & Nhánh, Vinh Danh (bục trao giải + pháo hoa)
  AdminDashboard.tsx       BTC dạng 3 bước: 1 Cấu hình & thể lệ · 2 VĐV, ghép cặp, chia bảng · 3 Điều hành & Knockout
  ScorekeeperView.tsx      Nhập từng quả (+1, người giao, đổi giao, hủy quả) và Kết quả nhanh
  TVBroadcastView.tsx      Màn hình 16:9: 2 sân live, BXH tự chuyển bảng, trận kế tiếp, dòng chữ chạy
  ui.tsx                   Thành phần cũ, chỉ còn màn trao giải (PodiumView) dùng
hooks/
  useScrollDirection.ts    Ẩn / hiện thanh điều hướng theo hướng cuộn (ngưỡng 15px)
  useClickOutside.ts       Đóng menu / popup khi bấm ra ngoài hoặc nhấn Esc
lib/
  actions.ts               Server Actions: phân quyền Gmail, thành viên, tạo giải, đóng / mở giải, tạo Chung kết
  client-actions.ts        Ghi dữ liệu phía trình duyệt (bấm điểm tức thì, chia bảng, luật)
  supabase.ts              Client + store realtime + hook: useRealtimeMatches, useTournamentData,
                           useStandingsEngine, useTournaments, useAuth
  engine.ts                Logic thuần: BXH theo luật ưu tiên, chia bảng kiểu rắn, lịch vòng tròn, gọi điểm
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
npm install          # bản 1.1 cần thêm canvas-confetti
npm run seed        # tuỳ chọn: nạp dữ liệu mẫu giống prototype
npm run dev
```

### 5. Admin đầu tiên và phân quyền

1. Chạy thêm migration `supabase/migrations/20260927000000_admin_members_lifecycle.sql`.
2. Đăng nhập Google trên app rồi mở **/admin**. Khi hệ thống chưa có Admin, trang sẽ hiện nút **Nhận quyền Admin**. Nút này chỉ dùng được đúng một lần, vì vậy hãy làm ngay sau khi deploy.
3. Từ đó Admin cấp quyền cho người khác ngay trên trang /admin: gõ Gmail và chọn **Ban Tổ Chức** hoặc **Trọng Tài**. Người được cấp chỉ cần đăng nhập đúng Gmail đó.

Nếu trước đây bạn đã đặt `profiles.role = 'organizer'` bằng SQL, migration sẽ tự chuyển tài khoản đó thành **Admin**.

### 5b. Bản 1.2 (giao diện mới)

Chạy thêm migration `supabase/migrations/20260928000000_referee_tournament_manager.sql`. Migration này thêm:

- cột `matches.referee` (tên trọng tài, công khai) và trigger tự gán trọng tài của sân khi trận lên sân;
- hàm `delete_tournament()` cho nút **Xoá** trong Quản lý giải đấu. Giải đã kết thúc thì chỉ Admin xoá được.

### 6. Deploy Vercel

Import repo vào Vercel, thêm các biến `NEXT_PUBLIC_*` như trong `.env.local`, đặt `NEXT_PUBLIC_SITE_URL` bằng domain Vercel và thêm `https://<domain>/auth/callback` vào Redirect URLs của Supabase.

### 5c. Bản 1.3 (tự động vòng loại trực tiếp)

Chạy thêm migration `supabase/migrations/20260929000000_auto_knockout.sql`. Sau đó:

- Vòng bảng của một nội dung xong → app tự tạo lịch Bán kết (hoặc Chung kết nếu chỉ 2 đội đi tiếp) và đưa trận lên sân trống.
- 2 trận Bán kết xong → database tự tạo Chung kết (và Tranh hạng 3 nếu bật).
- Nếu các đội bằng nhau ở mọi tiêu chí ưu tiên, app không tự tạo mà báo BTC quyết định ở Bước 3.
- BTC có thể **Huỷ lịch vừa tạo** khi các trận đó chưa đấu (tự động tạm dừng cho nội dung đó, bấm **Bật lại** để tiếp tục).
- Bước 1 có 2 công tắc: **Tự động tạo Bán kết & Chung kết** và **Tổ chức trận Tranh hạng 3**. Tắt Tranh hạng 3 thì 2 đội thua Bán kết đồng hạng 3.

## Phân quyền

| Vai trò | Xem giải / TV | Nhập điểm | Tạo giải, ghép cặp, chia bảng, thành viên, đóng giải | Phân quyền, mở lại giải |
|---|---|---|---|---|
| Khách (chưa đăng nhập hoặc Gmail chưa được cấp quyền) | ✓ | | | |
| Trọng Tài (`scorekeeper`) | ✓ | ✓ | | |
| Ban Tổ Chức (`organizer`) | ✓ | ✓ | ✓ | |
| Admin (`admin`) | ✓ | ✓ | ✓ | ✓ |

Quyền được lưu trong bảng `user_roles` (Gmail → vai trò). Mọi hàm RLS (`is_staff`, `is_organizer`, `is_admin`) đều đọc từ bảng này. Hệ thống luôn giữ lại ít nhất một Admin.

**Số điện thoại thành viên** nằm ở bảng riêng `player_contacts`. Chỉ BTC và Admin đọc được, khách và trọng tài không thấy.

**Giải đã kết thúc** (`status = 'completed'`) bị khoá ở tầng database: mọi thay đổi trận đấu, bảng, đội đều bị từ chối (`TOURNAMENT_LOCKED`). Chỉ Admin mới mở lại được giải.

## Vòng đời giải đấu

0. Menu avatar → **Quản lý giải đấu** → **Tạo giải** (trạng thái *Sắp diễn ra*). Vào tab **BTC**:
   Bước 1 chỉnh số sân, điểm thắng game (11/15/21), cách biệt (1 hoặc 2), thứ tự ưu tiên xếp hạng, nội dung thi đấu.
   Bước 2: 2.1 chọn VĐV → 2.2 ghép cặp (Cân bằng theo trình / Cân bằng A-B / Thủ công) → 2.3 chia bảng → **Áp dụng & tạo lịch** (giải chuyển sang *Đang thi đấu*).
   Bước 3: gán trọng tài cho từng sân, theo dõi các sân.
1. Vòng bảng xong → BTC bấm **Tạo lịch Bán kết**.
2. Hai trận Bán kết xong → bấm **Tạo trận Chung kết & Tranh Hạng Ba**. Người thắng vào Chung kết, người thua đá Tranh hạng 3.
3. Chung kết xong → bấm **Đóng / Kết thúc Giải đấu**. Trang khán giả mở tab **Vinh danh**. Màn hình `/tv/<id>` tự chuyển sang **Màn hình Trao giải** có pháo hoa.

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
