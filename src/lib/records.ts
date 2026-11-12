import type { Competitor, HousingType, Pin, PinFilter, PinStatus, Presence, Reaction, Visit, Weather } from '../types';

// ---------- 表示名 ----------
export const HOUSING_LABEL: Record<HousingType, string> = {
  house: '一戸建て', apartment: 'アパート', mansion: 'マンション', other: 'その他',
};
export const PRESENCE_LABEL: Record<Presence, string> = { home: '在宅', away: '不在', noanswer: '応答なし' };
export const REACTION_LABEL: Record<Reaction, string> = {
  listened: '話を聞いてくれた', material: '資料を渡した', appointment: 'アポ獲得', contract: '成約',
  rejected: '断られた', refusal: '訪問お断り',
};
export const COMPETITOR_LABEL: Record<Competitor, string> = { yes: 'すでに来ていた', no: '来ていない', unknown: '不明' };
export const WEATHER_LABEL: Record<Weather, string> = { sunny: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪' };
export const WEATHER_ICON: Record<Weather, string> = { sunny: '☀️', cloudy: '☁️', rain: '☔', snow: '❄️' };

export const STATUS_LABEL: Record<PinStatus, string> = {
  success: '成約・アポ', talked: '話せた・資料', notmet: '不在(未接触)', rejected: '断られた', blocked: '再訪禁止', none: '記録なし',
};
export const STATUS_COLOR: Record<PinStatus, string> = {
  success: '#1e9e4a', talked: '#2563eb', notmet: '#eab308', rejected: '#f97316', blocked: '#8b8f97', none: '#64748b',
};

/** 会話できた(話を聞いてくれた以上) */
export const TALKED: Reaction[] = ['listened', 'material', 'appointment', 'contract'];
export const APPOINTED: Reaction[] = ['appointment', 'contract'];

// ---------- ピンの状態 ----------

/**
 * ピンの色を決める状態。
 * 最新の訪問結果で決めるが、最新が「不在・応答なし」でも過去に会えていれば、最後に会えたときの結果を使う
 * (黄色は「まだ会えていない家」だけにするため)。
 */
export function pinStatus(pin: Pin, visits: Visit[]): PinStatus {
  if (pin.noRevisit) return 'blocked';
  if (!visits.length) return 'none';
  const met = [...visits].reverse().find((v) => v.presence === 'home');
  if (!met) return 'notmet';
  switch (met.reaction) {
    case 'contract':
    case 'appointment':
      return 'success';
    case 'rejected':
      return 'rejected';
    case 'refusal':
      return 'blocked';
    default:
      return 'talked';
  }
}

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isRevisitDue = (pin: Pin) => !!pin.revisitDate && !pin.noRevisit && pin.revisitDate <= todayStr();

/** 期間の開始日時 */
export function periodStart(period: PinFilter['period'] | 'week' | 'month' | '3months' | 'all'): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case 'today':
      return d.getTime();
    case 'week': {
      const day = (d.getDay() + 6) % 7; // 月曜始まり
      d.setDate(d.getDate() - day);
      return d.getTime();
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case '3months':
      return new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    default:
      return 0;
  }
}

export function pinMatchesFilter(pin: Pin, visits: Visit[], f: PinFilter): boolean {
  const st = pinStatus(pin, visits);
  if (f.statuses.length && !f.statuses.includes(st)) return false;
  const last = visits[visits.length - 1];
  if (f.presence !== 'all') {
    if (!last) return false;
    if (f.presence === 'home' ? last.presence !== 'home' : last.presence === 'home') return false;
  }
  if (f.competitor !== 'all') {
    if (!visits.some((v) => v.competitor === f.competitor)) return false;
  }
  if (f.period !== 'all') {
    if (!last || new Date(last.visitedAt).getTime() < periodStart(f.period)) return false;
  }
  if (f.revisitOnly && (!pin.revisitDate || pin.noRevisit)) return false;
  return true;
}

export const DEFAULT_FILTER: PinFilter = { statuses: [], presence: 'all', competitor: 'all', period: 'all', revisitOnly: false,
  showAreaRecords: true, recordPeriod: 'all',
};

export function isFilterActive(f: PinFilter): boolean {
  return f.statuses.length > 0 || f.presence !== 'all' || f.competitor !== 'all' || f.period !== 'all' || f.revisitOnly;
}

// ---------- 集計 ----------

export interface Rates {
  visits: number;
  home: number;
  talked: number;
  appointed: number;
  competitorKnown: number;
  competitorYes: number;
  homeRate: number | null;
  talkRate: number | null;
  apptRate: number | null;
  competitorRate: number | null;
}

export function rates(visits: Visit[]): Rates {
  let home = 0, talked = 0, appointed = 0, cKnown = 0, cYes = 0;
  for (const v of visits) {
    if (v.presence === 'home') {
      home++;
      if (v.reaction && TALKED.includes(v.reaction)) talked++;
      if (v.reaction && APPOINTED.includes(v.reaction)) appointed++;
    }
    if (v.competitor === 'yes' || v.competitor === 'no') {
      cKnown++;
      if (v.competitor === 'yes') cYes++;
    }
  }
  const r = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    visits: visits.length, home, talked, appointed, competitorKnown: cKnown, competitorYes: cYes,
    homeRate: r(home, visits.length), talkRate: r(talked, home), apptRate: r(appointed, home), competitorRate: r(cYes, cKnown),
  };
}

export const pct = (v: number | null, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const weekdayLabel = (d: number) => WD[d];

/** 「前回不在だった時間帯」のヒント */
export function visitHint(visits: Visit[]): { away: string[]; home: string[]; suggestion: string | null } {
  const slot = (v: Visit) => {
    const d = new Date(v.visitedAt);
    return { wd: d.getDay(), h: d.getHours(), text: `${WD[d.getDay()]}曜${d.getHours()}時台` };
  };
  const awaySlots = visits.filter((v) => v.presence !== 'home').map(slot);
  const homeSlots = visits.filter((v) => v.presence === 'home').map(slot);
  const uniq = (a: { text: string }[]) => [...new Set(a.map((s) => s.text))];
  let suggestion: string | null = null;
  if (awaySlots.length && !homeSlots.length) {
    const hours = awaySlots.map((s) => s.h);
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    suggestion = avg < 13 ? '午前は不在が多いので、夕方(16時以降)や土曜を試してみましょう' : '午後は不在が多いので、午前中や土曜を試してみましょう';
  }
  return { away: uniq(awaySlots), home: uniq(homeSlots), suggestion };
}
