// 国勢調査 小地域集計(CSV)と境界データ(シェープファイル/GeoJSON)を KEY_CODE で結合し、
// 市区町村ごとの地域データ public/data/regions/{県}/{市区町村}.json と一覧 index.json を出力する。
//
// 使い方(PowerShell):
//   npm run data:build -- --city 06201            山形市だけ
//   npm run data:build -- --pref 06               山形県の全市区町村
//   npm run data:inspect -- --pref 06             生データの列見出しを表示(設定の調整用)
//   npm run data:dummy                            ダミーデータで一式を作る
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import mapshaper from 'mapshaper';

// ---------- 引数 ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const isDummy = flag('dummy');
const rawDir = opt('raw', isDummy ? 'data/raw-dummy' : 'data/raw');
const outDir = opt('out', 'public/data/regions');
const configPath = opt('config', isDummy ? 'scripts/preprocess.dummy.config.json' : 'scripts/preprocess.config.json');
const cityArg = opt('city');
const prefArg = opt('pref', cityArg ? cityArg.slice(0, 2) : '06');
const onlyCity = cityArg ?? (args.includes('--pref') ? null : '06201');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const fill = (s) => s.replaceAll('{pref}', prefArg);

const notes = []; // 実データに合わせて変えた点・注意点(出力ファイルに残す)

// ---------- 文字コード・CSV ----------
function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buf); // e-Stat の CSV は Shift_JIS
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// 全角数字・波ダッシュ・空白をそろえて比較しやすくする
const normalize = (s) =>
  s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[～〜~－-]/g, '~')
    .replace(/[\s　]/g, '');

// 秘匿「X」、該当なし「-」、「…」「*」などは null
function num(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || /^[-‐－X*…・]+$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function findFile(pattern) {
  const p = join(rawDir, fill(pattern));
  if (existsSync(p)) return p;
  // ファイル名の大文字小文字・余計な接尾辞の違いを吸収
  if (!existsSync(rawDir)) return null;
  const want = basename(fill(pattern)).toLowerCase().replace(extname(pattern), '');
  const hit = readdirSync(rawDir).find((f) => f.toLowerCase().startsWith(want));
  return hit ? join(rawDir, hit) : null;
}

function readTable(name, def) {
  const file = findFile(def.file);
  if (!file) {
    if (def.optional) {
      notes.push(`${name}: ファイル ${fill(def.file)} がないため使いませんでした`);
      return null;
    }
    throw new Error(`${rawDir}/${fill(def.file)} が見つかりません(README の「実データの入手」を参照)`);
  }
  const rows = parseCsv(decode(readFileSync(file)));
  const codes = rows[0];
  const labels = rows[1].map((l, i) => normalize(l || codes[i] || ''));
  const keyCol = codes.findIndex((c) => c.trim().toUpperCase() === 'KEY_CODE');
  const hideCol = codes.findIndex((c) => c.trim().toUpperCase() === 'HTKSYORI');
  if (keyCol < 0) throw new Error(`${file}: KEY_CODE 列がありません`);

  const colIndex = {};
  const find = (key, re) => {
    const rx = new RegExp(normalize(re));
    const i = labels.findIndex((l, idx) => idx > keyCol && rx.test(l));
    if (i < 0) {
      throw new Error(`${file}: 「${re}」に合う列が見つかりません。\n  見出し: ${labels.filter(Boolean).join(' / ')}\n  scripts/preprocess.config.json を実データに合わせてください`);
    }
    colIndex[key] = i;
  };
  for (const [k, re] of Object.entries(def.columns ?? {})) find(k, re);
  if (def.ageBands) {
    // 最後の区分は「75歳以上」「85歳以上」など。count で区分の数を指定(既定18 = 85歳以上まで)
    const count = def.ageBands.count ?? 18;
    for (let b = 0; b < count; b++) {
      const re = b === count - 1 ? def.ageBands.last : def.ageBands.template.replace('{from}', b * 5).replace('{to}', b * 5 + 4);
      find(`age${b}`, re);
    }
  }

  const map = new Map();
  for (const r of rows.slice(2)) {
    const key = (r[keyCol] ?? '').trim();
    if (!key) continue;
    const rec = { hidden: hideCol >= 0 && ['1', '2'].includes((r[hideCol] ?? '').trim()) };
    for (const [k, i] of Object.entries(colIndex)) rec[k] = num(r[i]);
    map.set(key, rec);
  }
  return { file, map, labels, get: (k) => lookup(map, k) };
}

// 境界の KEY_CODE は11桁。丁目のない町は統計表では9桁(末尾の「00」なし)なので読み替える
function lookup(map, key) {
  return map.get(key) ?? (key.length === 11 && key.endsWith('00') ? map.get(key.slice(0, 9)) : undefined);
}

// ---------- 境界 ----------
async function readBoundary(def, pref) {
  const file = findFile(def.file);
  if (!file) return null;
  const input = {};
  const ext = extname(file).toLowerCase();
  let inName;
  if (ext === '.shp') {
    const stem = file.slice(0, -4);
    for (const e of ['.shp', '.dbf', '.shx', '.prj', '.cpg']) {
      const f = [stem + e, stem + e.toUpperCase()].find(existsSync);
      if (f) input['in' + e] = readFileSync(f);
    }
    inName = 'in.shp';
  } else {
    input['in.json'] = readFileSync(file, 'utf8');
    inName = 'in.json';
  }
  const parts = [`-i ${inName}`];
  if (def.encoding && ext === '.shp') parts.push(`encoding=${def.encoding}`);
  if (def.filter) parts.push(`-filter "${def.filter}"`);
  const copy = [def.prefField, def.cityField, def.prefNameField, def.cityNameField, def.nameField].filter(Boolean);
  parts.push(`-dissolve ${def.keyField}${copy.length ? ` copy-fields=${copy.join(',')}` : ''}${def.areaField ? ` sum-fields=${def.areaField}` : ''}`);
  if (def.simplify) parts.push(`-simplify ${def.simplify} keep-shapes`);
  parts.push('-o out.json format=geojson precision=0.00001');
  const out = await mapshaper.applyCommands(parts.join(' '), input);
  const gj = JSON.parse(out['out.json']);
  console.log(`  境界 ${basename(file)}: ${gj.features.length} 区域 (${pref})`);
  return gj;
}

// ---------- ユーティリティ ----------
function bboxOf(features) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    } else c.forEach(walk);
  };
  features.forEach((f) => f.geometry && walk(f.geometry.coordinates));
  return [minX, minY, maxX, maxY].map((v) => +v.toFixed(5));
}

// ---------- 見出しの確認 ----------
if (flag('inspect')) {
  for (const [name, def] of Object.entries(config.tables)) {
    const file = findFile(def.file);
    if (!file) { console.log(`\n[${name}] ${fill(def.file)} なし`); continue; }
    const rows = parseCsv(decode(readFileSync(file)));
    console.log(`\n[${name}] ${file}`);
    rows[1].forEach((l, i) => l && console.log(`  ${rows[0][i]}  ${normalize(l)}`));
  }
  process.exit(0);
}

// ---------- 本処理 ----------
console.log(`前処理: raw=${rawDir} 県=${prefArg}${onlyCity ? ` 市区町村=${onlyCity}` : '(県内すべて)'}${isDummy ? ' [ダミー]' : ''}`);
const T = {};
for (const [name, def] of Object.entries(config.tables)) T[name] = readTable(name, def);
const laborRange = config.tables.labor ? config.tables.labor.ageRange ?? '15+' : 'none';
if (laborRange === 'none') {
  notes.push('小地域集計に男女別の就業者数がないため、女性の非就業率は計算していません(重みは他の指標に按分されます)');
} else if (laborRange !== '25-54') {
  notes.push(`女性の非就業率は小地域集計に年齢別の労働力状態がないため「女性${laborRange === '15+' ? '15歳以上' : laborRange}」で計算しています(仕様は25〜54歳)`);
}
if (config.tables.housingOwn) {
  notes.push('持ち家と住宅の建て方の掛け合わせ表がないため、持ち家一戸建て率は「持ち家率 × 一戸建て率」で近似しています');
}

const boundary = await readBoundary(config.boundary, prefArg);
if (!boundary) throw new Error(`${rawDir}/${fill(config.boundary.file)} が見つかりません`);
const b15 = config.boundary2015 ? await readBoundary(config.boundary2015, prefArg) : null;
const area2015 = new Map();
if (b15) for (const f of b15.features) area2015.set(String(f.properties[config.boundary2015.keyField]), f.properties[config.boundary2015.areaField]);
else notes.push('2015年の境界データがないため、KEY_CODE が2015年にない町丁目だけを人口増加率 null にしました');

const bd = config.boundary;
const byCity = new Map();
let insufficientCount = 0;
let growthNullCount = 0;

for (const f of boundary.features) {
  const p = f.properties;
  const key = String(p[bd.keyField]);
  const pref = String(p[bd.prefField] ?? key.slice(0, 2)).padStart(2, '0');
  const city = pref + String(p[bd.cityField] ?? key.slice(2, 5)).padStart(3, '0');
  if (pref !== prefArg) continue;
  if (onlyCity && city !== onlyCity) continue;

  const pop = T.population.get(key);
  const hh = T.households.get(key);
  const fam = T.family?.get(key) ?? hh; // 家族類型が別の表のとき
  const lab = T.labor?.get(key);
  const hou = T.housing.get(key);
  const own = T.housingOwn?.get(key); // 住宅の所有の関係が別の表のとき
  const p15 = T.population2015?.get(key);

  const households = hh?.households ?? null;
  const hidden = [pop, hh, fam, lab, hou, own].some((r) => r?.hidden);
  let od = hou?.ownedDetached ?? null;
  if (od == null && own && hou?.detached != null && own.owned != null && own.ownTotal > 0) {
    od = Math.round(hou.detached * (own.owned / own.ownTotal));
  }
  let insufficient = false;
  let reason;
  if (!pop || !hh) { insufficient = true; reason = '統計表に該当なし'; }
  else if (hidden || households == null) { insufficient = true; reason = '秘匿・数値なし'; }
  else if (households < (config.minHouseholds ?? 30)) { insufficient = true; reason = `世帯数${households}(30未満)`; }
  if (insufficient) insufficientCount++;

  let pop2015 = p15?.total ?? null;
  if (pop2015 != null && b15) {
    const a20 = Number(p[bd.areaField]);
    const a15 = Number(area2015.get(key));
    if (!a15 || !a20 || Math.abs(a20 - a15) / a20 > (config.boundary2015.areaTolerance ?? 0.02)) pop2015 = null;
  }
  if (pop2015 == null) growthNullCount++;

  const ages = [];
  for (let b = 0; b < 18; b++) ages.push(pop?.[`age${b}`] ?? null);

  const props = {
    key,
    name: String(p[bd.nameField] ?? key),
    hh: households,
    pop: pop?.total ?? null,
    pop15: pop2015,
    age: ages,
    gen: fam?.general ?? null,
    cc: fam?.coupleChild ?? null,
    fT: lab?.femaleTotal ?? null,
    fE: lab?.femaleEmployed ?? null,
    main: hou?.main ?? null,
    od,
  };
  if (insufficient) { props.ins = true; props.insR = reason; }

  if (!byCity.has(city)) {
    byCity.set(city, {
      code: city,
      name: String(p[bd.cityNameField] ?? city),
      prefCode: pref,
      prefName: String(p[bd.prefNameField] ?? ''),
      features: [],
    });
  }
  byCity.get(city).features.push({ type: 'Feature', properties: props, geometry: f.geometry });
}

if (!byCity.size) throw new Error('対象の市区町村が境界データにありません');

// ---------- 出力 ----------
const indexPath = join(outDir, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { regions: [] };
const generatedAt = new Date().toISOString();

for (const c of byCity.values()) {
  const bbox = bboxOf(c.features);
  const rel = `${c.prefCode}/${c.code}.json`;
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  const region = {
    format: 1,
    code: c.code,
    name: c.name,
    prefCode: c.prefCode,
    prefName: c.prefName,
    dataYear: config.dataYear,
    source: config.source,
    isDummy,
    femaleAgeRange: laborRange,
    notes,
    generatedAt,
    bbox,
    type: 'FeatureCollection',
    features: c.features,
  };
  writeFileSync(file, JSON.stringify(region));
  const size = statSync(file).size;
  const entry = {
    code: c.code, name: c.name, prefCode: c.prefCode, prefName: c.prefName, path: rel,
    dataYear: config.dataYear, size, areaCount: c.features.length, bbox,
    center: [+((bbox[1] + bbox[3]) / 2).toFixed(5), +((bbox[0] + bbox[2]) / 2).toFixed(5)],
    isDummy, generatedAt,
  };
  index.regions = index.regions.filter((r) => r.code !== c.code).concat(entry);
  console.log(`  → ${file}  ${c.name} 町丁目${c.features.length}件 ${(size / 1024).toFixed(0)}KB`);
}
index.regions.sort((a, b) => a.code.localeCompare(b.code));
index.generatedAt = generatedAt;
writeFileSync(indexPath, JSON.stringify(index, null, 2));

console.log(`\n完了: ${byCity.size} 市区町村 / データ不足 ${insufficientCount} 区域 / 人口増加率 null ${growthNullCount} 区域`);
if (notes.length) console.log('注意:\n' + notes.map((n) => '  - ' + n).join('\n'));
