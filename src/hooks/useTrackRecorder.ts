import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveTrack, newId, putTrackQuiet, saveTrack } from '../data/repository';
import { acceptPoint } from '../lib/track';
import type { Track, TrackPoint } from '../types';

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };

const SAVE_EVERY_POINTS = 5;
const SAVE_EVERY_MS = 20_000;

/**
 * 足跡記録。開始〜終了の間、現在地を追って IndexedDB に少しずつ保存する。
 * 記録中は画面が消えないようにする(ブラウザは画面オフ・裏に回ると位置を取れないため)。
 * アプリを閉じて開き直しても、終了していなければ続きから記録する。
 */
export function useTrackRecorder(onError: (msg: string) => void) {
  const [track, setTrack] = useState<Track | null>(null);
  const ref = useRef<Track | null>(null);
  const lastSave = useRef({ n: 0, t: 0 });

  const persist = useCallback(async (force = false) => {
    const t = ref.current;
    if (!t) return;
    const now = Date.now();
    if (!force && t.points.length - lastSave.current.n < SAVE_EVERY_POINTS && now - lastSave.current.t < SAVE_EVERY_MS) return;
    lastSave.current = { n: t.points.length, t: now };
    await putTrackQuiet(t);
  }, []);

  // 開き直したとき、記録中だった足跡を再開
  useEffect(() => {
    getActiveTrack().then((t) => {
      if (t && !ref.current) {
        ref.current = t;
        lastSave.current = { n: t.points.length, t: Date.now() };
        setTrack(t);
      }
    });
  }, []);

  const recording = !!track;
  const trackId = track?.id;

  // 位置の取得
  useEffect(() => {
    if (!trackId || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const t = ref.current;
        if (!t) return;
        const pt: TrackPoint = [
          Math.round(p.coords.latitude * 1e6) / 1e6,
          Math.round(p.coords.longitude * 1e6) / 1e6,
          p.timestamp,
          Math.round(p.coords.accuracy),
        ];
        const d = acceptPoint(t.points[t.points.length - 1], pt);
        if (d == null) return;
        const next = { ...t, points: [...t.points, pt], distanceM: t.distanceM + d };
        ref.current = next;
        setTrack(next);
        persist();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) onError('位置情報が許可されていないため、足跡を記録できません');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [trackId, persist, onError]);

  // 画面を消さない + 裏に回るときは保存
  useEffect(() => {
    if (!recording) return;
    let lock: WakeLockSentinelLike | null = null;
    let alive = true;
    const acquire = async () => {
      try {
        const l = await (navigator as NavigatorWithWakeLock).wakeLock?.request('screen');
        if (!alive) l?.release();
        else lock = l ?? null;
      } catch {
        // 対応していない・電池節約モードなど。記録自体は続ける
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire();
      else persist(true);
    };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => {
      alive = false;
      lock?.release().catch(() => undefined);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
    };
  }, [recording, persist]);

  const start = useCallback(async () => {
    if (ref.current) return;
    const now = new Date().toISOString();
    const t: Track = { id: newId(), startedAt: now, endedAt: null, points: [], distanceM: 0, title: '', feel: null, memo: '', updatedAt: now };
    ref.current = t;
    lastSave.current = { n: 0, t: Date.now() };
    setTrack(t);
    await saveTrack(t);
  }, []);

  /** 記録を終える。終えた足跡を返す */
  const stop = useCallback(async (): Promise<Track | null> => {
    const t = ref.current;
    if (!t) return null;
    const done: Track = { ...t, endedAt: new Date().toISOString() };
    ref.current = null;
    setTrack(null);
    await saveTrack(done);
    return done;
  }, []);

  return { track, start, stop };
}
