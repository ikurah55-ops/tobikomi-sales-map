import type L from 'leaflet';
import { useRef, useState, type PointerEvent } from 'react';

/**
 * 範囲を囲むモード。地図の上に重ねて、指(マウス)でなぞった線を集める。
 * 指を離したら囲んだ範囲を [緯度, 経度] の並びで返す。地図の移動はこの間止まる。
 */
export function DrawOverlay({ map, onDone }: { map: L.Map | null; onDone: (polygon: [number, number][]) => void }) {
  const [pts, setPts] = useState<[number, number][]>([]);
  const active = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const local = (e: PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const down = (e: PointerEvent) => {
    if (active.current != null) {
      // 2本目の指 = ピンチなどなので描くのをやめる
      active.current = null;
      setPts([]);
      return;
    }
    active.current = e.pointerId;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setPts([local(e)]);
  };

  const move = (e: PointerEvent) => {
    if (active.current !== e.pointerId) return;
    const p = local(e);
    setPts((cur) => {
      const last = cur[cur.length - 1];
      return last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 4 ? cur : [...cur, p];
    });
  };

  const up = (e: PointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    const cur = pts;
    setPts([]);
    if (!map || cur.length < 4) return;
    const xs = cur.map((p) => p[0]);
    const ys = cur.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) < 24 && Math.max(...ys) - Math.min(...ys) < 24) return; // 小さすぎる
    // 点を間引いて保存を軽くする
    const kept: [number, number][] = [];
    for (const p of cur) {
      const last = kept[kept.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 10) kept.push(p);
    }
    onDone(
      kept.map(([x, y]) => {
        const ll = map.containerPointToLatLng([x, y]);
        return [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6];
      }),
    );
  };

  return (
    <div
      ref={box}
      className="draw-overlay"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        active.current = null;
        setPts([]);
      }}
    >
      <svg width="100%" height="100%">
        {pts.length > 1 && (
          <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="rgba(234,88,12,.18)" stroke="#ea580c" strokeWidth={3} strokeLinejoin="round" strokeDasharray="8 5" />
        )}
      </svg>
    </div>
  );
}
