import { useMemo, useState } from 'react';
import { deleteTrack, saveTrack } from '../data/repository';
import { formatDateTime } from '../lib/records';
import { formatDistance, formatDuration, trackEndMs, trackName, trackStats, visitsInTrack } from '../lib/track';
import { useStore } from '../store';
import type { Track, TrackFeel } from '../types';
import { BottomSheet, Choice, Field, PRIVACY_NOTE, type Option } from './ui';

const FEEL_OPTS: Option<TrackFeel>[] = [
  { value: 'good', label: '😊 良かった', tone: 'good' },
  { value: 'normal', label: '😐 ふつう', tone: 'info' },
  { value: 'bad', label: '😞 いまいち', tone: 'warn' },
];
export const FEEL_ICON: Record<TrackFeel, string> = { good: '😊', normal: '😐', bad: '😞' };

/** 足跡の成果: 記録していた時間の訪問をまとめて表示し、手応えとメモを一緒に保存する */
export function TrackSheet({
  track, justFinished, onClose, onShowOnMap,
}: { track: Track; justFinished?: boolean; onClose: () => void; onShowOnMap?: () => void }) {
  const { visits, pins, toast } = useStore();
  const [title, setTitle] = useState(track.title);
  const [feel, setFeel] = useState<TrackFeel | null>(track.feel);
  const [memo, setMemo] = useState(track.memo);

  const vs = useMemo(() => visitsInTrack(track, visits), [track, visits]);
  const st = trackStats(vs);
  const areas = useMemo(() => {
    const byId = new Map(pins.map((p) => [p.id, p]));
    return [...new Set(vs.map((v) => byId.get(v.pinId)?.areaName).filter((x): x is string => !!x))];
  }, [vs, pins]);

  const save = async () => {
    await saveTrack({ ...track, title: title.trim(), feel, memo: memo.trim() });
    toast('足跡と成果を保存しました');
    onClose();
  };

  const remove = async () => {
    if (!window.confirm(`「${trackName(track)}」の足跡を削除しますか?(訪問記録は残ります)`)) return;
    await deleteTrack(track.id);
    toast('足跡を削除しました');
    onClose();
  };

  const end = new Date(trackEndMs(track));
  return (
    <BottomSheet
      title={
        <>
          {justFinished ? '足跡記録を終了しました' : trackName(track)}
          <small>
            {formatDateTime(track.startedAt)}〜{end.getHours()}:{String(end.getMinutes()).padStart(2, '0')}
          </small>
        </>
      }
      onClose={onClose}
      tall
      footer={
        <div className="btn-stack">
          <button className="btn btn-primary btn-block btn-lg" onClick={save}>成果を保存</button>
        </div>
      }
    >
      <div className="track-stats">
        <div><b>{formatDuration(trackEndMs(track) - Date.parse(track.startedAt))}</b><small>時間</small></div>
        <div><b>{formatDistance(track.distanceM)}</b><small>移動</small></div>
        <div><b>{st.visits}</b><small>訪問</small></div>
        <div><b>{st.home}</b><small>在宅</small></div>
        <div><b>{st.talked}</b><small>話せた</small></div>
        <div className={st.appointed ? 'good' : ''}><b>{st.appointed}</b><small>アポ・成約</small></div>
      </div>
      <p className="muted small">
        訪問の数は、この足跡を記録していた時間に保存した訪問記録から数えています{st.contract > 0 && `(うち成約 ${st.contract}件)`}。
        {areas.length > 0 && <><br />回った町丁目: {areas.join('、')}</>}
      </p>
      {onShowOnMap && track.points.length > 0 && (
        <button className="btn btn-outline btn-block" style={{ marginBottom: 12 }} onClick={onShowOnMap}>地図で足跡を見る</button>
      )}
      {track.points.length === 0 && <div className="alert alert-warn" style={{ marginBottom: 12 }}>位置が記録できませんでした(移動が少ない・電波が弱いなど)</div>}

      <Field label="名前" hint="任意">
        <input className="input" value={title} maxLength={40} placeholder={trackName({ ...track, title: '' })} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="手応え">
        <Choice options={FEEL_OPTS} value={feel} onChange={setFeel} allowClear />
      </Field>
      <Field label="成果・ふりかえりメモ">
        <textarea className="input" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 午後の新興住宅地は在宅が多い。次は○○方面を回る" />
        <p className="privacy-note">{PRIVACY_NOTE}</p>
      </Field>
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
        開始してから終了するまでの移動を記録し、その間に保存した訪問記録と一緒に成果としてまとめます。
        記録中は画面を消さないようにします(画面を消したり別のアプリを開いている間は、位置を記録できないことがあります)。
      </p>
      <ul className="track-list">
        {tracks.map((t) => {
          const st = trackStats(visitsInTrack(t, visits));
          return (
            <li key={t.id}>
              <button onClick={() => onOpen(t)}>
                <div className="track-list-head">
                  <b>{trackName(t)}</b>
                  {t.feel && <span>{FEEL_ICON[t.feel]}</span>}
                </div>
                <div className="muted small">
                  {formatDateTime(t.startedAt)} ・ {formatDuration(trackEndMs(t) - Date.parse(t.startedAt))} ・ {formatDistance(t.distanceM)} ・ 訪問{st.visits}件
                  {st.appointed > 0 && <b className="good-text"> ・ アポ{st.appointed}</b>}
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
