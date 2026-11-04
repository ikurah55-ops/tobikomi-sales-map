import { DATA_BASE_URL } from '../config';
import { bboxContains, locate } from '../lib/geo';
import type { Pin, RegionFile, RegionIndexEntry, StoredRegion } from '../types';
import { listPins, saveRegion, updatePinAreas } from './repository';

export interface RegionIndex {
  generatedAt?: string;
  regions: RegionIndexEntry[];
}

export async function fetchRegionIndex(): Promise<RegionIndex> {
  const res = await fetch(`${DATA_BASE_URL}index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`地域一覧を取得できませんでした(${res.status})`);
  return res.json();
}

export async function downloadRegion(entry: RegionIndexEntry): Promise<StoredRegion> {
  const res = await fetch(`${DATA_BASE_URL}${entry.path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${entry.name}のデータを取得できませんでした(${res.status})`);
  const text = await res.text();
  const data = JSON.parse(text) as RegionFile;
  const stored: StoredRegion = {
    code: data.code,
    name: data.name,
    prefCode: data.prefCode,
    prefName: data.prefName,
    dataYear: data.dataYear,
    size: entry.size || text.length,
    bbox: data.bbox,
    center: entry.center ?? [(data.bbox[1] + data.bbox[3]) / 2, (data.bbox[0] + data.bbox[2]) / 2],
    isDummy: data.isDummy,
    generatedAt: data.generatedAt,
    downloadedAt: new Date().toISOString(),
    data,
  };
  await saveRegion(stored);
  await reassignPins(data);
  return stored;
}

/** 地域データを読み込んだら、その範囲にあるピンの町丁目を判定し直す */
export async function reassignPins(region: RegionFile): Promise<number> {
  const pins = await listPins();
  const patches: Pick<Pin, 'id' | 'regionCode' | 'areaKey' | 'areaName'>[] = [];
  for (const p of pins) {
    if (!bboxContains(region.bbox, p.lat, p.lng, 0.001)) continue;
    const hit = locate([region], p.lat, p.lng);
    const next = hit
      ? { regionCode: region.code, areaKey: hit.feature.properties.key, areaName: hit.feature.properties.name }
      : { regionCode: p.regionCode, areaKey: p.areaKey, areaName: p.areaName };
    if (next.areaKey !== p.areaKey || next.regionCode !== p.regionCode) patches.push({ id: p.id, ...next });
  }
  await updatePinAreas(patches);
  return patches.length;
}

/** index.json の方が新しいデータなら「更新あり」 */
export function hasUpdate(local: StoredRegion, remote: RegionIndexEntry | undefined): boolean {
  if (!remote) return false;
  if (remote.dataYear > local.dataYear) return true;
  return !!remote.generatedAt && !!local.generatedAt && remote.generatedAt > local.generatedAt && remote.isDummy !== local.isDummy;
}

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
