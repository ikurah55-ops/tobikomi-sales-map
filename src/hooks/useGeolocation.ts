import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoState {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null; // 移動方向(GPS)
  ts: number;
}

export type GeoStatus = 'off' | 'waiting' | 'ok' | 'denied' | 'unavailable';

/**
 * 端末の現在地を watchPosition で追い続ける。
 * 画面が裏に回ったら取得を止め、戻ったら再開する(電池対策)。軌跡は保存しない。
 */
export function useGeolocation(enabled: boolean) {
  const [pos, setPos] = useState<GeoState | null>(null);
  const [status, setStatus] = useState<GeoStatus>('off');
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    if (watchId.current != null) return;
    setStatus((s) => (s === 'ok' ? s : 'waiting'));
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.heading != null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.5 ? p.coords.heading : null,
          ts: p.timestamp,
        });
        setStatus('ok');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          stop();
        } else setStatus((s) => (s === 'ok' ? s : 'unavailable'));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
      setStatus('off');
      return;
    }
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, [enabled, start, stop]);

  return { pos, status };
}

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** 端末の向いている方向(0 = 北、時計回り)。対応していない端末では null */
export function useCompass(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    let last = 0;
    const handler = (e: Event) => {
      const ev = e as OrientationEventWithCompass;
      let h: number | null = null;
      if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading; // iOS
      else if (ev.absolute && ev.alpha != null) h = 360 - ev.alpha; // Android
      if (h == null) return;
      const now = Date.now();
      if (now - last < 150) return; // 描画しすぎない
      last = now;
      setHeading(Math.round(h) % 360);
    };
    const abs = 'ondeviceorientationabsolute' in window;
    window.addEventListener(abs ? 'deviceorientationabsolute' : 'deviceorientation', handler, true);
    const onVis = () => document.visibilityState !== 'visible' && setHeading(null);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener(abs ? 'deviceorientationabsolute' : 'deviceorientation', handler, true);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);
  return heading;
}

/** iOS は方位センサーの許可をボタン操作の中で求める必要がある */
export async function requestCompassPermission(): Promise<void> {
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  try {
    if (D?.requestPermission) await D.requestPermission();
  } catch {
    // 拒否されても位置表示は続ける
  }
}
