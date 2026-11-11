import { useEffect, useState } from 'react';
import { formatDistance, formatDuration, visitsInTrack } from '../lib/track';
import { useStore } from '../store';
import type { Track } from '../types';

/** 足跡記録中の表示と終了ボタン */
export function RecordingBar({ track, onStop }: { track: Track; onStop: () => void }) {
  const { visits } = useStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const n = visitsInTrack({ ...track, endedAt: new Date(now + 60_000).toISOString() }, visits).length;

  return (
    <div className="rec-bar" role="status">
      <span className="rec-dot" />
      <span className="rec-text">
        記録中 {formatDuration(now - Date.parse(track.startedAt))} ・ {formatDistance(track.distanceM)} ・ 訪問{n}件
      </span>
      <button
        className="rec-stop"
        onClick={() => window.confirm('足跡の記録を終了しますか?') && onStop()}
      >
        記録終了
      </button>
    </div>
  );
}
