// 山形市・天童市の町丁目に似せたダミーの「e-Stat形式」生データを data/raw-dummy/ に作る。
// 本物の国勢調査データではない。前処理スクリプト(preprocess.mjs)を実データと同じ流れで試すためのもの。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'data/raw-dummy';
mkdirSync(OUT, { recursive: true });

// 再現性のある乱数
let seed = 20201001;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (a, b) => a + (b - a) * rand();
const round = (n) => Math.max(0, Math.round(n));

const CITIES = [
  {
    pref: '06', city: '201', prefName: '山形県', cityName: '山形市',
    center: [38.2486, 140.3279], cols: 7, rows: 7,
    names: [
      '香澄町一丁目', '香澄町二丁目', '香澄町三丁目', '七日町一丁目', '七日町二丁目', '本町一丁目', '本町二丁目',
      '十日町一丁目', '十日町二丁目', '旅篭町一丁目', '旅篭町二丁目', '宮町一丁目', '宮町二丁目', '宮町三丁目',
      '小白川町一丁目', '小白川町二丁目', '小白川町三丁目', '緑町一丁目', '緑町二丁目', '桜町', '城西町一丁目',
      '城西町二丁目', '城南町一丁目', '城南町二丁目', '若宮一丁目', '若宮二丁目', '嶋北一丁目', '嶋北二丁目',
      '北町一丁目', '北町二丁目', '馬見ケ崎一丁目', '馬見ケ崎二丁目', '南栄町一丁目', '南栄町二丁目', '鈴川町一丁目',
      '鈴川町二丁目', '東原町一丁目', '東原町二丁目', '大野目一丁目', '大野目二丁目', '清住町一丁目', '清住町二丁目',
      '松見町', '飯田西一丁目', '飯田西二丁目', '江俣一丁目', '江俣二丁目', '落合町', '花楯一丁目',
    ],
  },
  {
    pref: '06', city: '210', prefName: '山形県', cityName: '天童市',
    center: [38.3611, 140.3779], cols: 6, rows: 6,
    names: [
      '老野森一丁目', '老野森二丁目', '北目一丁目', '北目二丁目', '田鶴町一丁目', '田鶴町二丁目',
      '久野本一丁目', '久野本二丁目', '南町', '東本町一丁目', '東本町二丁目', '鎌田本町一丁目',
      '鎌田本町二丁目', '糠塚一丁目', '糠塚二丁目', '芳賀', '交り江', '小路', '北久野本一丁目',
      '北久野本二丁目', '清池東一丁目', '清池東二丁目', '乱川一丁目', '乱川二丁目', '原町', '蔵増',
      '大町', '一日町', '三日町一丁目', '三日町二丁目', '五日町', '本町', '中里一丁目', '中里二丁目',
      '矢野目', '石鳥居',
    ],
  },
];

const LAT_STEP = 0.0068;
const LNG_STEP = 0.0088;
const AGE_BANDS = 18; // 0-4 … 85+

const features = [];
const features2015 = [];
const rows = { pop: [], pop15: [], hh: [], housing: [] };

for (const c of CITIES) {
  // 格子点を少しずらして町丁目らしい不揃いな区画にする
  const pts = [];
  for (let r = 0; r <= c.rows; r++) {
    pts.push([]);
    for (let q = 0; q <= c.cols; q++) {
      const edge = r === 0 || q === 0 || r === c.rows || q === c.cols;
      const j = edge ? 0.15 : 0.32;
      const lat = c.center[0] + (r - c.rows / 2) * LAT_STEP + between(-j, j) * LAT_STEP;
      const lng = c.center[1] + (q - c.cols / 2) * LNG_STEP + between(-j, j) * LNG_STEP;
      pts[r].push([+lng.toFixed(6), +lat.toFixed(6)]);
    }
  }
  let idx = 0;
  for (let r = 0; r < c.rows; r++) {
    for (let q = 0; q < c.cols; q++) {
      const name = c.names[idx];
      idx++;
      const sArea = String(idx * 10).padStart(4, '0') + '00';
      const key = c.pref + c.city + sArea;
      const ring = [pts[r][q], pts[r][q + 1], pts[r + 1][q + 1], pts[r + 1][q], pts[r][q]];
      const area = Math.round(between(380000, 720000));
      const props = {
        KEY_CODE: key, PREF: c.pref, CITY: c.city, S_AREA: sArea,
        PREF_NAME: c.prefName, CITY_NAME: c.cityName, S_NAME: name, HCODE: 8101, AREA: area,
      };
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });

      // 中心部ほど高齢・単身・集合住宅、郊外ほど子育て世帯・持ち家一戸建てが多い
      const dist = Math.hypot(r - c.rows / 2 + 0.5, q - c.cols / 2 + 0.5) / (c.rows / 2);
      const suburb = Math.min(1, dist) * between(0.6, 1.25);
      let hh = round(between(120, 900) * (c.city === '201' ? 1 : 0.7));
      if (rand() < 0.06) hh = round(between(5, 28)); // 世帯数30未満(データ不足)
      const perHH = 1.7 + suburb * 1.1;
      const pop = round(hh * perHH);
      const youngBoost = suburb * between(0.7, 1.4);
      const weights = [];
      for (let b = 0; b < AGE_BANDS; b++) {
        const age = b * 5 + 2;
        let w = 1;
        if (age < 15) w = 0.6 + youngBoost * 0.9;
        else if (age < 25) w = 0.8;
        else if (age < 45) w = 0.7 + youngBoost * 0.8;
        else if (age < 65) w = 1.1;
        else w = 1.5 - suburb * 0.7;
        weights.push(Math.max(0.1, w * between(0.8, 1.2)));
      }
      const wsum = weights.reduce((a, b) => a + b, 0);
      const ages = weights.map((w) => round((pop * w) / wsum));
      const total = ages.reduce((a, b) => a + b, 0);
      const secret = rand() < 0.03; // 秘匿(X)
      const v = (n) => (secret ? 'X' : String(n));

      rows.pop.push([key, '3', c.cityName, name, secret ? '1' : '', '', '', v(total), ...ages.map(v)]);

      const changed = rand() < 0.08; // 2015→2020で境界変更
      const pop15 = round(total / (1 + between(-0.08, 0.1) + (suburb - 0.6) * 0.06));
      if (rand() > 0.03) {
        rows.pop15.push([key, '3', c.cityName, name, '', '', '', String(pop15)]);
        features2015.push({
          type: 'Feature',
          properties: { ...props, AREA: changed ? Math.round(area * between(0.6, 0.85)) : area },
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      }

      const general = Math.max(hh - round(between(0, 5)), 0);
      const coupleChild = round(general * Math.min(0.55, 0.12 + suburb * between(0.18, 0.32)));
      const kids18 = Math.min(general, round(coupleChild * between(0.75, 0.95) + general * between(0.02, 0.06)));
      rows.hh.push([key, '3', c.cityName, name, secret ? '1' : '', '', '', v(hh), v(general), v(coupleChild), v(kids18)]);


      const main = Math.max(general - round(between(0, 3)), 0);
      const owned = round(main * Math.min(0.92, 0.18 + suburb * between(0.4, 0.62)));
      rows.housing.push([key, '3', c.cityName, name, secret ? '1' : '', '', '', v(main), v(owned)]);
    }
  }
}

const head = ['KEY_CODE', 'HYOSYO', 'CITYNAME', 'NAME', 'HTKSYORI', 'HTKSAKI', 'GASSAN'];
const blank = head.map(() => '');
function writeTable(file, codePrefix, labels, data) {
  const codes = labels.map((_, i) => codePrefix + String(i + 1).padStart(3, '0'));
  const lines = [[...head, ...codes], [...blank, ...labels], ...data].map((r) => r.join(','));
  writeFileSync(join(OUT, file), lines.join('\r\n') + '\r\n', 'utf8');
}

const ageLabels = [];
for (let b = 0; b < AGE_BANDS; b++) {
  ageLabels.push(b === AGE_BANDS - 1 ? '総数85歳以上' : `総数${b * 5}～${b * 5 + 4}歳`);
}
writeTable('population2020-06.txt', 'T001082', ['総数、年齢「不詳」含む', ...ageLabels], rows.pop);
writeTable('population2015-06.txt', 'T000849', ['人口総数'], rows.pop15);
writeTable('households-06.txt', 'T001086', ['世帯総数', '一般世帯総数', '夫婦と子供から成る世帯', '18歳未満世帯員のいる一般世帯総数'], rows.hh);
writeTable('housing-06.txt', 'T001100', ['主世帯総数', '持ち家一戸建'], rows.housing);

writeFileSync(join(OUT, 'boundary-06.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
writeFileSync(join(OUT, 'boundary2015-06.geojson'), JSON.stringify({ type: 'FeatureCollection', features: features2015 }));

console.log(`ダミー生データを ${OUT}/ に作成しました(町丁目 ${features.length} 件)`);
