import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

// ---------- 地域データ(前処理済みファイルの形) ----------

/** 町丁目1件分の統計値。null は秘匿・該当なし・比較不可 */
export interface AreaProps {
  key: string; // KEY_CODE
  name: string;
  hh: number | null; // 世帯総数
  pop: number | null; // 2020年 総人口
  pop15: number | null; // 2015年 総人口(境界変更時は null)
  age: (number | null)[]; // 5歳階級 18区分(0〜4歳 … 85歳以上)
  gen: number | null; // 一般世帯数
  cc: number | null; // 夫婦と子どもから成る世帯
  k18: number | null; // 18歳未満世帯員のいる一般世帯
  main: number | null; // 主世帯数
  od: number | null; // 持ち家の一戸建て
  ins?: boolean; // データ不足
  insR?: string;
}

export type AreaFeature = Feature<Polygon | MultiPolygon, AreaProps>;

export interface RegionMeta {
  code: string; // 市区町村コード 5桁
  name: string;
  prefCode: string;
  prefName: string;
  dataYear: number;
  size: number; // バイト
  bbox: [number, number, number, number]; // [西, 南, 東, 北]
  center: [number, number]; // [緯度, 経度]
  isDummy?: boolean;
  generatedAt?: string;
}

export interface RegionIndexEntry extends RegionMeta {
  path: string;
  areaCount: number;
}

export interface RegionFile extends FeatureCollection<Polygon | MultiPolygon, AreaProps> {
  format: number;
  code: string;
  name: string;
  prefCode: string;
  prefName: string;
  dataYear: number;
  source: string;
  isDummy?: boolean;
  notes: string[];
  generatedAt: string;
  bbox: [number, number, number, number];
  features: AreaFeature[];
}

/** IndexedDB に保存するダウンロード済み地域 */
export interface StoredRegion extends RegionMeta {
  downloadedAt: string;
  data: RegionFile;
}

// ---------- 訪問ピンと記録 ----------

export type HousingType = 'house' | 'apartment' | 'mansion' | 'other';
export type Presence = 'home' | 'away' | 'noanswer';
export type Reaction = 'listened' | 'material' | 'appointment' | 'contract' | 'rejected' | 'refusal';
export type Competitor = 'yes' | 'no' | 'unknown';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow';

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  regionCode: string | null;
  areaKey: string | null;
  areaName: string | null;
  housingType: HousingType | null;
  label: string;
  noRevisit: boolean;
  revisitDate: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface Visit {
  id: string;
  pinId: string;
  visitedAt: string; // ISO
  presence: Presence;
  reaction: Reaction | null;
  competitor: Competitor | null;
  weather: Weather | null;
  memo: string;
  createdAt: string;
}

// ---------- 駐車場のある店(OpenStreetMap から scripts/facilities.mjs で作る) ----------

// own = 自分で地図に追加した駐車場(配信データにはない)
export type FacilityCat = 'conv' | 'super' | 'books' | 'drug' | 'home' | 'mall' | 'own';

export interface Facility {
  id: string; // OSM の id(n123 / w456)
  n: string; // 店名
  c: FacilityCat;
  lat: number;
  lng: number;
  s: number; // 駐車場の推定台数
}

export interface FacilityFile {
  format: number;
  code: string;
  name: string;
  prefCode: string;
  prefName: string;
  generatedAt: string;
  osmFetchedAt?: string;
  facilities: Facility[];
}

export interface FacilityIndexEntry {
  code: string;
  name: string;
  prefCode: string;
  prefName: string;
  path: string;
  count: number;
  size: number;
  generatedAt: string;
}

/** IndexedDB に保存するダウンロード済みの店データ(市区町村ごと) */
export interface StoredFacilities extends FacilityIndexEntry {
  downloadedAt: string;
  data: FacilityFile;
}

/** 端末ごとの店の扱い。ok = 使える駐車場として登録、hidden = 地図から消す */
export interface FacilityMark {
  id: string;
  status: 'ok' | 'hidden';
  name: string;
  custom?: boolean; // 配信データにない、自分で追加した駐車場
  memo?: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

// ---------- 設定 ----------

export type IndicatorKey = 'family' | 'age' | 'kids' | 'ownedDetached' | 'growth';
export type Weights = Record<IndicatorKey, number>;
export type CompareScope = 'region' | 'all';

export type PinStatus = 'success' | 'talked' | 'notmet' | 'rejected' | 'blocked' | 'none';

export interface PinFilter {
  statuses: PinStatus[]; // 空 = すべて
  presence: 'all' | 'home' | 'away';
  competitor: 'all' | Competitor;
  period: 'all' | 'today' | 'week' | 'month' | '3months';
  revisitOnly: boolean;
  /** 以前の足跡を地図に出す */
  showTracks: boolean;
  /** 範囲の営業記録を地図に出す */
  showAreaRecords: boolean;
  /** 足跡・範囲記録の期間 */
  recordPeriod: 'all' | 'today' | 'week' | 'month' | '3months';
}

export interface Settings {
  ageFrom: number; // 5歳階級のインデックス(5 = 25〜29歳)
  ageTo: number; // 12 = 60〜64歳、15 = 75歳以上(最後の階級)
  preset: string | null;
  weights: Weights;
  scope: CompareScope;
  activeRegion: string | null;
  showChoropleth: boolean;
  autoRegion: boolean;
  filter: PinFilter;
  locationChoice: 'unasked' | 'allowed' | 'declined';
  showFacilities: boolean;
  facilityMinSpaces: number; // この台数以上の駐車場がある店だけ出す(登録済みの店は常に出す)
  facilityCats: FacilityCat[];
}

// ---------- 足跡(移動の記録) ----------

/** [緯度, 経度, 時刻(ms), 精度(m)] */
export type TrackPoint = [number, number, number, number];
export type TrackFeel = 'good' | 'normal' | 'bad';

/** 足跡記録1回分。訪問記録とは記録していた時間帯で結びつける */
export interface Track {
  id: string;
  startedAt: string; // ISO
  endedAt: string | null; // 記録中は null
  points: TrackPoint[];
  distanceM: number;
  title: string;
  feel: TrackFeel | null; // 手応え
  memo: string;
  updatedAt: string;
}

// ---------- 範囲の営業記録(地図を指で囲って件数をまとめて記録) ----------

export interface AreaRecord {
  id: string;
  /** 囲んだ範囲 [緯度, 経度] の並び */
  polygon: [number, number][];
  recordedAt: string; // ISO(営業した日時)
  visited: number; // 訪問した件数
  talked: number; // 話ができた件数
  revisit: number; // 再訪の予約ができた件数
  contract: number; // 成約した件数
  memo: string;
  createdAt: string;
  updatedAt: string;
}
