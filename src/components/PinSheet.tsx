import { useState } from 'react';
import { deletePin, deleteVisit, savePin } from '../data/repository';
import {
  COMPETITOR_LABEL, HOUSING_LABEL, PRESENCE_LABEL, REACTION_LABEL, STATUS_COLOR, STATUS_LABEL, WEATHER_ICON,
  formatDateTime, isRevisitDue, pinStatus, visitHint,
} from '../lib/records';
import { useStore } from '../store';
import type { HousingType, Pin, Visit } from '../types';
import { BottomSheet, Choice, Field, PRIVACY_NOTE, Toggle } from './ui';

export function PinSheet({
  pin, onClose, onAddVisit, onEditVisit,
}: { pin: Pin; onClose: () => void; onAddVisit: () => void; onEditVisit: (v: Visit) => void }) {
  const { visitsByPin, scoreByKey, toast } = useStore();
  const visits = visitsByPin.get(pin.id) ?? [];
  const status = pinStatus(pin, visits);
  const hint = visitHint(visits);
  const area = pin.areaKey ? scoreByKey.get(pin.areaKey) : undefined;
  const [label, setLabel] = useState(pin.label);

  const patch = (p: Partial<Pin>) => savePin({ ...pin, ...p });

  const addVisit = () => {
    if (pin.noRevisit && !window.confirm('この家は「再訪禁止」です。それでも訪問記録を追加しますか?')) return;
    onAddVisit();
  };

  const removePin = async () => {
    if (!window.confirm(`このピンと訪問記録${visits.length}件を削除します。元に戻せません。よろしいですか?`)) return;
    await deletePin(pin.id);
    toast('ピンを削除しました');
    onClose();
  };

  const removeVisit = async (v: Visit) => {
    if (!window.confirm(`${formatDateTime(v.visitedAt)} の記録を削除しますか?`)) return;
    await deleteVisit(v.id);
  };

  return (
    <BottomSheet
      tall
      onClose={onClose}
      title={
        <span className="pin-title">
          <span className="status-dot" style={{ background: STATUS_COLOR[status] }} />
          {pin.label || (pin.housingType ? HOUSING_LABEL[pin.housingType] : '訪問先')}
          <small>{pin.areaName ?? '地域データ外'}{area?.score != null ? ` ・${Math.round(area.score)}点` : ''}</small>
        </span>
      }
      footer={
        <button className={`btn btn-block btn-lg ${pin.noRevisit ? 'btn-muted' : 'btn-primary'}`} onClick={addVisit}>
          ＋ 訪問を記録
        </button>
      }
    >
      {pin.noRevisit && <div className="alert alert-bad">⚠ 再訪禁止の家です。訪問しないでください</div>}
      {isRevisitDue(pin) && <div className="alert alert-info">📅 再訪予定日です({pin.revisitDate})</div>}

      <div className="status-line">
        状態: <b style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</b> ・ 訪問 {visits.length} 回
      </div>

      {(hint.away.length > 0 || hint.home.length > 0) && (
        <div className="hint-box">
          {hint.away.length > 0 && <div>🚪 不在だった時間帯: <b>{hint.away.join('、')}</b></div>}
          {hint.home.length > 0 && <div>🏠 在宅だった時間帯: <b>{hint.home.join('、')}</b></div>}
          {hint.suggestion && <div className="hint-suggest">💡 {hint.suggestion}</div>}
        </div>
      )}

      <h4 className="sub-head">訪問の履歴</h4>
      {visits.length === 0 && <p className="muted">まだ記録がありません</p>}
      <ul className="visit-list">
        {[...visits].reverse().map((v) => (
          <li key={v.id}>
            <div className="visit-main">
              <span className="visit-date">{formatDateTime(v.visitedAt)}</span>
              <span className={`tag ${v.presence === 'home' ? 'tag-good' : 'tag-warn'}`}>{PRESENCE_LABEL[v.presence]}</span>
              {v.reaction && <span className="tag">{REACTION_LABEL[v.reaction]}</span>}
              {v.weather && <span>{WEATHER_ICON[v.weather]}</span>}
            </div>
            {(v.competitor || v.memo) && (
              <div className="visit-sub">
                {v.competitor && <span>他社: {COMPETITOR_LABEL[v.competitor]}</span>}
                {v.memo && <span className="visit-memo">{v.memo}</span>}
              </div>
            )}
            <div className="visit-actions">
              <button className="link-btn" onClick={() => onEditVisit(v)}>編集</button>
              <button className="link-btn danger" onClick={() => removeVisit(v)}>削除</button>
            </div>
          </li>
        ))}
      </ul>

      <h4 className="sub-head">家の情報</h4>
      <Field label="住居の種類">
        <Choice
          cols={4}
          allowClear
          value={pin.housingType}
          onChange={(v) => patch({ housingType: v })}
          options={(Object.keys(HOUSING_LABEL) as HousingType[]).map((k) => ({ value: k, label: HOUSING_LABEL[k] }))}
        />
      </Field>
      <Field label="呼び名">
        <input
          className="input"
          value={label}
          maxLength={40}
          placeholder="例: 青い屋根"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== pin.label && patch({ label: label.trim() })}
        />
        <p className="privacy-note">{PRIVACY_NOTE}</p>
      </Field>
      <Field label="再訪予定日">
        <input
          type="date"
          className="input"
          value={pin.revisitDate ?? ''}
          disabled={pin.noRevisit}
          onChange={(e) => patch({ revisitDate: e.target.value || null })}
        />
      </Field>
      <Toggle checked={pin.noRevisit} onChange={(v) => patch({ noRevisit: v, revisitDate: v ? null : pin.revisitDate })} label="再訪禁止" />

      <button className="btn btn-danger-outline btn-block" style={{ marginTop: 20 }} onClick={removePin}>
        このピンを削除
      </button>
    </BottomSheet>
  );
}
