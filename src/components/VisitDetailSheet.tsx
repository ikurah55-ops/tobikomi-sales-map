import { deleteVisit } from '../data/repository';
import { COMPETITOR_LABEL, HOUSING_LABEL, PRESENCE_LABEL, REACTION_LABEL, WEATHER_LABEL, formatDateTime } from '../lib/records';
import { useStore } from '../store';
import type { Pin, Visit } from '../types';
import { BottomSheet } from './ui';

/** 履歴から開くピンの訪問記録1件の中身 */
export function VisitDetailSheet({
  visit: v, pin, onClose, onEdit, onShowOnMap,
}: { visit: Visit; pin: Pin | undefined; onClose: () => void; onEdit: (pin: Pin) => void; onShowOnMap: (pin: Pin) => void }) {
  const { visitsByPin, toast } = useStore();
  const count = pin ? visitsByPin.get(pin.id)?.length ?? 0 : 0;

  const remove = async () => {
    if (!window.confirm(`${formatDateTime(v.visitedAt)} の訪問記録を削除しますか?`)) return;
    await deleteVisit(v.id);
    toast('訪問記録を削除しました');
    onClose();
  };

  const rows: [string, string][] = [
    ['日時', formatDateTime(v.visitedAt)],
    ['場所', pin?.areaName ?? '地域データ外'],
    ['呼び名', pin?.label || '—'],
    ['住居の種類', pin?.housingType ? HOUSING_LABEL[pin.housingType] : '—'],
    ['在宅', PRESENCE_LABEL[v.presence]],
    ['反応', v.reaction ? REACTION_LABEL[v.reaction] : '—'],
    ['他社の営業', v.competitor ? COMPETITOR_LABEL[v.competitor] : '—'],
    ['天気', v.weather ? WEATHER_LABEL[v.weather] : '—'],
    ['再訪予定日', pin?.noRevisit ? '再訪禁止' : pin?.revisitDate ?? '—'],
  ];

  return (
    <BottomSheet
      title={<>ピンの訪問記録 <small>この家への訪問 {count}回</small></>}
      onClose={onClose}
      tall
      footer={
        pin && (
          <div className="row-gap">
            <button className="btn btn-outline grow" onClick={() => onShowOnMap(pin)}>地図で見る</button>
            <button className="btn btn-primary grow" onClick={() => onEdit(pin)}>編集</button>
          </div>
        )
      }
    >
      <dl className="detail-list">
        {rows.map(([k, val]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
        <div>
          <dt>メモ</dt>
          <dd className="detail-memo">{v.memo || '—'}</dd>
        </div>
      </dl>
      <button className="link-btn danger" onClick={remove}>この訪問記録を削除</button>
    </BottomSheet>
  );
}
