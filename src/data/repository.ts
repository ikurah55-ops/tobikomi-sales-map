// データの読み書きはすべてここを通す(将来 Supabase に移すときはこのファイルだけ差し替える)
import Dexie, { type Table } from 'dexie';
import type { FacilityMark, Pin, Settings, StoredFacilities, StoredRegion, Track, Visit } from '../types';

class SalesDB extends Dexie {
  pins!: Table<Pin, string>;
  visits!: Table<Visit, string>;
  regions!: Table<StoredRegion, string>;
  facilities!: Table<StoredFacilities, string>;
  facilityMarks!: Table<FacilityMark, string>;
  tracks!: Table<Track, string>;

  constructor() {
    super('tobikomi-sales-map');
    this.version(1).stores({
      pins: 'id, regionCode, areaKey, updatedAt',
      visits: 'id, pinId, visitedAt',
      regions: 'code',
    });
    this.version(2).stores({
      facilities: 'code',
      facilityMarks: 'id',
    });
    this.version(3).stores({
      tracks: 'id, startedAt',
    });
  }
}

const db = new SalesDB();

// ---------- 変更通知 ----------
type Listener = () => void;
const listeners = new Set<Listener>();
export function onRecordsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------- ピン・訪問記録 ----------
export async function listPins(): Promise<Pin[]> {
  return db.pins.toArray();
}

export async function listVisits(): Promise<Visit[]> {
  return db.visits.orderBy('visitedAt').toArray();
}

export async function savePin(pin: Pin): Promise<void> {
  await db.pins.put({ ...pin, updatedAt: new Date().toISOString() });
  notify();
}

/** 新しいピンと最初の訪問記録を1回で保存する */
export async function savePinWithVisit(pin: Pin, visit: Visit): Promise<void> {
  await db.transaction('rw', db.pins, db.visits, async () => {
    await db.pins.put(pin);
    await db.visits.put(visit);
  });
  notify();
}

export async function saveVisit(visit: Visit, pinPatch?: Partial<Pin>): Promise<void> {
  await db.transaction('rw', db.pins, db.visits, async () => {
    await db.visits.put(visit);
    const pin = await db.pins.get(visit.pinId);
    if (pin) await db.pins.put({ ...pin, ...pinPatch, updatedAt: new Date().toISOString() });
  });
  notify();
}

export async function deleteVisit(id: string): Promise<void> {
  await db.visits.delete(id);
  notify();
}

export async function deletePin(id: string): Promise<void> {
  await db.transaction('rw', db.pins, db.visits, async () => {
    await db.visits.where('pinId').equals(id).delete();
    await db.pins.delete(id);
  });
  notify();
}

/** バックアップからの復元。同じIDの記録は上書き、それ以外は追加 */
export async function upsertRecords(pins: Pin[], visits: Visit[]): Promise<void> {
  await db.transaction('rw', db.pins, db.visits, async () => {
    await db.pins.bulkPut(pins);
    await db.visits.bulkPut(visits);
  });
  notify();
}

/** 町丁目の判定をやり直した結果をまとめて保存 */
export async function updatePinAreas(patches: Pick<Pin, 'id' | 'regionCode' | 'areaKey' | 'areaName'>[]): Promise<void> {
  if (!patches.length) return;
  await db.transaction('rw', db.pins, async () => {
    for (const p of patches) await db.pins.update(p.id, { regionCode: p.regionCode, areaKey: p.areaKey, areaName: p.areaName });
  });
  notify();
}

// ---------- 地域データ ----------
export async function listRegions(): Promise<StoredRegion[]> {
  return db.regions.toArray();
}

export async function saveRegion(region: StoredRegion): Promise<void> {
  await db.regions.put(region);
}

export async function deleteRegion(code: string): Promise<void> {
  await db.regions.delete(code);
}

// ---------- 駐車場のある店 ----------
export async function listFacilitySets(): Promise<StoredFacilities[]> {
  return db.facilities.toArray();
}

export async function saveFacilitySet(set: StoredFacilities): Promise<void> {
  await db.facilities.put(set);
}

export async function deleteFacilitySet(code: string): Promise<void> {
  await db.facilities.delete(code);
}

export async function listFacilityMarks(): Promise<FacilityMark[]> {
  return db.facilityMarks.toArray();
}

/** status が null なら登録を外す(元の表示に戻す) */
export async function setFacilityMark(mark: Omit<FacilityMark, 'status' | 'updatedAt'>, status: FacilityMark['status'] | null): Promise<void> {
  if (status) await db.facilityMarks.put({ ...mark, status, updatedAt: new Date().toISOString() });
  else await db.facilityMarks.delete(mark.id);
  notify();
}

/** 店のデータにない場所を「使える駐車場」として追加する */
export async function addCustomParking(p: { name: string; memo: string; lat: number; lng: number }): Promise<void> {
  await setFacilityMark({ id: `u-${newId()}`, name: p.name, memo: p.memo || undefined, lat: p.lat, lng: p.lng, custom: true }, 'ok');
}

export async function clearHiddenFacilities(): Promise<number> {
  const n = await db.facilityMarks.filter((m) => m.status === 'hidden').delete();
  notify();
  return n;
}

export async function upsertFacilityMarks(marks: FacilityMark[]): Promise<void> {
  await db.facilityMarks.bulkPut(marks);
  notify();
}

// ---------- 足跡 ----------
export async function listTracks(): Promise<Track[]> {
  return db.tracks.orderBy('startedAt').reverse().toArray();
}

/** 記録中(終了していない)の足跡。アプリを開き直したときに続きから記録する */
export async function getActiveTrack(): Promise<Track | null> {
  const all = await db.tracks.filter((t) => t.endedAt == null).toArray();
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
}

/** 記録中の点の追加など。頻繁に呼ぶので一覧の再読み込みは知らせない */
export async function putTrackQuiet(t: Track): Promise<void> {
  await db.tracks.put(t);
}

export async function saveTrack(t: Track): Promise<void> {
  await db.tracks.put({ ...t, updatedAt: new Date().toISOString() });
  notify();
}

export async function deleteTrack(id: string): Promise<void> {
  await db.tracks.delete(id);
  notify();
}

export async function upsertTracks(tracks: Track[]): Promise<void> {
  await db.tracks.bulkPut(tracks);
  notify();
}

// ---------- 設定(端末に保存) ----------
const SETTINGS_KEY = 'tobikomi-settings-v1';

export function loadSettings(): Partial<Settings> | null {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    return s ? (JSON.parse(s) as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境(プライベートモード等)でも動作は続ける
  }
}

/** 端末のストレージを消されにくくする(対応ブラウザのみ) */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // 無視
  }
}
