// データの読み書きはすべてここを通す(将来 Supabase に移すときはこのファイルだけ差し替える)
import Dexie, { type Table } from 'dexie';
import type { Pin, Settings, StoredRegion, Visit } from '../types';

class SalesDB extends Dexie {
  pins!: Table<Pin, string>;
  visits!: Table<Visit, string>;
  regions!: Table<StoredRegion, string>;

  constructor() {
    super('tobikomi-sales-map');
    this.version(1).stores({
      pins: 'id, regionCode, areaKey, updatedAt',
      visits: 'id, pinId, visitedAt',
      regions: 'code',
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
