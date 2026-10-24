// Writes public/icon-192.png and icon-512.png (a simple castle) without any image library.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const rect = (x, y, w, h) => (px, py) => px >= x && px < x + w && py >= y && py < y + h;
  const circ = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  const tri = (px, py) => py >= 6 && py <= 16 && Math.abs(px - 32) <= (py - 6) * 0.8;
  const layers = [
    [circ(48, 16, 6), [240, 230, 192]],
    [rect(14, 26, 36, 22), [168, 160, 144]],
    [rect(10, 20, 8, 28), [138, 130, 116]],
    [rect(46, 20, 8, 28), [138, 130, 116]],
    [rect(26, 16, 12, 14), [122, 114, 102]],
    [tri, [176, 64, 48]],
    [rect(28, 36, 8, 12), [90, 58, 32]],
    [circ(18, 52, 5), [90, 58, 32]],
    [circ(46, 52, 5), [90, 58, 32]],
  ];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * (64 / size);
      const py = (y + 0.5) * (64 / size);
      let col = [26, 31, 46];
      for (const [hit, c] of layers) if (hit(px, py)) col = c;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
console.log('icons written');
