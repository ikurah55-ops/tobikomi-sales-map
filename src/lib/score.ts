import type { AreaFeature, IndicatorKey, Settings, Weights } from '../types';

export const INDICATOR_KEYS: IndicatorKey[] = ['family', 'age', 'kids', 'ownedDetached', 'growth'];

export const INDICATOR_LABEL: Record<IndicatorKey, string> = {
  family: '夫婦と子どもの世帯の割合',
  age: '狙う年齢層の人口割合',
  kids: '18歳未満の子がいる世帯の割合',
  ownedDetached: '持ち家一戸建て率',
  growth: '人口増加率',
};

/** 理由の文に使う短い名前 */
const REASON_LABEL: Record<IndicatorKey, string> = {
  family: '夫婦と子の世帯の割合',
  age: '狙う年齢層の割合',
  kids: '子どもがいる世帯の割合',
  ownedDetached: '持ち家一戸建て率',
  growth: '人口増加率',
};

export const DEFAULT_WEIGHTS: Weights = { family: 30, age: 20, kids: 20, ownedDetached: 15, growth: 15 };

export interface Preset {
  id: string;
  label: string;
  ageFrom: number;
  ageTo: number;
  weights: Weights;
}

export const PRESETS: Preset[] = [
  { id: 'standard', label: '標準', ageFrom: 6, ageTo: 8, weights: DEFAULT_WEIGHTS },
  { id: 'child', label: '子育て世代', ageFrom: 6, ageTo: 8, weights: { family: 40, age: 20, kids: 20, ownedDetached: 10, growth: 10 } },
  { id: 'young', label: '新婚・若年層', ageFrom: 5, ageTo: 6, weights: { family: 20, age: 30, kids: 15, ownedDetached: 10, growth: 25 } },
  { id: 'review', label: '見直し世代', ageFrom: 9, ageTo: 11, weights: { family: 20, age: 25, kids: 10, ownedDetached: 35, growth: 10 } },
];

/** 5歳階級のインデックス → 「30〜34歳」 */
export const bandLabel = (i: number) => (i >= 17 ? '85歳以上' : `${i * 5}〜${i * 5 + 4}歳`);
export const ageRangeLabel = (from: number, to: number) => `${from * 5}〜${to * 5 + 4}歳`;

/** 1つの重みを変えたら、残りを元の比率のまま合計100になるよう調整する */
export function adjustWeights(w: Weights, key: IndicatorKey, value: number): Weights {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = INDICATOR_KEYS.filter((k) => k !== key);
  const rest = 100 - v;
  const sumOthers = others.reduce((s, k) => s + w[k], 0);
  const raw = others.map((k) => (sumOthers > 0 ? (w[k] / sumOthers) * rest : rest / others.length));
  const floors = raw.map(Math.floor);
  let remain = rest - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (remain <= 0) break;
    floors[i]++;
    remain--;
  }
  const next = { ...w, [key]: v };
  others.forEach((k, i) => (next[k] = floors[i]));
  return next;
}

// ---------- 指標の計算 ----------

type Fraction = { num: number; den: number } | null;

function fractions(p: AreaFeature['properties'], ageFrom: number, ageTo: number): Record<IndicatorKey, Fraction> {
  const frac = (n: number | null, d: number | null): Fraction => (n != null && d != null && d > 0 ? { num: n, den: d } : null);
  let ageSum: number | null = 0;
  for (let b = ageFrom; b <= ageTo; b++) {
    const v = p.age[b];
    if (v == null) { ageSum = null; break; }
    ageSum += v;
  }
  return {
    family: frac(p.cc, p.gen),
    age: frac(ageSum, p.pop),
    kids: frac(p.k18, p.gen),
    ownedDetached: frac(p.od, p.main),
    // 増加率は「2020年 − 2015年」/ 2015年
    growth: p.pop != null && p.pop15 != null && p.pop15 > 0 ? { num: p.pop - p.pop15, den: p.pop15 } : null,
  };
}

export interface AreaScore {
  key: string;
  name: string;
  regionCode: string;
  values: Record<IndicatorKey, number | null>;
  pct: Record<IndicatorKey, number | null>;
  score: number | null;
  rank: number | null;
  rankTotal: number;
  cls: number | null; // 0(下位)〜4(上位20%)
  reason: string;
  insufficient: boolean;
  insufficientReason?: string;
  feature: AreaFeature;
}

export interface ScoreGroup {
  averages: Record<IndicatorKey, number | null>;
  ranked: AreaScore[];
  insufficient: AreaScore[];
  /** 5段階の境目のスコア(下限)。classBreaks[4] 以上が上位20% */
  classBreaks: number[];
}

export interface ScoreInput {
  regionCode: string;
  features: AreaFeature[];
}

function emptyRecord<T>(v: T): Record<IndicatorKey, T> {
  return { family: v, age: v, kids: v, ownedDetached: v, growth: v };
}

/** パーセンタイル(0〜100)。同じ値は平均順位 */
function percentileFn(values: number[]): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    if (n <= 1) return 50;
    let lo = 0;
    while (lo < n && sorted[lo] < v) lo++;
    let hi = lo;
    while (hi < n && sorted[hi] === v) hi++;
    const avgRank = (lo + hi - 1) / 2;
    return (avgRank / (n - 1)) * 100;
  };
}

export function formatIndicator(key: IndicatorKey, v: number | null): string {
  if (v == null) return '—';
  if (key === 'growth') return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  return `${(v * 100).toFixed(1)}%`;
}

/** 1つの比較範囲(市区町村 or 読み込み済み全地域)でスコアを計算する */
export function scoreGroup(inputs: ScoreInput[], s: Pick<Settings, 'ageFrom' | 'ageTo' | 'weights'>, avgLabel: string): ScoreGroup {
  const rows: AreaScore[] = [];
  const sums = Object.fromEntries(INDICATOR_KEYS.map((k) => [k, { num: 0, den: 0 }])) as Record<IndicatorKey, { num: number; den: number }>;

  for (const input of inputs) {
    for (const f of input.features) {
      const p = f.properties;
      const fr = fractions(p, s.ageFrom, s.ageTo);
      const values = emptyRecord<number | null>(null);
      for (const k of INDICATOR_KEYS) {
        const x = fr[k];
        values[k] = x ? x.num / x.den : null;
        if (x && !p.ins) {
          sums[k].num += x.num;
          sums[k].den += x.den;
        }
      }
      rows.push({
        key: p.key, name: p.name, regionCode: input.regionCode, values,
        pct: emptyRecord<number | null>(null), score: null, rank: null, rankTotal: 0, cls: null,
        reason: '', insufficient: !!p.ins, insufficientReason: p.insR, feature: f,
      });
    }
  }

  const averages = emptyRecord<number | null>(null);
  for (const k of INDICATOR_KEYS) averages[k] = sums[k].den > 0 ? sums[k].num / sums[k].den : null;

  const scored = rows.filter((r) => !r.insufficient);
  for (const k of INDICATOR_KEYS) {
    const vals = scored.map((r) => r.values[k]).filter((v): v is number => v != null);
    const pf = percentileFn(vals);
    for (const r of scored) r.pct[k] = r.values[k] == null ? null : pf(r.values[k]!);
  }

  for (const r of scored) {
    // null の指標の重みは残りの指標に按分し直す
    let wSum = 0;
    let total = 0;
    for (const k of INDICATOR_KEYS) {
      if (r.pct[k] == null) continue;
      wSum += s.weights[k];
      total += s.weights[k] * r.pct[k]!;
    }
    r.score = wSum > 0 ? total / wSum : null;
    r.reason = buildReason(r, averages, s.weights, avgLabel);
  }

  const ranked = scored.filter((r) => r.score != null).sort((a, b) => b.score! - a.score!);
  const n = ranked.length;
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.rankTotal = n;
    r.cls = n > 0 ? 4 - Math.min(4, Math.floor((i / n) * 5)) : null;
  });
  const classBreaks = [0, 1, 2, 3, 4].map((c) => {
    const members = ranked.filter((r) => r.cls === c);
    return members.length ? Math.min(...members.map((r) => r.score!)) : 0;
  });

  return { averages, ranked, insufficient: rows.filter((r) => r.insufficient || r.score == null), classBreaks };
}

function buildReason(r: AreaScore, avg: Record<IndicatorKey, number | null>, w: Weights, avgLabel: string): string {
  // 周りより特に高い指標を「主な理由」にする(重みが大きい指標を少し優先)
  let best: IndicatorKey | null = null;
  let bestVal = -1;
  for (const k of INDICATOR_KEYS) {
    if (r.pct[k] == null || w[k] === 0) continue;
    const v = r.pct[k]! + w[k] * 0.2;
    if (v > bestVal) { bestVal = v; best = k; }
  }
  if (!best) return '';
  const v = r.values[best]!;
  const a = avg[best];
  if (best === 'growth' || a == null || a <= 0) {
    return `${REASON_LABEL[best]} ${formatIndicator(best, v)}(${avgLabel}平均 ${formatIndicator(best, a)})`;
  }
  const ratio = v / a;
  if (ratio >= 1.05) return `${REASON_LABEL[best]}が${avgLabel}平均の${ratio.toFixed(1)}倍`;
  return `${REASON_LABEL[best]}が${avgLabel}で上位${Math.max(1, Math.round(100 - r.pct[best]!))}%`;
}

export const CLASS_COLORS = ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'];
export const CLASS_LABELS = ['下位20%', '上位60〜80%', '上位40〜60%', '上位20〜40%', '上位20%'];
