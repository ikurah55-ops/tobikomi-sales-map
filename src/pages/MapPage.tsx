import type L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { AreaSheet } from '../components/AreaSheet';
import { FilterSheet } from '../components/FilterSheet';
import { FacilitySheet } from '../components/FacilitySheet';
import { AreaLayer, AreaRecordLayer, FacilityLayer, LocationLayer, PinLayer, TrackLayer } from '../components/MapLayers';
import { AreaRecordSheet } from '../components/AreaRecordSheet';
import { DrawOverlay } from '../components/DrawOverlay';
import { TrackListSheet, TrackSheet } from '../components/TrackSheet';
import { trackName } from '../lib/track';
import { RecordingBar } from '../components/RecordingBar';
import { ParkingForm } from '../components/ParkingForm';
import { PinSheet } from '../components/PinSheet';
import { VisitForm, type VisitFormTarget } from '../components/VisitForm';
import { DEFAULT_CENTER, FACILITY_MIN_ZOOM, LOW_ACCURACY_M } from '../config';
import { fetchRegionIndex } from '../data/regions';
import { requestCompassPermission, useCompass, useGeolocation } from '../hooks/useGeolocation';
import { bboxContains, distanceToBbox, featureBounds, locate } from '../lib/geo';
import { isFilterActive, periodStart, pinMatchesFilter } from '../lib/records';
import { CLASS_COLORS, CLASS_LABELS } from '../lib/score';
import { useStore } from '../store';
import { BackupReminder } from '../components/BackupReminder';
import type { AreaRecord, Facility, Pin, Track, Visit } from '../types';

function MapEvents({ onLongPress, onUserMove }: { onLongPress: (lat: number, lng: number) => void; onUserMove: () => void }) {
  useMapEvents({
    // スマホの長押し・PCの右クリック
    contextmenu: (e) => onLongPress(e.latlng.lat, e.latlng.lng),
    dragstart: onUserMove,
  });
  return null;
}

export function MapPage() {
  const store = useStore();
  const { settings, updateSettings, regions, activeRegion, pins, visitsByPin, scoreByKey, toast, tab, focusArea, facilitySets, facilityMarks, recordingTrack, startTrack, stopTrack } = store;
  const mapRef = useRef<L.Map | null>(null);
  const [follow, setFollow] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [form, setForm] = useState<VisitFormTarget | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [regionMenu, setRegionMenu] = useState(false);
  // ---- 範囲の営業記録 ----
  const [drawing, setDrawing] = useState(false);
  const [areaForm, setAreaForm] = useState<{ polygon: [number, number][]; record?: AreaRecord } | null>(null);
  // ---- 足跡 ----
  const [showTracks, setShowTracks] = useState(false);
  const [trackSheet, setTrackSheet] = useState<{ track: Track; justFinished?: boolean } | null>(null);
  const [viewTrackId, setViewTrack] = useState<Track | null>(null);
  // 保存・削除のあとも最新の内容を出す
  const viewTrack = viewTrackId ? store.tracks.find((t) => t.id === viewTrackId.id) ?? null : null;
  const sheetTrack = trackSheet ? store.tracks.find((t) => t.id === trackSheet.track.id) ?? trackSheet.track : null;

  const locOn = settings.locationChoice === 'allowed';
  const { pos, status } = useGeolocation(locOn);
  const compass = useCompass(locOn);
  const regionFiles = useMemo(() => regions.map((r) => r.data), [regions]);

  // ---- 今いる町丁目 ----
  const here = useMemo(() => (pos ? locate(regionFiles, pos.lat, pos.lng) : null), [pos, regionFiles]);
  const hereScore = here ? scoreByKey.get(here.feature.properties.key) : undefined;

  // ---- 地図の移動 ----
  const flyToRegion = useCallback((code: string) => {
    const r = regions.find((x) => x.code === code);
    if (r && mapRef.current) mapRef.current.fitBounds([[r.bbox[1], r.bbox[0]], [r.bbox[3], r.bbox[2]]], { padding: [10, 10] });
  }, [regions]);

  // 表示中の地域が変わったら(設定画面・地域メニューから)その地域へ移動する。
  // 現在地による自動切替やランキングからの移動では skipFly で移動を止める。
  // 地図が隠れている間は大きさが0なので、地図タブに戻ってから移動する。
  const skipFly = useRef<string | null>(null);
  const pendingFly = useRef<string | null>(null);
  const shownRegion = useRef<string | null>(null);
  useEffect(() => {
    const code = activeRegion?.code;
    if (!code || code === shownRegion.current) return;
    shownRegion.current = code;
    if (skipFly.current === code) {
      skipFly.current = null;
      return;
    }
    if (tab === 'map') flyToRegion(code);
    else pendingFly.current = code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegion, flyToRegion]);

  const switchRegion = useCallback((code: string, fly = true) => {
    if (!fly) skipFly.current = code;
    updateSettings({ activeRegion: code });
  }, [updateSettings]);

  // タブを戻したときに地図サイズを再計算
  useEffect(() => {
    if (tab !== 'map') return;
    setTimeout(() => {
      mapRef.current?.invalidateSize();
      if (pendingFly.current) {
        flyToRegion(pendingFly.current);
        pendingFly.current = null;
      }
    }, 50);
  }, [tab, flyToRegion]);

  // 追従モード
  useEffect(() => {
    const map = mapRef.current;
    if (!follow || !pos || !map) return;
    // 同じ位置で動かし続けるとタップが効きにくくなるので、ずれたときだけ動かす
    const p = map.latLngToContainerPoint([pos.lat, pos.lng]);
    const c = map.getSize().divideBy(2);
    if (p.distanceTo(c) > 4) map.panTo([pos.lat, pos.lng], { animate: true });
  }, [follow, pos]);

  // ランキングから町丁目を選んだとき
  useEffect(() => {
    if (!focusArea || Date.now() - focusArea.ts > 2000) return; // 古い依頼は無視(再描画時の誤動作防止)
    const a = scoreByKey.get(focusArea.key);
    if (!a) return;
    if (a.regionCode !== settings.activeRegion) switchRegion(a.regionCode, false);
    pendingFly.current = null;
    setFollow(false);
    setSelectedPin(null);
    setSelectedArea(a.key);
    setTimeout(() => mapRef.current?.fitBounds(featureBounds(a.feature), { padding: [40, 40], maxZoom: 16 }), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusArea]);

  // 現在地のある地域へ自動で切り替える(地域をまたいだときだけ)
  const lastHereRegion = useRef<string | null>(null);
  const suggested = useRef(false);
  useEffect(() => {
    if (!pos || !settings.autoRegion) return;
    const code = here?.region.code ?? regions.find((r) => bboxContains(r.bbox, pos.lat, pos.lng))?.code ?? null;
    if (code && code !== lastHereRegion.current) {
      lastHereRegion.current = code;
      if (code !== settings.activeRegion) {
        switchRegion(code, false);
        toast(`現在地の地域(${regions.find((r) => r.code === code)?.name})に切り替えました`);
      }
    }
    if (!code && !suggested.current) {
      suggested.current = true;
      fetchRegionIndex()
        .then((idx) => {
          const e = idx.regions.find((r) => bboxContains(r.bbox, pos.lat, pos.lng));
          if (e) toast(`現在地は${e.name}です。設定→地域の追加でデータを読み込めます`);
        })
        .catch(() => undefined);
    }
  }, [pos, here, regions, settings.autoRegion, settings.activeRegion, switchRegion, toast]);

  const selectNearestRegion = () => {
    setRegionMenu(false);
    if (!pos) {
      toast('現在地がまだ取得できていません');
      return;
    }
    const nearest = [...regions].sort((a, b) => distanceToBbox(a.bbox, pos.lat, pos.lng) - distanceToBbox(b.bbox, pos.lat, pos.lng))[0];
    if (nearest) {
      switchRegion(nearest.code, false);
      mapRef.current?.setView([pos.lat, pos.lng], 16);
      toast(`${nearest.name}を表示しています`);
    }
  };

  // ---- ピン ----
  const visiblePins = useMemo(
    () => pins.filter((p) => pinMatchesFilter(p, visitsByPin.get(p.id) ?? [], settings.filter)),
    [pins, visitsByPin, settings.filter],
  );
  // ---- 駐車場のある店 ----
  // 消した店は出さない。「使える」に登録した店は台数・種類の条件に関係なく出す
  const { shownFacilities, okFacilityIds } = useMemo(() => {
    const ok = new Set<string>();
    const shown: Facility[] = [];
    if (settings.showFacilities) {
      const cats = new Set(settings.facilityCats);
      for (const set of facilitySets) {
        for (const f of set.data.facilities) {
          const m = facilityMarks.get(f.id)?.status;
          if (m === 'hidden') continue;
          if (m === 'ok') ok.add(f.id);
          if (m === 'ok' || (cats.has(f.c) && f.s >= settings.facilityMinSpaces)) shown.push(f);
        }
      }
      // 自分で追加した駐車場は店データがなくても出す
      for (const m of facilityMarks.values()) {
        if (!m.custom) continue;
        ok.add(m.id);
        shown.push({ id: m.id, n: m.name, c: 'own', lat: m.lat, lng: m.lng, s: 0 });
      }
    }
    return { shownFacilities: shown, okFacilityIds: ok };
  }, [facilitySets, facilityMarks, settings.showFacilities, settings.facilityCats, settings.facilityMinSpaces]);
  // ---- 絞り込みで出す足跡・範囲記録 ----
  const { shownTracks, shownAreaRecords } = useMemo(() => {
    const f = settings.filter;
    const from = periodStart(f.recordPeriod);
    return {
      shownTracks: f.showTracks ? store.tracks.filter((t) => t.points.length > 1 && Date.parse(t.startedAt) >= from) : [],
      shownAreaRecords: f.showAreaRecords ? store.areaRecords.filter((r) => Date.parse(r.recordedAt) >= from) : [],
    };
  }, [settings.filter, store.tracks, store.areaRecords]);
  const hasCustomParking = useMemo(() => [...facilityMarks.values()].some((m) => m.custom), [facilityMarks]);
  const [parkingAt, setParkingAt] = useState<{ lat: number; lng: number } | null>(null);

  const pinNow = selectedPin ? pins.find((p) => p.id === selectedPin) ?? null : null;

  const openNewPin = (lat: number, lng: number, source: 'gps' | 'press') => {
    const hit = locate(regionFiles, lat, lng);
    setSelectedArea(null);
    setSelectedPin(null);
    setForm({
      kind: 'new', lat, lng, source,
      regionCode: hit?.region.code ?? null, areaKey: hit?.feature.properties.key ?? null, areaName: hit?.feature.properties.name ?? null,
    });
  };

  const pinHere = () => {
    if (!locOn || status === 'denied') {
      toast('位置情報が使えません。地図を長押しするとピンを立てられます');
      return;
    }
    if (!pos) {
      toast('現在地を取得中です。少し待つか、地図を長押ししてください');
      return;
    }
    openNewPin(pos.lat, pos.lng, 'gps');
  };

  const toggleFollow = async () => {
    if (!locOn) {
      updateSettings({ locationChoice: 'unasked' });
      return;
    }
    await requestCompassPermission();
    if (pos && mapRef.current) mapRef.current.setView([pos.lat, pos.lng], Math.max(mapRef.current.getZoom(), 16));
    setFollow((f) => !f);
  };

  const beginTrack = async () => {
    setShowTracks(false);
    setViewTrack(null);
    if (!('geolocation' in navigator)) {
      toast('この端末では位置情報が使えないため、足跡を記録できません');
      return;
    }
    if (settings.locationChoice !== 'allowed') updateSettings({ locationChoice: 'allowed' });
    await startTrack();
    if (pos && mapRef.current) mapRef.current.setView([pos.lat, pos.lng], Math.max(mapRef.current.getZoom(), 16));
    setFollow(true);
    toast('足跡の記録を始めました');
  };

  const endTrack = async () => {
    const t = await stopTrack();
    if (t) setTrackSheet({ track: t, justFinished: true });
  };

  const showTrackOnMap = (t: Track) => {
    setTrackSheet(null);
    setShowTracks(false);
    setFollow(false);
    setViewTrack(t);
    const map = mapRef.current;
    if (map && t.points.length) map.fitBounds(t.points.map((p) => [p[0], p[1]] as [number, number]), { paddingTopLeft: [30, 70], paddingBottomRight: [80, 130], maxZoom: 17 });
  };

  const center: [number, number] = activeRegion ? activeRegion.center : DEFAULT_CENTER;
  const lowAccuracy = pos && pos.accuracy >= LOW_ACCURACY_M;
  const dummy = regions.some((r) => r.isDummy);
  const filterOn = isFilterActive(settings.filter);

  return (
    <div className="map-page">
      <header className="map-header">
        <button className="region-btn" onClick={() => setRegionMenu((m) => !m)}>
          {activeRegion?.name ?? '地域なし'} <span className="caret">▼</span>
        </button>
        <div className="here">
          {status === 'ok' && pos ? (
            here ? (
              <>
                <span className="here-dot" />
                <span className="here-name">{here.feature.properties.name}</span>
                {hereScore?.score != null ? (
                  <b className="here-score">{Math.round(hereScore.score)}点</b>
                ) : (
                  <span className="here-score muted">データ不足</span>
                )}
              </>
            ) : (
              <span className="muted">地域データの外にいます</span>
            )
          ) : status === 'waiting' ? (
            <span className="muted">現在地を取得中…</span>
          ) : status === 'denied' || settings.locationChoice === 'declined' ? (
            <span className="muted">長押しでピンを追加</span>
          ) : null}
        </div>
      </header>

      {regionMenu && (
        <div className="menu-backdrop" onClick={() => setRegionMenu(false)}>
          <div className="region-menu" onClick={(e) => e.stopPropagation()}>
            {regions.map((r) => (
              <button
                key={r.code}
                className={`menu-item${r.code === settings.activeRegion ? ' on' : ''}`}
                onClick={() => {
                  switchRegion(r.code);
                  setRegionMenu(false);
                }}
              >
                {r.name} <small>{r.prefName}{r.isDummy ? '・ダミー' : ''}</small>
              </button>
            ))}
            <button className="menu-item" onClick={selectNearestRegion}>📍 現在地から選ぶ</button>
            <button className="menu-item" onClick={() => { setRegionMenu(false); store.setTab('settings'); }}>＋ 地域を追加</button>
          </div>
        </div>
      )}

      <div className="map-wrap">
        <MapContainer
          ref={mapRef}
          center={center}
          zoom={14}
          zoomSnap={0.5}
          zoomControl={false}
          attributionControl={false}
          className="map"
          preferCanvas={false}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <AttributionControl key={dummy ? "dummy" : "real"} position="bottomleft" prefix={dummy ? 'ダミー統計データ' : '出典: 国勢調査(総務省統計局)を加工'} />
          <AreaLayer
            regions={regions}
            scoreByKey={scoreByKey}
            show={settings.showChoropleth}
            selectedKey={selectedArea}
            onSelect={(k) => {
              setSelectedPin(null);
              setSelectedArea(k);
            }}
          />
          <FacilityLayer
            facilities={shownFacilities}
            okIds={okFacilityIds}
            minZoom={FACILITY_MIN_ZOOM}
            onSelect={(f) => { setSelectedArea(null); setSelectedPin(null); setSelectedFacility(f); }}
          />
          <PinLayer pins={visiblePins} visitsByPin={visitsByPin} onSelect={(p: Pin) => { setSelectedArea(null); setSelectedPin(p.id); }} />
          <AreaRecordLayer
            records={shownAreaRecords}
            selectedId={areaForm?.record?.id ?? null}
            onSelect={(r) => { if (drawing) return; setSelectedArea(null); setSelectedPin(null); setAreaForm({ polygon: r.polygon, record: r }); }}
          />
          {shownTracks.filter((t) => t.id !== viewTrack?.id).map((t) => (
            <TrackLayer key={t.id} points={t.points} color="#8b5cf6" faded onSelect={() => !drawing && setTrackSheet({ track: t })} />
          ))}
          {viewTrack && <TrackLayer points={viewTrack.points} color="#7c3aed" onSelect={() => !drawing && setTrackSheet({ track: viewTrack })} />}
          {recordingTrack && <TrackLayer points={recordingTrack.points} color="#dc2626" live />}
          {pos && <LocationLayer pos={pos} heading={compass} />}
          <MapEvents onLongPress={(lat, lng) => !drawing && openNewPin(lat, lng, 'press')} onUserMove={() => setFollow(false)} />
        </MapContainer>

        {drawing && (
          <DrawOverlay
            map={mapRef.current}
            onDone={(polygon) => { setDrawing(false); setAreaForm({ polygon }); }}
          />
        )}

        <div className="map-chips">
          {drawing && (
            <span className="draw-hint">
              指でなぞって範囲を囲んでください
              <button onClick={() => setDrawing(false)}>やめる</button>
            </span>
          )}
          {recordingTrack ? (
            <RecordingBar track={recordingTrack} onStop={endTrack} />
          ) : (
            <button className="track-start-btn" onClick={beginTrack}>👣 足跡記録開始</button>
          )}
          {viewTrack && (
            <span className="chip-note track-chip">
              <button onClick={() => setTrackSheet({ track: viewTrack })}>👣 {trackName(viewTrack)}</button>
              <button onClick={() => setViewTrack(null)} aria-label="足跡を消す">✕</button>
            </span>
          )}
          {dummy && <span className="chip-note">ダミーデータ表示中</span>}
          {lowAccuracy && <span className="chip-note warn">位置の精度が低い(±{Math.round(pos!.accuracy)}m)</span>}
          {filterOn && <span className="chip-note info">絞り込み中 {visiblePins.length}/{pins.length}</span>}
        </div>

        <div className="fab-col">
          <button className={`fab${settings.showChoropleth ? ' on' : ''}`} onClick={() => updateSettings({ showChoropleth: !settings.showChoropleth })} aria-label="色分けの切り替え">
            <span>🎨</span><small>色分け</small>
          </button>
          <button className={`fab${filterOn ? ' on' : ''}`} onClick={() => setShowFilter(true)} aria-label="ピンの絞り込み">
            <span>⚲</span><small>絞込</small>
          </button>
          {(facilitySets.length > 0 || hasCustomParking) && (
            <button
              className={`fab${settings.showFacilities ? ' on' : ''}`}
              onClick={() => updateSettings({ showFacilities: !settings.showFacilities })}
              aria-label="駐車場のある店の表示切り替え"
            >
              <span>P</span><small>駐車場</small>
            </button>
          )}
          <button
            className={`fab${drawing ? ' on' : ''}`}
            onClick={() => { setFollow(false); setSelectedArea(null); setSelectedPin(null); setDrawing((d) => !d); }}
            aria-label="範囲を囲んで営業記録"
          >
            <span>✍️</span><small>範囲</small>
          </button>
          <button className={`fab${recordingTrack || viewTrack ? ' on' : ''}`} onClick={() => setShowTracks(true)} aria-label="足跡の一覧">
            <span>👣</span><small>足跡</small>
          </button>
          <button className={`fab${showLegend ? ' on' : ''}`} onClick={() => setShowLegend((s) => !s)} aria-label="凡例">
            <span>≡</span><small>凡例</small>
          </button>
        </div>

        {showLegend && (
          <div className="legend" onClick={() => setShowLegend(false)}>
            <div className="legend-title">エリアスコア</div>
            {[4, 3, 2, 1, 0].map((c) => (
              <div key={c} className="legend-row">
                <i style={{ background: CLASS_COLORS[c] }} /> {CLASS_LABELS[c]}
              </div>
            ))}
            <div className="legend-row"><i className="legend-nodata" /> データ不足</div>
            <div className="legend-title" style={{ marginTop: 6 }}>ピン</div>
            <div className="legend-row"><i className="dot" style={{ background: '#1e9e4a' }} /> 成約・アポ</div>
            <div className="legend-row"><i className="dot" style={{ background: '#2563eb' }} /> 話せた・資料</div>
            <div className="legend-row"><i className="dot" style={{ background: '#eab308' }} /> 不在(未接触)</div>
            <div className="legend-row"><i className="dot" style={{ background: '#f97316' }} /> 断られた</div>
            <div className="legend-row"><i className="dot" style={{ background: '#8b8f97' }} /> 再訪禁止</div>
            {shownTracks.length > 0 && (
              <div className="legend-row"><i style={{ background: '#8b5cf6', height: 5, border: 0 }} /> 以前の足跡</div>
            )}
            {shownAreaRecords.length > 0 && (
              <div className="legend-row"><i style={{ background: 'rgba(249,115,22,.25)', borderColor: '#ea580c', borderStyle: 'dashed' }} /> 範囲の営業記録</div>
            )}
            {(facilitySets.length > 0 || hasCustomParking) && (
              <>
                <div className="legend-title" style={{ marginTop: 6 }}>駐車場のある店</div>
                <div className="legend-row"><i className="dot" style={{ background: '#1d4ed8', borderRadius: 3 }} /> {settings.facilityMinSpaces}台以上(寄せると表示)</div>
                <div className="legend-row"><i className="dot" style={{ background: '#16a34a', borderRadius: 3 }} /> 使える駐車場(★は自分で追加)</div>
              </>
            )}
          </div>
        )}

        <div className="bottom-actions">
          <button className={`fab fab-locate${follow ? ' on' : ''}`} onClick={toggleFollow} aria-label="現在地に追従">
            <span>{follow ? '◉' : '◎'}</span><small>{follow ? '追従中' : '現在地'}</small>
          </button>
          <button className="pin-here-btn" onClick={pinHere}>
            <span className="pin-here-icon">📍</span>
            現在地にピンを立てる
          </button>
        </div>
      </div>

      {settings.locationChoice === 'unasked' && tab === 'map' && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>📍 位置情報の利用について</h3>
            <ul className="modal-list">
              <li>地図に<b>今いる場所</b>を青い点で表示します</li>
              <li>今いる<b>町丁目の名前とスコア</b>を画面上部に出します</li>
              <li>「現在地にピンを立てる」で、訪問した家の位置を記録します</li>
            </ul>
            <p className="muted small">位置情報はこの端末の中だけで使い、外部には送りません。移動の軌跡は「足跡記録」を開始したときだけ保存します。アプリを閉じている間は取得しません。</p>
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={async () => {
                await requestCompassPermission();
                updateSettings({ locationChoice: 'allowed' });
              }}
            >
              位置情報を使う
            </button>
            <button className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={() => updateSettings({ locationChoice: 'declined' })}>
              使わない(長押しでピンを追加)
            </button>
          </div>
        </div>
      )}

      <BackupReminder />

      {status === 'denied' && settings.locationChoice === 'allowed' && (
        <div className="banner">位置情報が許可されていません。地図を長押しするとピンを追加できます。</div>
      )}

      {showFilter && <FilterSheet onClose={() => setShowFilter(false)} shown={visiblePins.length} total={pins.length} trackCount={shownTracks.length} areaCount={shownAreaRecords.length} />}
      {selectedArea && !form && <AreaSheet areaKey={selectedArea} onClose={() => setSelectedArea(null)} />}
      {pinNow && !form && (
        <PinSheet
          pin={pinNow}
          onClose={() => setSelectedPin(null)}
          onAddVisit={() => setForm({ kind: 'add', pin: pinNow })}
          onEditVisit={(v: Visit) => setForm({ kind: 'edit', pin: pinNow, visit: v })}
        />
      )}
      {selectedFacility && !form && (
        <FacilitySheet facility={selectedFacility} here={pos ? { lat: pos.lat, lng: pos.lng } : null} onClose={() => setSelectedFacility(null)} />
      )}
      {form && (
        <VisitForm
          target={form}
          onClose={() => setForm(null)}
          onRegisterParking={form.kind === 'new' ? () => { setParkingAt({ lat: form.lat, lng: form.lng }); setForm(null); } : undefined}
        />
      )}
      {showTracks && <TrackListSheet onClose={() => setShowTracks(false)} onStart={beginTrack} onOpen={(t) => { setShowTracks(false); setTrackSheet({ track: t }); }} />}
      {trackSheet && (
        <TrackSheet
          key={trackSheet.track.id}
          track={sheetTrack!}
          justFinished={trackSheet.justFinished}
          onClose={() => setTrackSheet(null)}
          onShowOnMap={() => showTrackOnMap(sheetTrack!)}
        />
      )}
      {areaForm && (
        <AreaRecordSheet
          key={areaForm.record?.id ?? 'new'}
          record={areaForm.record}
          polygon={areaForm.polygon}
          onClose={() => setAreaForm(null)}
        />
      )}
      {parkingAt && <ParkingForm lat={parkingAt.lat} lng={parkingAt.lng} onClose={() => setParkingAt(null)} />}
    </div>
  );
}
