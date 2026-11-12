import { useMemo, useState } from 'react';
import { deleteAreaRecord, newId, saveAreaRecord } from '../data/repository';
import { inRing } from '../lib/geo';
import { todayStr } from '../lib/records';
import { useStore } from '../store';
import type { AreaRecord, SalesCounts } from '../types';
import { SalesRecordFields, countVisits, toLocalInput } from './SalesRecordFields';
import { BottomSheet } from './ui';

/** 囲んだ範囲の営業記録(新規・編集) */
export function AreaRecordSheet({
  record, polygon, onClose,
}: { record?: AreaRecord; polygon: [number, number][]; onClose: () => void }) {
  const { toast, pins, visitsByPin } = useStore();
  const [at, setAt] = useState(() => toLocalInput(record ? new Date(record.recordedAt) : new Date()));
  const [c, setC] = useState<SalesCounts>({
    visited: record?.visited ?? 0,
    talked: record?.talked ?? 0,
    revisit: record?.revisit ?? 0,
    contract: record?.contract ?? 0,
  });
  const [memo, setMemo] = useState(record?.memo ?? '');

  // 範囲の中にあるピンの、選んだ日の訪問記録から数える
  const day = at.slice(0, 10);
  const fromPins = useMemo(() => {
    const ring = polygon.map(([lat, lng]) => [lng, lat]);
    const vs = pins
      .filter((p) => inRing(p.lng, p.lat, ring))
      .flatMap((p) => (visitsByPin.get(p.id) ?? []).filter((v) => todayStr(new Date(v.visitedAt)) === day));
    return countVisits(vs);
  }, [polygon, pins, visitsByPin, day]);

  const save = async () => {
    const now = new Date().toISOString();
    await saveAreaRecord({
      id: record?.id ?? newId(),
      polygon,
      recordedAt: new Date(at).toISOString(),
      ...c,
      memo: memo.trim(),
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
    });
    toast(record ? '範囲の記録を更新しました' : '範囲の営業記録を保存しました');
    onClose();
  };

  const remove = async () => {
    if (!record || !window.confirm('この範囲の記録を削除しますか?')) return;
    await deleteAreaRecord(record.id);
    toast('範囲の記録を削除しました');
    onClose();
  };

  return (
    <BottomSheet
      title={record ? '範囲の営業記録' : '囲んだ範囲の営業記録'}
      onClose={onClose}
      tall
      footer={<button className="btn btn-primary btn-block btn-lg" onClick={save}>{record ? '更新' : '保存'}</button>}
    >
      <SalesRecordFields
        at={at}
        onAt={setAt}
        counts={c}
        onCounts={setC}
        memo={memo}
        onMemo={setMemo}
        fromPins={fromPins}
        fromPinsLabel={`この範囲のピンの記録(${day.slice(5).replace('-', '/')})`}
      />
      {record && <button className="link-btn danger" onClick={remove}>この範囲の記録を削除</button>}
    </BottomSheet>
  );
}
