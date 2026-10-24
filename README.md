# Thành Trì

Bản demo chơi được của một game RTS sinh tồn chống quái trên trình duyệt. Bạn chỉ huy một ngôi làng sống quanh một
tòa thành biết đi: ban ngày khai thác, xây và lên đường, ban đêm cố thủ. Chơi vô tận, điểm chính là số đêm sống sót.

Viết bằng Vite, TypeScript (strict) và Three.js. Mô hình 3D dùng bộ KayKit (CC0, xem phần ghi công), phần còn lại
dựng bằng code; âm thanh tổng hợp bằng WebAudio; không có server.

## Chạy

```bash
npm install
npm run dev
```

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Máy chủ phát triển |
| `npm run build` | Build ra `dist/` |
| `npm run test` | Vitest |
| `npm run sim` | Bot chỉ huy tự chơi headless qua 10 seed, in số đêm trung bình |
| `npm run check` | typecheck + lint + test + build |

Tham số URL:
- `?lang=en`: tiếng Anh (mặc định tiếng Việt);
- `?fps=1`: hiện FPS;
- `?seed=123`: cố định seed;
- `?speed=4`: chạy nhanh để thử (1–16).

## Cách chơi

| Thao tác | PC | Điện thoại (xoay ngang) |
| --- | --- | --- |
| Camera | WASD / mũi tên / kéo chuột (trái hoặc giữa); C về thành | Kéo một ngón |
| Phóng to/thu nhỏ | Lăn chuột | Chụm hai ngón |
| Chọn nhóm | 1–4 hoặc thanh nhóm | Chạm thanh nhóm |
| Ra lệnh | Chuột phải (hoặc chuột trái khi đã chọn nhóm) | Chạm nhóm rồi chạm vị trí |
| Ô phòng | Bấm vào thành / Tab | Chạm thành / nút Thành |
| Xây ngoài thành | B | Nút Xây (chạm để xem trước, chạm lần nữa để đặt) |
| Chạy/Dừng (chỉ ban ngày) | Space | Nút Chạy |
| Gọi tất cả về | H | Nút Gọi về |
| Kỹ năng | Q Mưa tên, E Chuông triệu tập | Nút kỹ năng |
| Tạm dừng (vẫn ra lệnh được) | P / Esc | Nút ⏸ |
| **Auto: AI tự chơi** | O | Nút 🤖 Auto |

Ý nghĩa lệnh theo nhóm:
- **Nông dân:** chạm đất để cắm cờ khai thác quanh đó; chạm thành để vào thành trú.
- **Thợ:** chạm công trình để sửa nó trước; chạm thành để sửa tường thành.
- **Lính giáo, cung thủ:** chạm đất để giữ vị trí; chạm thành để về mặc định (lính canh quanh thành, cung thủ lên
  tường).

**Chế độ Auto:** bấm nút 🤖 Auto (hoặc phím O) thì bot chỉ huy tích hợp chơi thay toàn bộ: xây phòng, sinh quân, đặt
đuốc và tháp, dùng kỹ năng, chọn thẻ và chọn đường lúc bình minh (đợi khoảng 2,5 giây để bạn kịp đọc). Bấm lại để tự
điều khiển. Có thể kết hợp với `?speed=4` để xem nhanh.

## Đồ hoạ và ghi công

Mô hình 3D lấy từ **KayKit** của **Kay Lousberg** ([www.kaylousberg.com](https://www.kaylousberg.com)), giấy phép
**CC0**: Adventurers Character Pack, Skeletons Character Pack và Medieval Hexagon Pack. Chi tiết từng file, nguồn và
cách dùng nằm trong [CREDITS.md](CREDITS.md); trong game xem ở menu **Ghi công**.

- `public/models/*.glb` là bản đã cắt gọn (khoảng 3,3MB). Muốn dựng lại từ file gốc, tải các file liệt kê trong
  CREDITS.md vào một thư mục (model Medieval để trong thư mục con `med/`), rồi chạy
  `node scripts/build-models.mjs <thư mục>`.
- Lúc chạy, vài khung của các hoạt ảnh đứng, đi/chạy và đánh được "nướng" thành mesh tĩnh để vẽ hàng loạt bằng
  InstancedMesh. Nhờ vậy 30 quân và 80 quái vẫn nhẹ.
- Nếu model chưa tải xong (hoặc tải lỗi), game dùng tạm hình dựng bằng code.

## Kiến trúc

```
src/
  data/balance.ts   mọi con số và nội dung: phòng, quân, quái, thẻ, địa hình, độ khó
  sim/              simulation thuần TS, không import DOM hay Three.js
    sim.ts          vòng lặp 1/60 giây, Command vào, GameEvent ra
    grid.ts         lưới điều hướng 80×80 ô quanh thành; A* có cache; flow field cho quái
    world.ts        con đường vô tận chia đoạn 48 ô, sinh theo seed
    difficulty.ts   số quái, số hướng, độ dài pha
    rng.ts          RNG có seed, trạng thái nằm trong GameState
    bot.ts          bot chỉ huy (dùng cho `npm run sim`, test và chế độ Auto)
  render/           Three.js, chỉ đọc state; InstancedMesh cho quân, quái, cây, đá, công trình
  ui/               HUD bằng DOM và CSS; localStorage (lưu, điểm cao)
  input/            chuột/bàn phím/cảm ứng → Command
  i18n/             en.ts định nghĩa khóa; vi.ts là Record<MessageKey, string>
  audio/            hiệu ứng âm thanh WebAudio
```

- Toàn bộ trạng thái là một object JSON (`GameState`). Lưu là `JSON.stringify` mỗi bình minh. Lưới, đường đi và
  flow field là dữ liệu dẫn xuất, được dựng lại khi tải, nên bản tải lại chạy tiếp giống hệt bản gốc (có test).
- Đường đi của đơn vị là hàm thuần của (ô hiện tại, ô đích, lưới) nên kết quả không phụ thuộc lúc cache được tạo.
- Quái dùng flow field tới thành. Tường có thể đi xuyên với chi phí cao: tường ngắn thì quái đi vòng, tường dài thì
  quái đập.

## Quyết định tự đưa ra (chỗ đặc tả để ngỏ)

- **Ô phòng:** lưới 4 cột. Đời 1 mở 2×2 ô góc trái, đời 2 mở thành 4×2, thẻ "+1 ô" mở dần hàng thứ 3. Cộng hưởng tính
  theo ô kề cạnh (không tính chéo). Khởi đầu có sẵn Nhà dân và Xưởng thợ để làm được việc ngay.
- **Đi tiếp:** chọn điểm dừng lúc bình minh, nhưng thành chỉ lăn khi người chơi bấm Chạy, để kịp cho thợ tháo công
  trình lấy hoàn 30%. Bấm Chạy là mọi công trình chưa tháo bị bỏ lại ngay. Hoàng hôn tới mà chưa tới nơi thì thành
  dừng tại chỗ (vùng đó vẫn có tài nguyên vì thế giới liên tục).
- **"Ở lại"** được tính theo vị trí: đêm nay đứng cách chỗ đêm trước dưới 5 ô thì tính là ở lại (+1 hướng).
- **Bánh xe** mất một phần nhỏ sát thương cận chiến vào thành; thợ tự sửa khi rảnh.
- **Người lạ xin gia nhập** tự động nhận (1 nông dân + 1 lính giáo) nếu còn chỗ, kèm thông báo.
- **Cháy mái** có thể xảy ra từ đêm 2; lõi mất máu tới khi thợ dập xong.
- **Đất kiệt:** ở một chỗ quá 2 đêm thì tài nguyên quanh đó ngừng hồi; thẻ "Ở lại" báo "Vùng này đã kiệt" khi đã
  kiệt hoặc còn dưới 25%. Đứng yên mãi thì khoảng đêm 6–7 là hết sạch, buộc phải đi tiếp.
- **Quái lẻ ban ngày** có từ ngày thứ 2. Ban ngày, lính giáo rảnh tự đuổi quái trong bán kính 18 quanh thành.
- **Hết đêm:** quái còn sống bỏ chạy lúc bình minh.
- **Nông dân rảnh** ưu tiên loại tài nguyên đang ít trong kho.
- **Chạm nhầm:** màn bình minh bỏ qua các lần chạm trong 350ms đầu sau khi đổi bước.

## Cân bằng

`npm run sim` cho bot chơi 10 seed. Kết quả gần nhất: **trung bình 6,6 đêm** (mục tiêu 5–8). Muốn chỉnh thì sửa
`src/data/balance.ts` rồi chạy lại `npm run sim`.

## Deploy lên Vercel

Đây là site tĩnh: `npm run build` ra `dist/`. `vercel.json` đã cấu hình lệnh build, thư mục `dist`, framework Vite
và cache dài cho `/assets/*`.

**Cách 1, qua GitHub:** push repo lên GitHub, vào vercel.com, chọn Add New → Project → Import repo, Framework Preset
để **Vite**, bấm Deploy.

**Cách 2, qua CLI:**

```bash
npm i -g vercel
```

```bash
vercel
```

```bash
vercel --prod
```

Không cần biến môi trường hay server. Có PWA tối thiểu (`manifest.webmanifest` và icon) để thêm vào màn hình chính
trên điện thoại.
