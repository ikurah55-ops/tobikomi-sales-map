import { FACILITY_BASE_URL } from '../config';
import type { FacilityCat, FacilityFile, FacilityIndexEntry, StoredFacilities } from '../types';
import { saveFacilitySet } from './repository';

export const FACILITY_CATS: FacilityCat[] = ['super', 'conv', 'home', 'mall', 'drug', 'books'];

export const FACILITY_LABEL: Record<FacilityCat, string> = {
  conv: 'コンビニ',
  super: 'スーパー',
  books: '本屋',
  drug: 'ドラッグストア',
  home: 'ホームセンター',
  mall: 'モール・大型店',
  own: '自分で登録した駐車場',
};

/** 地図アイコンの1文字 */
export const FACILITY_SHORT: Record<FacilityCat, string> = {
  conv: 'コ',
  super: 'ス',
  books: '本',
  drug: '薬',
  home: 'ホ',
  mall: 'モ',
  own: '★',
};

/** 「○台以上」の選択肢 */
export const SPACE_STEPS = [10, 20, 30, 50, 100];

export interface FacilityIndex {
  generatedAt?: string;
  regions: FacilityIndexEntry[];
}

export async function fetchFacilityIndex(): Promise<FacilityIndex> {
  const res = await fetch(`${FACILITY_BASE_URL}index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`店の一覧を取得できませんでした(${res.status})`);
  return res.json();
}

export async function downloadFacilities(entry: FacilityIndexEntry): Promise<StoredFacilities> {
  const res = await fetch(`${FACILITY_BASE_URL}${entry.path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${entry.name}の店データを取得できませんでした(${res.status})`);
  const data = (await res.json()) as FacilityFile;
  const stored: StoredFacilities = { ...entry, count: data.facilities.length, generatedAt: data.generatedAt, downloadedAt: new Date().toISOString(), data };
  await saveFacilitySet(stored);
  return stored;
}
