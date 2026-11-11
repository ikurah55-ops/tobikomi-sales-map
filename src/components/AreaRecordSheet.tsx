import { useMemo, useState } from 'react';
import { deleteAreaRecord, newId, saveAreaRecord } from '../data/repository';
import { inRing } from '../lib/geo';
import { APPOINTED, TALKED, todayStr } from '../lib/records';
import { useStore } from '../store';
import type { AreaRecord } from '../types';
import { BottomSheet, Field, PRIVACY_NOTE } from './ui';

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type CountKey = 'visited' | 'talked' | 'revisit' | 'contract';
const COUNTS: { key: CountKey; label: string }[] = [
  { key: 'visited', label: '訪問した件数' },
  { key: 'talked', label: '話ができた件数' },
  { key: 'revisit', label: '再訪の予約ができた件数' },
  { key: 'contract', label: '成約した件数' },
];

function Counter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="counter">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label="1減らす">−</button>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="1増やす">＋</button>
    </div>
  );
}

/** 囲んだ範囲の営業記録(新規・編集) */
export function AreaRecordSheet({
  record, polygon, onClose,
}: { record?: AreaRecord; polygon: [number, number][]; onClose: () => void }) {
  const { toast, pins, visitsByPin } = useStore();
  const [at, setAt] = useState(() => toLocalInput(record ? new Date(record.recordedAt) : new Date()));
  const [c, setC] = useState<Record<CountKey, number>>({
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
    const r = { visited: 0, talked: 0, revisit: 0, contract: 0 };
    for (const p of pins) {
      if (!inRing(p.lng, p.lat, ring)) continue;
      const vs = (visitsByPin.get(p.id) ?? []).filter((v) => todayStr(new Date(v.visitedAt)) === day);
      for (const v of vs) {
        r.visited++;
        if (v.presence !== 'home' || !v.reaction) continue;
        if (TALKED.includes(v.reaction)) r.talked++;
        if (APPOINTED.includes(v.reaction)) r.revisit++;
        if (v.reaction === 'contract') r.contract++;
      }
    }
    return r;
  }, [polygon, pins, visitsByPin, day]);

  const set = (k: CountKey, n: number) => setC((x) => ({ ...x, [k]: n }));
  const warn = c.talked > c.visited || c.revisit > c.visited || c.contract > c.visited;

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
      <Field label="日時">
        <input type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
      </Field>
      {COUNTS.map(({ key, label }) => (
        <Field key={key} label={label}>
          <Counter value={c[key]} onChange={(n) => set(key, n)} />
        </Field>
      ))}
      {warn && <div className="alert alert-warn">話ができた・再訪予約・成約の件数が、訪問した件数より多くなっています</div>}
      {fromPins.visited > 0 && (
        <button className="link-btn" onClick={() => setC(fromPins)}>
          この範囲のピンの記録({day.slice(5).replace('-', '/')})から入れる: 訪問{fromPins.visited}・話{fromPins.talked}・再訪{fromPins.revisit}・成約{fromPins.contract}
        </button>
      )}
      <Field label="メモ" hint="任意">
        <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 団地の3〜5号棟。昼は不在が多い" />
        <p className="privacy-note">{PRIVACY_NOTE}</p>
      </Field>
      {record && <button className="link-btn danger" onClick={remove}>この範囲の記録を削除</button>}
    </BottomSheet>
  );
}
