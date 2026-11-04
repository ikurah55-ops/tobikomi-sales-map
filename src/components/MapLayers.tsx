import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, Marker, useMap } from 'react-leaflet';
import type { GeoState } from '../hooks/useGeolocation';
import { STATUS_COLOR, isRevisitDue, pinStatus } from '../lib/records';
import { CLASS_COLORS, type AreaScore } from '../lib/score';
import type { Pin, PinStatus, StoredRegion, Visit } from '../types';

// ---------- 町丁目の色分け ----------

export function AreaLayer({
  regions, scoreByKey, show, selectedKey, onSelect,
}: {
  regions: StoredRegion[];
  scoreByKey: Map<string, AreaScore>;
  show: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 地域が変わったときだけレイヤーを作り直す
  useEffect(() => {
    const layer = L.geoJSON(undefined, {
      onEachFeature: (f, l) => {
        l.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current((f.properties as { key: string }).key);
        });
      },
    });
    for (const r of regions) layer.addData(r.data);
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [regions, map]);

  // スコアや表示設定が変わったらスタイルだけ更新(作り直さないので速い)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.setStyle((f) => {
      const key = (f?.properties as { key: string }).key;
      const a = scoreByKey.get(key);
      const selected = key === selectedKey;
      const noData = !a || a.cls == null;
      return {
        color: selected ? '#0f172a' : '#4c4a7a',
        weight: selected ? 3 : 0.8,
        opacity: show || selected ? 0.9 : 0.35,
        dashArray: noData ? '3 3' : undefined,
        fillColor: noData ? '#cbd5e1' : CLASS_COLORS[a.cls!],
        fillOpacity: show ? (noData ? 0.35 : 0.55) : 0,
      };
    });
  }, [scoreByKey, show, selectedKey, regions]);

  return null;
}

// ---------- 訪問ピン ----------

const iconCache = new Map<string, L.DivIcon>();
function pinIcon(status: PinStatus, due: boolean): L.DivIcon {
  const k = `${status}-${due}`;
  let icon = iconCache.get(k);
  if (!icon) {
    icon = L.divIcon({
      className: 'pin-icon',
      html: `<div class="pin pin-${status}" style="--c:${STATUS_COLOR[status]}">${status === 'blocked' ? '<b>×</b>' : ''}${due ? '<i class="pin-badge">再</i>' : ''}</div>`,
      iconSize: [28, 36],
      iconAnchor: [14, 34],
    });
    iconCache.set(k, icon);
  }
  return icon;
}

export function PinLayer({
  pins, visitsByPin, onSelect,
}: { pins: Pin[]; visitsByPin: Map<string, Visit[]>; onSelect: (p: Pin) => void }) {
  return (
    <>
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(pinStatus(p, visitsByPin.get(p.id) ?? []), isRevisitDue(p))}
          eventHandlers={{ click: () => onSelect(p) }}
        />
      ))}
    </>
  );
}

// ---------- 現在地 ----------

export function LocationLayer({ pos, heading }: { pos: GeoState; heading: number | null }) {
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'me-icon',
        html: '<div class="me-heading"></div><div class="me-dot"></div>',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
    [],
  );
  const dir = heading ?? pos.heading;

  // 向きはアイコンを作り直さずに回転だけ変える
  useEffect(() => {
    const el = markerRef.current?.getElement()?.querySelector<HTMLElement>('.me-heading');
    if (!el) return;
    el.style.display = dir == null ? 'none' : 'block';
    if (dir != null) el.style.transform = `rotate(${dir}deg)`;
  }, [dir, pos]);

  return (
    <>
      <Circle
        center={[pos.lat, pos.lng]}
        radius={pos.accuracy}
        pathOptions={{ color: '#2563eb', weight: 1, opacity: 0.4, fillColor: '#3b82f6', fillOpacity: 0.12 }}
        interactive={false}
      />
      <Marker ref={markerRef} position={[pos.lat, pos.lng]} icon={icon} interactive={false} zIndexOffset={1000} keyboard={false} />
    </>
  );
}
