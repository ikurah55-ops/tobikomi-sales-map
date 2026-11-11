import type { Track, TrackPoint, Visit } from '../types';
import { APPOINTED, TALKED } from './records';
import { distanceM } from './geo';

/** これより間が空いたら線をつながない(画面を消していた間など) */
export const TRACK_GAP_MS = 5 * 60 * 1000;
/** 精度がこれより悪い位置は捨てる */
export const TRACK_MAX_ACCURACY = 50;

/** 新しい位置を足跡に足すか。足すなら前の点からの距離を返す */
export function acceptPoint(last: TrackPoint | undefined, p: TrackPoint): number | null {
  if (p[3] > TRACK_MAX_ACCURACY) return null;
  if (!last) return 0;
  const d = distanceM(last[0], last[1], p[0], p[1]);
  const dt = (p[2] - last[2]) / 1000;
  if (dt > 0 && d / dt > 40) return null; // 時速140km超はGPSの飛び
  // 立ち止まっている間のふらつきは足さない
  if (d < Math.max(8, Math.min(p[3], last[3]) * 0.6)) return null;
  return d;
}

/** 間が空いたところで区切った線 */
export function trackSegments(points: TrackPoint[]): [number, number][][] {
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  points.forEach((p, i) => {
    if (i > 0 && p[2] - points[i - 1][2] > TRACK_GAP_MS) {
      if (cur.length) segs.push(cur);
      cur = [];
    }
    cur.push([p[0], p[1]]);
  });
  if (cur.length) segs.push(cur);
  return segs;
}

export const trackEndMs = (t: Track) => (t.endedAt ? Date.parse(t.endedAt) : Date.now());

/** 記録していた時間帯の訪問記録 */
export function visitsInTrack(t: Track, visits: Visit[]): Visit[] {
  // 訪問日時は分単位で保存されるので、開始は分の頭に切り下げて比べる
  const s = Math.floor(Date.parse(t.startedAt) / 60000) * 60000;
  const e = trackEndMs(t);
  return visits.filter((v) => {
    const x = Date.parse(v.visitedAt);
    return x >= s && x <= e;
  });
}

export interface TrackStats {
  visits: number;
  home: number;
  talked: number;
  appointed: number;
  contract: number;
  pins: number;
}

export function trackStats(vs: Visit[]): TrackStats {
  const st: TrackStats = { visits: vs.length, home: 0, talked: 0, appointed: 0, contract: 0, pins: new Set(vs.map((v) => v.pinId)).size };
  for (const v of vs) {
    if (v.presence !== 'home') continue;
    st.home++;
    if (v.reaction && TALKED.includes(v.reaction)) st.talked++;
    if (v.reaction && APPOINTED.includes(v.reaction)) st.appointed++;
    if (v.reaction === 'contract') st.contract++;
  }
  return st;
}

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}`;
}

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

/** 一覧などに出す名前 */
export function trackName(t: Track): string {
  if (t.title) return t.title;
  const d = new Date(t.startedAt);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}からの足跡`;
}
