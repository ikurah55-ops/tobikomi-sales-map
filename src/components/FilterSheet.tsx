import { DEFAULT_FILTER, STATUS_COLOR, STATUS_LABEL } from '../lib/records';
import { useStore } from '../store';
import type { PinFilter, PinStatus } from '../types';
import { BottomSheet, Choice, Field, Toggle } from './ui';

const STATUSES: PinStatus[] = ['success', 'talked', 'notmet', 'rejected', 'blocked'];

export function FilterSheet({ onClose, shown, total, areaCount }: { onClose: () => void; shown: number; total: number; areaCount: number }) {
  const { settings, updateSettings, areaRecords } = useStore();
  const f = settings.filter;
  const set = (p: Partial<PinFilter>) => updateSettings({ filter: { ...f, ...p } });

  const toggleStatus = (s: PinStatus) =>
    set({ statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });

  return (
    <BottomSheet
      title={<span>絞り込み・表示 <small>ピン {shown} / {total} 件</small></span>}
      onClose={onClose}
      footer={
        <div className="row-gap">
          <button className="btn btn-outline" onClick={() => set(DEFAULT_FILTER)}>リセット</button>
          <button className="btn btn-primary grow" onClick={onClose}>閉じる</button>
        </div>
      }
    >
      <h4 className="sub-head" style={{ marginTop: 0 }}>ピン</h4>
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

      <h4 className="sub-head">範囲記録</h4>
      <Toggle
        checked={f.showAreaRecords}
        onChange={(v) => set({ showAreaRecords: v })}
        label={<>範囲の営業記録を表示 <small className="muted">{f.showAreaRecords ? `${areaCount} / ${areaRecords.length}件` : `${areaRecords.length}件`}</small></>}
      />
      <Field label="期間(範囲記録の日付)">
        <Choice
          cols={5}
          value={f.recordPeriod}
          onChange={(v) => set({ recordPeriod: v ?? 'all' })}
          disabled={!f.showAreaRecords}
          options={[
            { value: 'all', label: '全期間' }, { value: 'today', label: '今日' }, { value: 'week', label: '今週' },
            { value: 'month', label: '今月' }, { value: '3months', label: '3か月' },
          ]}
        />
      </Field>
      <p className="muted small">範囲記録はオレンジの点線で出ます。タップすると内容を見たり編集できます。</p>
    </BottomSheet>
  );
}
