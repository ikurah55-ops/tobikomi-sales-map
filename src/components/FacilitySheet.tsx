import { FACILITY_LABEL } from '../data/facilities';
import { setFacilityMark } from '../data/repository';
import { distanceM } from '../lib/geo';
import { useStore } from '../store';
import type { Facility } from '../types';
import { BottomSheet } from './ui';

export function FacilitySheet({ facility: f, here, onClose }: { facility: Facility; here: { lat: number; lng: number } | null; onClose: () => void }) {
  const { facilityMarks, toast } = useStore();
  const status = facilityMarks.get(f.id)?.status ?? null;
  const dist = here ? distanceM(here.lat, here.lng, f.lat, f.lng) : null;
  const mark = async (s: 'ok' | 'hidden' | null, msg: string) => {
    await setFacilityMark({ id: f.id, name: f.n, lat: f.lat, lng: f.lng }, s);
    toast(msg);
    onClose();
  };

  return (
    <BottomSheet
      title={
        <>
          {f.n}
          {status === 'ok' && <span className="tag tag-good">使える駐車場</span>}
          <small>{FACILITY_LABEL[f.c]}</small>
        </>
      }
      onClose={onClose}
      footer={
        <div className="btn-stack">
          {status === 'ok' ? (
            <button className="btn btn-outline btn-block" onClick={() => mark(null, '登録を外しました')}>「使える駐車場」の登録を外す</button>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => mark('ok', '使える駐車場に登録しました')}>使える駐車場に登録</button>
          )}
          <button className="btn btn-danger-outline btn-block" onClick={() => mark('hidden', '地図から消しました(設定で戻せます)')}>この店を地図から消す</button>
        </div>
      }
    >
      <dl className="fac-meta">
        <dt>駐車場</dt>
        <dd>約{f.s}台(地図データの面積からの推定)</dd>
        {dist != null && (
          <>
            <dt>現在地から</dt>
            <dd>{dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`}</dd>
          </>
        )}
      </dl>
      <a className="link-btn" href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`} target="_blank" rel="noreferrer">
        Googleマップで経路を見る
      </a>
      <p className="muted small">
        店の駐車場はお客さん用です。長時間の駐車は避け、使えるか分かったら登録しておくと次から目立つ色で出ます。登録と消した店はこの端末にだけ保存されます。
      </p>
    </BottomSheet>
  );
}
