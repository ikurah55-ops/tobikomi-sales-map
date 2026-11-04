import { DEFAULT_FILTER, STATUS_COLOR, STATUS_LABEL } from '../lib/records';
import { useStore } from '../store';
import type { PinFilter, PinStatus } from '../types';
import { BottomSheet, Choice, Field, Toggle } from './ui';

const STATUSES: PinStatus[] = ['success', 'talked', 'notmet', 'rejected', 'blocked'];

export function FilterSheet({ onClose, shown, total }: { onClose: () => void; shown: number; total: number }) {
  const { settings, updateSettings } = useStore();
  const f = settings.filter;
  const set = (p: Partial<PinFilter>) => updateSettings({ filter: { ...f, ...p } });

  const toggleStatus = (s: PinStatus) =>
    set({ statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });

  return (
    <BottomSheet
      title={<span>ピンの絞り込み <small>{shown} / {total} 件を表示</small></span>}
      onClose={onClose}
      footer={
        <div className="row-gap">
          <button className="btn btn-outline" onClick={() => set(DEFAULT_FILTER)}>リセット</button>
          <button className="btn btn-primary grow" onClick={onClose}>閉じる</button>
        </div>
      }
    >
      <Field label="結果" hint="未選択ならすべて">
        <div className="chips">
          {STATUSES.map((s) => (
            <button key={s} className={`chip${f.statuses.includes(s) ? ' on' : ''}`} onClick={() => toggleStatus(s)}>
              <span className="status-dot" style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="最新の訪問">
        <Choice
          value={f.presence}
          onChange={(v) => set({ presence: v ?? 'all' })}
          options={[{ value: 'all', label: 'すべて' }, { value: 'home', label: '在宅' }, { value: 'away', label: '不在・応答なし' }]}
        />
      </Field>
      <Field label="他社の営業">
        <Choice
          cols={4}
          value={f.competitor}
          onChange={(v) => set({ competitor: v ?? 'all' })}
          options={[{ value: 'all', label: 'すべて' }, { value: 'yes', label: '来ていた' }, { value: 'no', label: '来ていない' }, { value: 'unknown', label: '不明' }]}
        />
      </Field>
      <Field label="期間(最新の訪問日)">
        <Choice
          cols={5}
          value={f.period}
          onChange={(v) => set({ period: v ?? 'all' })}
          options={[
            { value: 'all', label: '全期間' }, { value: 'today', label: '今日' }, { value: 'week', label: '今週' },
            { value: 'month', label: '今月' }, { value: '3months', label: '3か月' },
          ]}
        />
      </Field>
      <Toggle checked={f.revisitOnly} onChange={(v) => set({ revisitOnly: v })} label="再訪予定ありだけ表示" />
    </BottomSheet>
  );
}
