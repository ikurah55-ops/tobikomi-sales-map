import { useMemo, useState } from 'react';
import { deleteTrack, saveTrack } from '../data/repository';
import { formatDateTime } from '../lib/records';
import { formatDistance, formatDuration, trackEndMs, trackName, visitsInTrack } from '../lib/track';
import { useStore } from '../store';
import type { SalesCounts, Track, Visit } from '../types';
import { SalesRecordFields, countVisits, toLocalInput } from './SalesRecordFields';
import { BottomSheet } from './ui';

/** 足跡の成果。保存していなければ、記録していた時間の訪問記録から数える */
export const trackCounts = (t: Track, visits: Visit[]): SalesCounts => t.counts ?? countVisits(visitsInTrack(t, visits));

/** 足跡の営業記録。項目と画面は範囲記録と同じ(日時・4つの件数・メモ) */
export function TrackSheet({
  track, justFinished, onClose, onShowOnMap,
}: { track: Track; justFinished?: boolean; onClose: () => void; onShowOnMap?: () => void }) {
  const { visits, toast } = useStore();
  const fromPins = useMemo(() => countVisits(visitsInTrack(track, visits)), [track, visits]);
  const [at, setAt] = useState(() => toLocalInput(new Date(track.recordedAt ?? track.startedAt)));
  const [c, setC] = useState<SalesCounts>(() => track.counts ?? fromPins);
  const [memo, setMemo] = useState(track.memo);

  const save = async () => {
    await saveTrack({ ...track, recordedAt: new Date(at).toISOString(), counts: c, memo: memo.trim() });
    toast(track.counts ? '足跡の記録を更新しました' : '足跡の営業記録を保存しました');
    onClose();
  };

  const remove = async () => {
    if (!window.confirm(`「${trackName(track)}」の足跡を削除しますか?(ピンの訪問記録は残ります)`)) return;
    await deleteTrack(track.id);
    toast('足跡を削除しました');
    onClose();
  };

  return (
    <BottomSheet
      title={justFinished ? '足跡記録を終了しました' : '足跡の営業記録'}
      onClose={onClose}
      tall
      footer={<button className="btn btn-primary btn-block btn-lg" onClick={save}>{track.counts ? '更新' : '保存'}</button>}
    >
      <p className="track-info">
        👣 {formatDuration(trackEndMs(track) - Date.parse(track.startedAt))} ・ {formatDistance(track.distanceM)}
        {onShowOnMap && track.points.length > 0 && (
          <button className="link-btn" onClick={onShowOnMap}>地図で足跡を見る</button>
        )}
      </p>
      {track.points.length === 0 && <div className="alert alert-warn" style={{ marginBottom: 12 }}>位置が記録できませんでした(移動が少ない・電波が弱いなど)</div>}
      <SalesRecordFields
        at={at}
        onAt={setAt}
        counts={c}
        onCounts={setC}
        memo={memo}
        onMemo={setMemo}
        fromPins={fromPins}
        fromPinsLabel="この足跡の時間のピンの記録"
      />
      <button className="link-btn danger" onClick={remove}>この足跡を削除</button>
    </BottomSheet>
  );
}

/** 足跡の一覧と記録開始 */
export function TrackListSheet({
  onClose, onStart, onOpen,
}: { onClose: () => void; onStart: () => void; onOpen: (t: Track) => void }) {
  const { tracks, visits, recordingTrack } = useStore();
  return (
    <BottomSheet title="足跡" onClose={onClose} tall>
      {!recordingTrack && (
        <button className="btn btn-primary btn-block btn-lg" onClick={onStart}>👣 足跡記録を開始</button>
      )}
      <p className="muted small">
        開始してから終了するまでの移動を記録し、終了したら範囲記録と同じ項目(日時・訪問・話ができた・再訪予約・成約・メモ)で営業記録を保存します。
        記録中は画面を消さないようにします(画面を消したり別のアプリを開いている間は、位置を記録できないことがあります)。
      </p>
      <ul className="track-list">
        {tracks.map((t) => {
          const c = trackCounts(t, visits);
          return (
            <li key={t.id}>
              <button onClick={() => onOpen(t)}>
                <div className="track-list-head">
                  <b>{formatDateTime(t.recordedAt ?? t.startedAt)}</b>
                  <span className="muted small">{formatDuration(trackEndMs(t) - Date.parse(t.startedAt))} ・ {formatDistance(t.distanceM)}</span>
                </div>
                <div className="small">
                  訪問{c.visited} ・ 話{c.talked} ・ 再訪{c.revisit} ・ {c.contract > 0 ? <b className="good-text">成約{c.contract}</b> : '成約0'}
                  {!t.counts && <span className="muted">(未保存)</span>}
                </div>
                {t.memo && <div className="small track-memo">{t.memo}</div>}
              </button>
            </li>
          );
        })}
        {!tracks.length && <li className="muted small">まだ足跡はありません</li>}
      </ul>
    </BottomSheet>
  );
}
