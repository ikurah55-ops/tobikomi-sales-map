// OpenStreetMap から「大きな駐車場のある店」(コンビニ・スーパー・本屋・ホームセンター・ドラッグストア・モール)を抜き出し、
// 市区町村ごとの JSON にする。
//
//   node scripts/facilities.mjs --pref 06            # 山形県(取得済みの data/raw/osm-06.json があれば再利用)
//   node scripts/facilities.mjs --pref 06 --refresh  # Overpass API から取り直す
//
// 市区町村の判定には public/data/regions/{pref}/*.json(国勢調査の前処理の出力)を使うので、先に data:build を済ませておく。
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true] : [])).filter((x) => x.length),
);
const pref = String(args.pref ?? '06').padStart(2, '0');
const rawFile = join('data/raw', `osm-${pref}.json`);
const regionDir = join('public/data/regions', pref);
const outDir = 'public/data/facilities';

/** 1台あたりの面積(通路込み)。台数はこれで割った推定値 */
const M2_PER_SPACE = 25;
/** これより小さい駐車場の店はデータに入れない(アプリ側でさらに絞り込む) */
const MIN_SPACES = 10;

// 種類ごとに、店の位置から駐車場までの許容距離(m)。大きな店ほど敷地が広く、店の点と駐車場が離れる
const CATEGORIES = {
  // コンビニの隣の大きな駐車場は駅・病院などのものが多いので、maxSpaces を超える駐車場は数えない
  conv: { label: 'コンビニ', shops: ['convenience'], radius: 40, maxSpaces: 80 },
  super: { label: 'スーパー', shops: ['supermarket'], radius: 70 },
  books: { label: '本屋', shops: ['books'], radius: 70 },
  drug: { label: 'ドラッグストア', shops: ['chemist'], radius: 70 },
  home: { label: 'ホームセンター', shops: ['doityourself', 'hardware'], radius: 120 },
  mall: { label: 'モール', shops: ['mall', 'department_store'], radius: 180 },
};
const SHOP_TO_CAT = Object.fromEntries(Object.entries(CATEGORIES).flatMap(([c, d]) => d.shops.map((s) => [s, c])));
// 分類の間違い(コンビニが supermarket で登録されているなど)を店名で直す
// 駅の中の売店は駐車場と関係ないので除く
const STATION_KIOSK = /NewDays|ニューデイズ|キヨスク|KIOSK/i;
const CONV_NAME = /セブン|ファミリーマート|ファミマ|ローソン|ミニストップ|デイリーヤマザキ|ヤマザキショップ|セイコーマート|ニューデイズ|NewDays|ポプラ|7-Eleven|FamilyMart|LAWSON/i;

// ---------- Overpass から取得 ----------
// 混雑して 429/502/504 を返すことがあるので、ミラーを順に試し、待ってから再試行する
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tobikomi-sales-map-preprocess' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.ok) return (await res.json()).elements;
      last = `${res.status} ${(await res.text()).slice(0, 120)}`;
    } catch (e) {
      last = e.message;
    }
    const wait = 10 * 2 ** Math.floor(attempt / ENDPOINTS.length);
    console.log(`  ${url} が応答しません(${last.split('\n')[0]})。${wait}秒後に再試行`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Error(`Overpass API から取得できませんでした: ${last}`);
}

async function loadOsm() {
  if (existsSync(rawFile) && !args.refresh) {
    console.log(`取得済みの ${rawFile} を使います(取り直すときは --refresh)`);
    return JSON.parse(readFileSync(rawFile, 'utf8'));
  }
  const area = `area["ISO3166-2"="JP-${pref}"]->.a;`;
  const shopRe = Object.keys(SHOP_TO_CAT).join('|');
  console.log('Overpass API から店を取得中…');
  const shops = await overpass(`[out:json][timeout:180];${area}nwr["shop"~"^(${shopRe})$"](area.a);out center tags;`);
  console.log(`  ${shops.length}件。駐車場を取得中…`);
  const parking = await overpass(`[out:json][timeout:300];${area}way["amenity"="parking"](area.a);out geom tags;`);
  console.log(`  ${parking.length}件`);
  const data = { fetchedAt: new Date().toISOString(), shops, parking };
  mkdirSync(dirname(rawFile), { recursive: true });
  writeFileSync(rawFile, JSON.stringify(data));
  return data;
}

// ---------- 幾何(数十m〜数km なので平面近似で十分) ----------
const R = 6371008;
const rad = (d) => (d * Math.PI) / 180;
/** 緯度 lat0 付近の平面座標(m) */
const project = (lat0) => (lat, lng) => [rad(lng) * R * Math.cos(rad(lat0)), rad(lat) * R];

function polygonAreaM2(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(s / 2);
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** 点から多角形までの距離(中にあれば 0) */
function distToPolygon(p, pts) {
  if (inRing(p, pts)) return 0;
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, distToSegment(p, pts[j], pts[i]));
  return d;
}

// ---------- 本処理 ----------
const osm = await loadOsm();

// 駐車場: 面積と推定台数。私有(関係者以外不可)は除く
const lots = [];
for (const w of osm.parking) {
  const t = w.tags ?? {};
  if (!w.geometry || w.geometry.length < 4) continue;
  if (['private', 'no', 'permit'].includes(t.access)) continue;
  if (t.fee === 'yes') continue; // 有料駐車場(コインパーキング・駅の駐車場など)は店の駐車場ではない
  const lat0 = w.geometry[0].lat;
  const proj = project(lat0);
  const pts = w.geometry.map((g) => proj(g.lat, g.lon));
  const levels = Number(t['parking:levels'] ?? t['building:levels']) || 1;
  const capacity = Number(t.capacity);
  const area = polygonAreaM2(pts);
  lots.push({
    id: w.id,
    proj,
    pts,
    bounds: w.bounds,
    spaces: capacity > 0 ? capacity : Math.round((area * levels) / M2_PER_SPACE),
  });
}

// 店
const stores = [];
for (const e of osm.shops) {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat == null || !t.name || STATION_KIOSK.test(t.name)) continue;
  let cat = SHOP_TO_CAT[t.shop];
  if (CONV_NAME.test(`${t.name} ${t.brand ?? ''}`)) cat = 'conv';
  stores.push({ id: `${e.type[0]}${e.id}`, name: t.name, branch: t.branch, cat, lat, lng, spaces: 0 });
}

// 駐車場を、許容距離内でいちばん近い店1つに割り当てる(同じ駐車場を2店で数えない)
const near = (b, lat, lng, m) => {
  const dLat = m / 111000;
  const dLng = m / (111000 * Math.cos(rad(lat)));
  return lat >= b.minlat - dLat && lat <= b.maxlat + dLat && lng >= b.minlon - dLng && lng <= b.maxlon + dLng;
};
for (const lot of lots) {
  let best = null;
  for (const s of stores) {
    const { radius: r, maxSpaces } = CATEGORIES[s.cat];
    if (maxSpaces && lot.spaces > maxSpaces) continue;
    if (!near(lot.bounds, s.lat, s.lng, r)) continue;
    const d = distToPolygon(lot.proj(s.lat, s.lng), lot.pts);
    if (d <= r && (!best || d < best.d)) best = { s, d };
  }
  if (best) best.s.spaces += lot.spaces;
}

// 市区町村の判定
const regions = readdirSync(regionDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(regionDir, f), 'utf8')));
if (!regions.length) throw new Error(`${regionDir} に地域データがありません。先に npm run data:build -- --pref ${pref} を実行してください`);

const inGeometry = (geom, lng, lat) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some((poly) => inRing([lng, lat], poly[0]) && !poly.slice(1).some((h) => inRing([lng, lat], h)));
};
function cityOf(lat, lng) {
  for (const r of regions) {
    const [w, s, e, n] = r.bbox;
    if (lng < w || lng > e || lat < s || lat > n) continue;
    if (r.features.some((f) => inGeometry(f.geometry, lng, lat))) return r;
  }
  return null;
}

const byCity = new Map();
let kept = 0;
let outside = 0;
for (const s of stores) {
  if (s.spaces < MIN_SPACES) continue;
  const r = cityOf(s.lat, s.lng);
  if (!r) { outside++; continue; }
  kept++;
  if (!byCity.has(r.code)) byCity.set(r.code, { region: r, list: [] });
  byCity.get(r.code).list.push({
    id: s.id,
    n: s.branch && !s.name.includes(s.branch) ? `${s.name} ${s.branch}` : s.name,
    c: s.cat,
    lat: +s.lat.toFixed(6),
    lng: +s.lng.toFixed(6),
    s: s.spaces,
  });
}

// ---------- 出力 ----------
const indexPath = join(outDir, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { regions: [] };
const generatedAt = new Date().toISOString();
for (const { region: r, list } of byCity.values()) {
  list.sort((a, b) => b.s - a.s);
  const rel = `${r.prefCode}/${r.code}.json`;
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ format: 1, code: r.code, name: r.name, prefCode: r.prefCode, prefName: r.prefName, generatedAt, osmFetchedAt: osm.fetchedAt, facilities: list }));
  const entry = { code: r.code, name: r.name, prefCode: r.prefCode, prefName: r.prefName, path: rel, count: list.length, size: statSync(file).size, generatedAt };
  index.regions = index.regions.filter((x) => x.code !== r.code).concat(entry);
}
index.regions.sort((a, b) => a.code.localeCompare(b.code));
index.generatedAt = generatedAt;
writeFileSync(indexPath, JSON.stringify(index, null, 1));

// 台数の分布(アプリの「○台以上」の初期値を決める目安)
const all = [...byCity.values()].flatMap((x) => x.list);
const dist = [10, 20, 30, 50, 100].map((t) => `${t}台以上 ${all.filter((f) => f.s >= t).length}`).join(' / ');
console.log(`\n店 ${stores.length}件 → 駐車場${MIN_SPACES}台以上 ${kept}件(県外・地域データ外 ${outside}件)、${byCity.size}市区町村`);
console.log(`分布: ${dist}`);
for (const c of Object.keys(CATEGORIES)) {
  const xs = all.filter((f) => f.c === c);
  console.log(`  ${CATEGORIES[c].label}: ${xs.length}件 ${[10, 20, 30, 50, 100].map((t) => xs.filter((f) => f.s >= t).length).join('/')}`);
}
