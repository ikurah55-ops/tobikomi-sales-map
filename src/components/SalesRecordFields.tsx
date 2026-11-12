import { APPOINTED, TALKED } from '../lib/records';
import type { SalesCounts, Visit } from '../types';
import { Field, PRIVACY_NOTE } from './ui';

export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const EMPTY_COUNTS: SalesCounts = { visited: 0, talked: 0, revisit: 0, contract: 0 };

const COUNTS: { key: keyof SalesCounts; label: string }[] = [
  { key: 'visited', label: '訪問した件数' },
  { key: 'talked', label: '話ができた件数' },
  { key: 'revisit', label: '再訪の予約ができた件数' },
  { key: 'contract', label: '成約した件数' },
];

/** ピンの訪問記録から件数を数える(再訪予約 = アポ獲得・成約) */
export function countVisits(vs: Visit[]): SalesCounts {
  const r = { ...EMPTY_COUNTS };
  for (const v of vs) {
    r.visited++;
    if (v.presence !== 'home' || !v.reaction) continue;
    if (TALKED.includes(v.reaction)) r.talked++;
    if (APPOINTED.includes(v.reaction)) r.revisit++;
    if (v.reaction === 'contract') r.contract++;
  }
  return r;
}

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

/** 範囲記録・足跡で共通の入力欄: 日時、4つの件数、メモ */
export function SalesRecordFields({
  at, onAt, counts, onCounts, memo, onMemo, fromPins, fromPinsLabel,
}: {
  at: string;
  onAt: (v: string) => void;
  counts: SalesCounts;
  onCounts: (c: SalesCounts) => void;
  memo: string;
  onMemo: (v: string) => void;
  fromPins?: SalesCounts;
  fromPinsLabel?: string;
}) {
  const warn = counts.talked > counts.visited || counts.revisit > counts.visited || counts.contract > counts.visited;
  return (
    <>
      <Field label="日時">
        <input type="datetime-local" className="input" value={at} onChange={(e) => onAt(e.target.value)} />
      </Field>
      {COUNTS.map(({ key, label }) => (
        <Field key={key} label={label}>
          <Counter value={counts[key]} onChange={(n) => onCounts({ ...counts, [key]: n })} />
        </Field>
      ))}
      {warn && <div className="alert alert-warn">話ができた・再訪予約・成約の件数が、訪問した件数より多くなっています</div>}
      {fromPins && fromPins.visited > 0 && (
        <button className="link-btn" onClick={() => onCounts(fromPins)}>
          {fromPinsLabel}から入れる: 訪問{fromPins.visited}・話{fromPins.talked}・再訪{fromPins.revisit}・成約{fromPins.contract}
        </button>
      )}
      <Field label="メモ" hint="任意">
        <textarea className="input" rows={2} value={memo} onChange={(e) => onMemo(e.target.value)} placeholder="例: 団地の3〜5号棟。昼は不在が多い" />
        <p className="privacy-note">{PRIVACY_NOTE}</p>
      </Field>
    </>
  );
}
