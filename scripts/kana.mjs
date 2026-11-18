// 町丁目名の読みがな辞書を作る(検索バーでひらがな入力から候補を出すため)
//
// 入力: data/raw/utf_ken_all.csv  … 日本郵便「郵便番号データ(UTF-8版)」
//        https://www.post.japanpost.jp/service/search/zipcode/download/utf-zip.html
//        public/data/regions/index.json と各市区町村の地域データ
// 出力: public/data/kana/{市区町村コード}.json  … { "町丁目名": "ひらがなの読み" }
//
// 使い方: node scripts/kana.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'data/raw/utf_ken_all.csv');
const REGIONS = path.join(ROOT, 'public/data/regions');
const OUT = path.join(ROOT, 'public/data/kana');

const kataToHira = (s) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
// 「ケ丘」「ヶ丘」「が丘」などの揺れをそろえたキー
// 旧字・異体字(籠/篭、檜/桧 など)もそろえる
const VARIANT = { 篭: '籠', 桧: '檜', 斎: '齋', 髙: '高', 﨑: '崎', 嵜: '崎', 邊: '辺', 邉: '辺', 澤: '沢', 曾: '曽', 嶋: '島', 舘: '館', 冨: '富', 塚: '塚', 條: '条', 國: '国', 學: '学', 瀨: '瀬', 槇: '槙', 渕: '淵', 埜: '野' };
const key = (s) =>
  s.normalize('NFKC').replace(/^(大字|字)/, '').replace(/[ヶヵケヵが]/g, 'ケ').replace(/[，,・s]/g, '').replace(/./g, (c) => VARIANT[c] ?? c);

const CHOME = ['', 'いっ', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はっ', 'きゅう'];
const KANJI_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function chomeReading(k) {
  // 一〜九十九(漢数字)
  let n = 0;
  const m = k.match(/^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/);
  if (!m) return null;
  if (m[2]) n = (m[1] ? KANJI_NUM[m[1]] : 1) * 10 + (m[3] ? KANJI_NUM[m[3]] : 0);
  else n = KANJI_NUM[m[1]] ?? 0;
  if (!n) return null;
  if (n < 10) return `${CHOME[n]}ちょうめ`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const t = `${tens > 1 ? CHOME[tens].replace('っ', 'ち').replace('はっ', 'はち') : ''}${ones ? 'じゅう' : 'じゅっ'}`;
  return `${t}${ones ? CHOME[ones] : ''}ちょうめ`;
}

// ---- 郵便番号データ: 市区町村コード → (町域名 → 読み) ----
const byCity = new Map();
for (const line of fs.readFileSync(CSV, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const c = line.split(',').map((x) => x.replace(/^"|"$/g, ''));
  const code = c[0];
  let town = c[8];
  let kana = c[5];
  if (!town || town.startsWith('以下に掲載がない') || town.includes('の次に番地がくる場合') || town.endsWith('一円')) continue;
  // 「本町(1丁目)」のようなかっこ書きは外す。かっこが閉じていない(複数行にまたがる)行は使わない
  if ((town.match(/（/g) ?? []).length !== (town.match(/）/g) ?? []).length) continue;
  town = town.replace(/（.*?）/g, '');
  kana = kana.replace(/\(.*?\)/g, '');
  if (!town || !kana) continue;
  if (!byCity.has(code)) byCity.set(code, new Map());
  const m = byCity.get(code);
  const k = key(town);
  if (!m.has(k)) m.set(k, kataToHira(kana));
}

fs.mkdirSync(OUT, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(REGIONS, 'index.json'), 'utf8'));
let total = 0;
let hit = 0;
for (const e of index.regions) {
  const region = JSON.parse(fs.readFileSync(path.join(REGIONS, e.path), 'utf8'));
  const dict = byCity.get(e.code) ?? new Map();
  const out = {};
  for (const f of region.features) {
    const name = f.properties.name;
    total++;
    const m = name.match(/^(.*?)([一二三四五六七八九十]+)丁目$/);
    const base = m ? m[1] : name;
    let yomi = dict.get(key(base));
    if (!yomi) {
      // 「大字山寺地蔵堂」のように郵便番号データには上の地名(山寺)しかないときは、そこまでの読みを付ける(前方一致で候補に出る)
      const kb = key(base);
      let best = '';
      for (const k of dict.keys()) if (k.length >= 2 && k.length > best.length && kb.startsWith(k)) best = k;
      if (!best) continue;
      out[name] = dict.get(best);
      hit++;
      continue;
    }
    const ch = m ? chomeReading(m[2]) : '';
    if (ch == null) continue;
    out[name] = yomi + ch;
    hit++;
  }
  fs.writeFileSync(path.join(OUT, `${e.code}.json`), JSON.stringify(out));
}
console.log(`読みが付いた町丁目: ${hit} / ${total}`);
