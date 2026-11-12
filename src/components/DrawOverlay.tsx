import L from 'leaflet';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

/**
 * 範囲を囲むモード。地図の上に重ねて、指(マウス)でなぞった線を集める。
 * 指を離したら囲んだ範囲を地図に描いて確定するか聞き、「はい」で [緯度, 経度] の並びを返す。
 * なぞっている間は地図が動かない。確認中は地図の上に描くので、ピンチ・ズームで縮尺を変えられる。
 */
export function DrawOverlay({ map, onDone }: { map: L.Map | null; onDone: (polygon: [number, number][]) => void }) {
  const [pts, setPts] = useState<[number, number][]>([]);
  // 描き終えて確認中の範囲 [緯度, 経度]
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const active = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // 確認中の範囲は地図のレイヤーとして描く(拡大・縮小に追従する)
  useEffect(() => {
    if (!map || !pending) return;
    const layer = L.polygon(pending, { color: '#ea580c', weight: 4, fillColor: '#f97316', fillOpacity: 0.28, interactive: false }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, pending]);

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
    setPending(
      kept.map(([x, y]) => {
        const ll = map.containerPointToLatLng([x, y]);
        return [Math.round(ll.lat * 1e6) / 1e6, Math.round(ll.lng * 1e6) / 1e6];
      }),
    );
  };

  return (
    <div
      ref={box}
      className={`draw-overlay${pending ? ' confirming' : ''}`}
      onPointerDown={pending ? undefined : down}
      onPointerMove={pending ? undefined : move}
      onPointerUp={pending ? undefined : up}
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
      {pending && (
        <div className="draw-confirm">
          <p>この範囲で確定しますか?</p>
          <p className="muted small">ピンチ・ズームで縮尺を変えて確かめられます</p>
          <div className="row-gap">
            <button className="btn btn-outline grow" onClick={() => setPending(null)}>修正する</button>
            <button
              className="btn btn-primary grow"
              onClick={() => {
                onDone(pending);
                setPending(null);
              }}
            >
              はい
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
