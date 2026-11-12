import L from 'leaflet';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

/**
 * 範囲を囲むモード。地図の上に重ねて、指(マウス)でなぞった線を集める。
 * 指を離したら囲んだ範囲を地図に描いて確定するか聞き、「はい」で [緯度, 経度] の並びを返す。
 * 1本指でなぞると範囲を描き、2本指ならピンチ・ズームと移動ができる(PCはホイールで拡大・縮小)。
 * 確認中は地図の上に描くので、ふつうに地図を操作できる。
 */
export function DrawOverlay({ map, onDone }: { map: L.Map | null; onDone: (polygon: [number, number][]) => void }) {
  const [pts, setPts] = useState<[number, number][]>([]);
  // 描き終えて確認中の範囲 [緯度, 経度]
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const active = useRef<number | null>(null);
  // 触れている指の位置(画面上)
  const touches = useRef(new Map<number, [number, number]>());
  // 2本指の操作中: 始めたときの指の間隔・拡大率と、指の真ん中にあった地点
  const pinch = useRef<{ dist: number; zoom: number; center: L.LatLng; snap: number | undefined } | null>(null);
  // ピンチのあと、指が全部離れるまでは描き始めない
  const blocked = useRef(false);
  const frame = useRef(0);
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

  const two = () => {
    const [a, b] = [...touches.current.values()];
    return { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] };
  };

  const startPinch = () => {
    if (!map) return;
    const { dist, mid } = two();
    const snap = map.options.zoomSnap;
    map.options.zoomSnap = 0; // ピンチ中はなめらかに
    pinch.current = { dist: Math.max(dist, 1), zoom: map.getZoom(), center: map.containerPointToLatLng(mid), snap };
  };

  const endPinch = () => {
    const p = pinch.current;
    pinch.current = null;
    if (!map || !p) return;
    map.options.zoomSnap = p.snap;
    const step = p.snap || 0.5;
    map.setZoom(Math.round(map.getZoom() / step) * step, { animate: false });
  };

  const applyPinch = () => {
    frame.current = 0;
    const p = pinch.current;
    if (!map || !p || touches.current.size < 2) return;
    const { dist, mid } = two();
    const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), p.zoom + Math.log2(dist / p.dist)));
    // 始めに指の真ん中にあった地点が、今の指の真ん中に来るように動かす
    const size = map.getSize();
    const at = map.project(p.center, zoom).subtract(L.point(mid[0], mid[1])).add(size.divideBy(2));
    map.setView(map.unproject(at, zoom), zoom, { animate: false });
  };

  const down = (e: PointerEvent) => {
    touches.current.set(e.pointerId, local(e));
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // 取れなくても動く
    }
    if (touches.current.size >= 2) {
      // 2本目の指 = ピンチ・移動。描きかけの線は捨てる
      active.current = null;
      setPts([]);
      blocked.current = true;
      if (touches.current.size === 2) startPinch();
      return;
    }
    if (blocked.current) return;
    active.current = e.pointerId;
    setPts([local(e)]);
  };

  const move = (e: PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, local(e));
    if (pinch.current) {
      if (!frame.current) frame.current = requestAnimationFrame(applyPinch);
      return;
    }
    if (active.current !== e.pointerId) return;
    const p = local(e);
    setPts((cur) => {
      const last = cur[cur.length - 1];
      return last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 4 ? cur : [...cur, p];
    });
  };

  const release = (e: PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (pinch.current && touches.current.size < 2) endPinch();
    if (touches.current.size === 0) blocked.current = false;
  };

  const up = (e: PointerEvent) => {
    release(e);
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
      onPointerCancel={(e) => {
        release(e);
        active.current = null;
        setPts([]);
      }}
      onWheel={(e) => {
        // PC: ホイールで拡大・縮小
        if (!map) return;
        const [x, y] = [e.clientX - box.current!.getBoundingClientRect().left, e.clientY - box.current!.getBoundingClientRect().top];
        map.setZoomAround(L.point(x, y), map.getZoom() + (e.deltaY < 0 ? 0.5 : -0.5));
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
