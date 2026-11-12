import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_REGION } from './config';
import { downloadRegion, fetchRegionIndex } from './data/regions';
import { listAreaRecords, listFacilityMarks, listFacilitySets, listPins, listRegions, listVisits, loadSettings, onRecordsChange, requestPersistentStorage, storeSettings } from './data/repository';
import { DEFAULT_FILTER } from './lib/records';
import { DEFAULT_WEIGHTS, scoreGroup, type AreaScore, type ScoreGroup } from './lib/score';
import { FACILITY_CATS } from './data/facilities';
import type { AreaRecord, FacilityMark, Pin, PinFilter, Settings, StoredFacilities, StoredRegion, Visit, Weights } from './types';

/** 前処理(scripts/preprocess.mjs)が出力する地域データの形式番号。これより古い保存データは自動で取り直す */
const REGION_FORMAT = 2;

export type Tab = 'map' | 'ranking' | 'history' | 'settings';

/** 履歴から地図へ移動するときの行き先 */
export type MapFocus = { kind: 'pin' | 'area'; id: string; ts: number };

const DEFAULT_SETTINGS: Settings = {
  ageFrom: 6,
  ageTo: 8,
  preset: 'standard',
  weights: DEFAULT_WEIGHTS,
  scope: 'region',
  activeRegion: null,
  showChoropleth: true,
  autoRegion: true,
  filter: DEFAULT_FILTER,
  locationChoice: 'unasked',
  showFacilities: true,
  facilityMinSpaces: 30,
  facilityCats: FACILITY_CATS,
};

interface Store {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  regions: StoredRegion[];
  regionsLoaded: boolean;
  reloadRegions: () => Promise<void>;
  activeRegion: StoredRegion | null;
  pins: Pin[];
  visits: Visit[];
  visitsByPin: Map<string, Visit[]>;
  facilitySets: StoredFacilities[];
  reloadFacilities: () => Promise<void>;
  facilityMarks: Map<string, FacilityMark>;
  /** 範囲の営業記録(新しい順) */
  areaRecords: AreaRecord[];
  scoreByKey: Map<string, AreaScore>;
  activeGroup: ScoreGroup | null;
  avgLabel: string;
  tab: Tab;
  setTab: (t: Tab) => void;
  focusArea: { key: string; ts: number } | null;
  requestFocusArea: (key: string) => void;
  mapFocus: MapFocus | null;
  requestMapFocus: (t: Omit<MapFocus, 'ts'>) => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
};

/** 旧版にあった「最新の訪問」「他社の営業」の絞り込みは削除したので、保存値から外す */
function dropOldFilterKeys(f: PinFilter): PinFilter {
  const { presence: _p, competitor: _c, ...rest } = f as PinFilter & { presence?: unknown; competitor?: unknown };
  return rest;
}

/** 「山形市」→「市」平均 のように、比較範囲の呼び方 */
const unitOf = (name: string) => (/[市町村区]$/.test(name) ? name.slice(-1) : '地域');

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = loadSettings();
    // 旧版の「女性の非就業率」の重みは、代わりの「子どもがいる世帯の割合」に引き継ぐ
    const w = saved?.weights as (Partial<Weights> & { femaleNonWork?: number }) | undefined;
    const weights = w && w.kids == null ? { ...DEFAULT_WEIGHTS, ...w, kids: w.femaleNonWork ?? DEFAULT_WEIGHTS.kids } : saved?.weights;
    if (weights) delete (weights as { femaleNonWork?: number }).femaleNonWork;
    return { ...DEFAULT_SETTINGS, ...saved, ...(weights && { weights }), filter: dropOldFilterKeys({ ...DEFAULT_FILTER, ...saved?.filter }) };
  });
  const [regions, setRegions] = useState<StoredRegion[]>([]);
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [pins, setPins] = useState<Pin[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [facilitySets, setFacilitySets] = useState<StoredFacilities[]>([]);
  const [facilityMarks, setFacilityMarks] = useState<Map<string, FacilityMark>>(new Map());
  const [areaRecords, setAreaRecords] = useState<AreaRecord[]>([]);
  const [tab, setTab] = useState<Tab>('map');
  const [focusArea, setFocusArea] = useState<{ key: string; ts: number } | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      storeSettings(next);
      return next;
    });
  }, []);

  const reloadRecords = useCallback(async () => {
    const [p, v, m, ar] = await Promise.all([listPins(), listVisits(), listFacilityMarks(), listAreaRecords()]);
    setPins(p);
    setVisits(v);
    setFacilityMarks(new Map(m.map((x) => [x.id, x])));
    setAreaRecords(ar);
  }, []);

  const reloadFacilities = useCallback(async () => {
    const f = await listFacilitySets();
    f.sort((a, b) => a.code.localeCompare(b.code));
    setFacilitySets(f);
  }, []);

  const reloadRegions = useCallback(async () => {
    const r = await listRegions();
    r.sort((a, b) => a.code.localeCompare(b.code));
    setRegions(r);
  }, []);

  // 起動時: 記録と地域を読み込む。地域が1つもなければ山形市をダウンロード
  useEffect(() => {
    requestPersistentStorage();
    reloadRecords();
    reloadFacilities();
    const off = onRecordsChange(reloadRecords);
    (async () => {
      let r = await listRegions();
      if (!r.length) {
        try {
          const index = await fetchRegionIndex();
          const entry = index.regions.find((e) => e.code === DEFAULT_REGION) ?? index.regions[0];
          if (entry) {
            await downloadRegion(entry);
            r = await listRegions();
          }
        } catch {
          toast('地域データを取得できませんでした。電波の良い場所で設定→地域の追加から読み込んでください');
        }
      }
      r.sort((a, b) => a.code.localeCompare(b.code));
      setRegions(r);
      setRegionsLoaded(true);

      // ダミーデータや古い形式(子どもがいる世帯の列がない)の地域は、公開中のデータで自動で入れ替える
      const dummies = r.filter((x) => x.isDummy || x.data.format < REGION_FORMAT);
      if (!dummies.length) return;
      try {
        const index = await fetchRegionIndex();
        let replaced = 0;
        for (const d of dummies) {
          const entry = index.regions.find((e) => e.code === d.code && !e.isDummy);
          if (entry) {
            await downloadRegion(entry);
            replaced++;
          }
        }
        if (replaced) {
          const next = await listRegions();
          next.sort((a, b) => a.code.localeCompare(b.code));
          setRegions(next);
          toast('地域データを最新の国勢調査データに更新しました');
        }
      } catch {
        // 電波がないときは次回起動時に再試行
      }
    })();
    return off;
  }, [reloadRecords, reloadFacilities, toast]);

  // 表示中の地域が未設定・削除済みなら先頭の地域にする
  useEffect(() => {
    if (!regionsLoaded) return;
    if (regions.length && !regions.some((r) => r.code === settings.activeRegion)) {
      updateSettings({ activeRegion: regions[0].code });
    }
  }, [regions, regionsLoaded, settings.activeRegion, updateSettings]);

  const visitsByPin = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of visits) {
      const arr = m.get(v.pinId);
      if (arr) arr.push(v);
      else m.set(v.pinId, [v]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
    return m;
  }, [visits]);

  const activeRegion = regions.find((r) => r.code === settings.activeRegion) ?? null;

  const { scoreByKey, groups } = useMemo(() => {
    const s = { ageFrom: settings.ageFrom, ageTo: settings.ageTo, weights: settings.weights };
    const groups = new Map<string, ScoreGroup>();
    if (settings.scope === 'all') {
      groups.set('all', scoreGroup(regions.map((r) => ({ regionCode: r.code, features: r.data.features })), s, '全地域'));
    } else {
      for (const r of regions) groups.set(r.code, scoreGroup([{ regionCode: r.code, features: r.data.features }], s, unitOf(r.name)));
    }
    const scoreByKey = new Map<string, AreaScore>();
    for (const g of groups.values()) for (const a of [...g.ranked, ...g.insufficient]) scoreByKey.set(a.key, a);
    return { scoreByKey, groups };
  }, [regions, settings.ageFrom, settings.ageTo, settings.weights, settings.scope]);

  const activeGroup = (settings.scope === 'all' ? groups.get('all') : groups.get(settings.activeRegion ?? '')) ?? null;
  const avgLabel = settings.scope === 'all' ? '全地域' : activeRegion ? unitOf(activeRegion.name) : '市';

  const requestMapFocus = useCallback((t: Omit<MapFocus, 'ts'>) => {
    setMapFocus({ ...t, ts: Date.now() });
    setTab('map');
  }, []);

  const requestFocusArea = useCallback((key: string) => {
    setFocusArea({ key, ts: Date.now() });
    setTab('map');
  }, []);

  const value: Store = {
    settings, updateSettings, regions, regionsLoaded, reloadRegions, activeRegion,
    pins, visits, visitsByPin, facilitySets, reloadFacilities, facilityMarks,
    areaRecords, scoreByKey, activeGroup, avgLabel,
    tab, setTab, focusArea, requestFocusArea, mapFocus, requestMapFocus, toast, toastMsg,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
