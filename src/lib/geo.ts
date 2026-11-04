import type { AreaFeature, RegionFile } from '../types';

type Ring = number[][];

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, rings: Ring[]): boolean {
  if (!inRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(x, y, rings[i])) return false; // 穴
  return true;
}

export function featureContains(f: AreaFeature, lat: number, lng: number): boolean {
  const g = f.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return inPolygon(lng, lat, g.coordinates as Ring[]);
  return (g.coordinates as Ring[][]).some((p) => inPolygon(lng, lat, p));
}

export function bboxContains(b: [number, number, number, number], lat: number, lng: number, pad = 0): boolean {
  return lng >= b[0] - pad && lng <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad;
}

/** 位置がどの地域のどの町丁目にあるか */
export function locate(
  regions: RegionFile[],
  lat: number,
  lng: number,
): { region: RegionFile; feature: AreaFeature } | null {
  for (const region of regions) {
    if (!bboxContains(region.bbox, lat, lng)) continue;
    const feature = region.features.find((f) => featureContains(f, lat, lng));
    if (feature) return { region, feature };
  }
  return null;
}

/** 2点間の距離(メートル) */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 地域の範囲(bbox)までの距離。中にいれば 0 */
export function distanceToBbox(b: [number, number, number, number], lat: number, lng: number): number {
  const cLat = Math.min(Math.max(lat, b[1]), b[3]);
  const cLng = Math.min(Math.max(lng, b[0]), b[2]);
  return distanceM(lat, lng, cLat, cLng);
}

export function featureBounds(f: AreaFeature): [[number, number], [number, number]] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown): void => {
    const arr = c as number[] | unknown[];
    if (typeof arr[0] === 'number') {
      const [x, y] = arr as number[];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else (arr as unknown[]).forEach(walk);
  };
  walk(f.geometry.coordinates);
  return [[minY, minX], [maxY, maxX]];
}
