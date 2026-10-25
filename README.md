# Thành Trì

Game RTS sinh tồn chống quái trên trình duyệt. Bạn chỉ huy một ngôi làng sống quanh một tòa thành chạy trên đường ray:
ban ngày khai thác, xây và lên đường, ban đêm cố thủ. Mỗi sáng phải chọn giữ những gì đã xây hay đánh đổi để đi tiếp.

Viết bằng Vite, TypeScript (strict) và Three.js. Mô hình 3D dùng KayKit và Kenney Nature Kit (đều CC0, xem
[CREDITS.md](CREDITS.md)); địa hình, đường ray, hiệu ứng và âm thanh dựng bằng code; không có server, chơi được offline
sau lần mở đầu.

> Người mới vào dự án: đọc **[docs/TONG_QUAN.md](docs/TONG_QUAN.md)** trước (ý tưởng, lối chơi, hệ thống, hiện trạng),
> rồi **[docs/THANH_TRI_GDD_V1_2.md](docs/THANH_TRI_GDD_V1_2.md)** (thiết kế mục tiêu). Bản hiện tại là **prototype P0
> của GDD v1.2**.

## Chạy

```bash
npm install
npm run dev
```

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Máy chủ phát triển |
| `npm run build` | Build ra `dist/` |
| `npm run test` | Vitest (50 test) |
| `npm run sim` | Ba bot (Bám trụ, Du mục, Chiến thuật) tự chơi 20 seed mỗi kiểu, in trung vị, P10/P90, tỉ lệ ở lại, nguyên nhân thua |
| `npm run sim -- --seeds 100` | Đúng cỡ mẫu của GDD §16.3 (chậm, nên chạy nền) |
| `npm run check` | typecheck + lint + test + build |

Tham số URL: `?lang=en` (tiếng Anh), `?fps=1` (hiện FPS), `?seed=123` (cố định seed), `?speed=4` (tua nhanh để thử,
1–16), `?shadows=0` (tắt bóng đổ).

## Cách chơi

**Chế độ** (menu Chơi mới): **Hành trình** 12 đêm có đích và boss đêm cuối, **Thử thách ngắn** 6 đêm, **Vô tận**.

| Thao tác | PC | Điện thoại (xoay ngang) |
| --- | --- | --- |
| Camera | WASD / mũi tên / kéo chuột giữa; lăn chuột phóng to; C về thành | Kéo một ngón; chụm hai ngón |
| Chọn quân | Kéo chuột trái quét khung; bấm một con; Shift để chọn thêm | Nút ⬚ Chọn rồi kéo khung; chạm một con |
| Chọn cả loại quân | Bấm nút loại ở thanh dưới | Chạm nút loại |
| Đội (squad) | 1–5 chọn đội; Ctrl+số gán quân đang chọn | Dải nút Đội; nút "Gán vào đội" |
| Ra lệnh di chuyển | Chuột phải vào đất | Chạm đất sau khi chọn |
| Tập trung đánh một con | Chuột phải vào quái, hoặc F rồi bấm | Nút 🎯 rồi chạm quái |
| Giữ vị trí / Bảo vệ / Rút lui | G / U / R | Nút ✋ / 🛡 / ↩ |
| Đội hình Tuyến chắn / Vòng tròn | L | Nút ▤ |
| Tự động lại | Nút ↺ | Nút ↺ |
| Kinh tế (ưu tiên lao động) | K | Nút 📦 |
| Ô phòng | Bấm vào thành / Tab | Chạm thành / nút 🏰 |
| Xây ngoài thành | B | Nút ⚒ (chạm xem trước, chạm lần nữa để đặt) |
| Chạy/Dừng (chỉ ban ngày) | Space | Nút Chạy |
| Gọi tất cả về | H | Nút 📯 |
| Kỹ năng | Q Mưa tên, E Chuông, Z Đóng cửa, X Dân quân, V Sửa khẩn | Nút kỹ năng |
| Tốc độ x1/x2 | T | Nút x1 |
| Tạm dừng (vẫn ra lệnh được) | P / Esc | Nút ⏸ |
| AI chơi thay (bot trình diễn) | O | Nút 🤖 |

Việc nhỏ quân luôn tự lo: nông dân khai thác theo ưu tiên, thợ sửa chỗ khẩn cấp, lính tự đánh trong tầm, cung thủ
lên sàn thành. Lệnh tay đè lên việc tự động cho tới khi bấm **Tự động lại**. **AI chơi thay** là chế độ riêng để xem.

## Đồ hoạ và ghi công

- **KayKit** của Kay Lousberg (CC0): nhân vật, xương khô, tòa thành, tháp, tường gỗ, cây, đá, đồi núi.
- **Nature Kit** của Kenney (CC0): cỏ, hoa, nấm, sỏi, khúc gỗ, ruộng bí ngô / lúa mì / ngô.
- Địa hình liền mạch low-poly và đường ray dựng bằng code; bóng đổ mặt trời tự tắt khi máy yếu.
- Chi tiết từng file trong [CREDITS.md](CREDITS.md); trong game xem ở menu **Ghi công**.
- `public/models/*.glb` là bản đã cắt gọn (khoảng 3,7MB). Dựng lại từ file gốc:
  `node scripts/build-models.mjs <thư mục KayKit | -> [<thư mục "Models/GLTF format" của Kenney>]`
  (model Medieval để trong thư mục con `med/` của thư mục KayKit).

## Kiến trúc

```
src/
  data/balance.ts   mọi con số và nội dung: phòng, quân, quái, thẻ, địa hình, độ khó, tải trọng, học thuyết
  sim/              simulation thuần TS, không import DOM hay Three.js
    sim.ts          vòng lặp 1/60 giây, Command vào, GameEvent ra
    grid.ts         lưới điều hướng 80×80 ô quanh thành; A* có cache; flow field cho quái
    world.ts        con đường vô tận chia đoạn 48 ô, sinh theo seed
    difficulty.ts   số quái, số hướng, độ dài pha theo 3 giai đoạn
    rng.ts          RNG có seed, trạng thái nằm trong GameState
    bot.ts          3 bot policy (Bám trụ, Du mục, Chiến thuật); dùng cho npm run sim, test và AI chơi thay
  render/           Three.js, chỉ đọc state; terrain.ts, models.ts (KayKit + Kenney), InstancedMesh, bóng đổ
  ui/               HUD bằng DOM và CSS; localStorage (lưu, điểm cao)
  input/            chuột/bàn phím/cảm ứng → Command
  i18n/             en.ts định nghĩa khóa; vi.ts là Record<MessageKey, string>
  audio/            hiệu ứng âm thanh WebAudio
public/sw.js        Service Worker: chơi offline sau lần mở đầu
```

- Toàn bộ trạng thái là một object JSON (`GameState`). Lưu mỗi bình minh; lưới, đường đi và flow field được dựng
  lại khi tải. Có test: tải lại chạy tiếp giống hệt, cùng seed + cùng lệnh ra cùng trạng thái; `stateHash()` để so.
- Bản lưu cũ vẫn mở được: các trường mới được điền mặc định khi tải.
- Mỗi đêm ghi một `NightRecord` (tuyến, địa hình, số quái, tổn thất, nguyên nhân vỡ) trong `history` để phân tích.

## Hiện trạng so với GDD v1.2

| Mục GDD | Đã làm |
| --- | --- |
| Nhịp 3 giai đoạn, tạm dừng vẫn ra lệnh, x1/x2 | Có |
| D02 Tài nguyên hữu hạn, không hồi; quái nhận biết trại (thêm quái khi ở lâu) | Có |
| E01–E03 Khai thác–vận chuyển–nộp, ưu tiên lao động, hàng rơi, sản lượng/phút, dự báo lương thực; đói thì suy yếu rồi có người bỏ đi | Có |
| F01–F03 Squad 1–5, Giữ / Bảo vệ / Tập trung / Rút lui / Tự động, Tuyến chắn và Vòng, chắn đường, frontage 3, lính khiên, 3 loại sát thương | Có |
| N01–N02 Kế hoạch đêm chốt trước ở hoàng hôn, 6 kiểu áp lực, báo hướng/mức/mối đe doạ, dự báo ước lượng hoặc xác nhận | Có |
| U01 Báo cáo bình minh 3 ý | Có |
| C01 Tải trọng thành, Kho, Bếp, bỏ bớt hàng | Có |
| P01 Hai học thuyết Pháo đài / Đoàn hành quân | Có |
| §7.1 Đóng cửa khẩn cấp, Dân quân, Sửa khẩn; sửa chữa tốn gỗ | Có |
| §13 Thẻ có đánh đổi | Có (14 thẻ) |
| §14 Hành trình / Thử thách ngắn / Vô tận | Có |
| Q01–Q03 Hash trạng thái, log đêm, bot 3 policy, offline cache | Có |
| P1 trở đi: world graph nhánh, trinh sát, nhiệm vụ ban ngày, biome mới, sắt, kỵ binh, học thuyết Quân giới, playtest có quan sát | Chưa |

## Cân bằng

`npm run sim -- --seeds 8` gần nhất: Bám trụ trung vị 7 đêm, Du mục 6, Chiến thuật 7 (mục tiêu 5–8). Ba policy còn
gần nhau; theo GDD §16.4 đây là việc cần chỉnh tiếp bằng playtest và cỡ mẫu 100 seed. Mọi con số nằm trong
`src/data/balance.ts`.

## Quyết định tự đưa ra (chỗ đặc tả để ngỏ)

- **Lưới phòng** 4 cột: đời 1 mở 2×2, đời 2 mở 4×2, thẻ "+1 ô" mở hàng 3. Cộng hưởng theo ô kề cạnh: Trại lính +
  Xưởng thợ, Tháp canh + Trường bắn, Bếp + Nhà dân, Kho + Xưởng thợ.
- **Đi tiếp:** chọn điểm dừng lúc bình minh, thành chỉ lăn khi bấm Chạy để kịp tháo công trình. Hoàng hôn tới mà chưa
  tới nơi thì dừng tại chỗ.
- **"Ở lại"** = đêm nay đứng cách chỗ đêm trước dưới 8 ô.
- **Lính khiên** dùng lại mô hình hiệp sĩ KayKit, to hơn và tô xanh thép (bản miễn phí không có mô hình riêng).
- **Học thuyết** được hỏi một lần, ở bình minh sau đêm 2.
- **Đóng cửa khẩn cấp** mỗi đêm một lần; Dân quân và Sửa khẩn mở bằng thẻ.
- **Người lạ xin gia nhập** tự động nhận nếu còn chỗ; **cháy mái** có thể xảy ra từ đêm 2.
- **Chạm nhầm:** màn bình minh bỏ qua các lần chạm trong 350ms đầu sau khi đổi bước.

## Deploy lên Vercel

Site tĩnh: `npm run build` ra `dist/`. `vercel.json` đã cấu hình build, thư mục `dist`, framework Vite và cache dài
cho `/assets/*`. Cách 1: push lên GitHub, vào vercel.com → Add New → Project → Import repo, Framework **Vite**,
Deploy. Cách 2, qua CLI:

```bash
npm i -g vercel
```

```bash
vercel --prod
```

Có PWA (manifest, icon, Service Worker) để thêm vào màn hình chính và chơi offline.
