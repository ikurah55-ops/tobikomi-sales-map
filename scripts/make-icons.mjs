// PWA用のアイコン(紺の背景に白い地図ピン)を外部ライブラリなしで PNG/SVG として書き出す
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const NAVY = [27, 58, 107];
const WHITE = [255, 255, 255];
mkdirSync('public/icons', { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// ピンの形(単位座標 0..1): 上の円 + 下に尖る三角、中に穴
function inPin(x, y) {
  const cx = 0.5, cy = 0.42, r = 0.2;
  const d = Math.hypot(x - cx, y - cy);
  if (d < 0.075) return false;
  if (d <= r) return true;
  // 円の接線から先端(0.5, 0.8)までの三角形
  if (y > cy && y < 0.8) {
    const half = r * (0.8 - y) / (0.8 - cy) * 1.05;
    return Math.abs(x - cx) <= half;
  }
  return false;
}

function png(size) {
  const ss = 4; // アンチエイリアス用のサンプル数
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        if (inPin((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size)) hit++;
      }
      const a = hit / (ss * ss);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(NAVY[i] * (1 - a) + WHITE[i] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s));
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#1b3a6b"/><path d="M50 80 L36 52 A20 20 0 1 1 64 52 Z" fill="#fff"/><circle cx="50" cy="42" r="7.5" fill="#1b3a6b"/></svg>`);
console.log('public/icons/ にアイコンを書き出しました');
