import { useMemo, useState } from 'react';
import { newId, savePinWithVisit, saveVisit } from '../data/repository';
import { HOUSING_LABEL, todayStr } from '../lib/records';
import { useStore } from '../store';
import type { Competitor, HousingType, Pin, Presence, Reaction, Visit, Weather } from '../types';
import { BottomSheet, Choice, Field, PRIVACY_NOTE, Toggle, type Option } from './ui';

export type VisitFormTarget =
  | { kind: 'new'; lat: number; lng: number; regionCode: string | null; areaKey: string | null; areaName: string | null; source: 'gps' | 'press' }
  | { kind: 'add'; pin: Pin }
  | { kind: 'edit'; pin: Pin; visit: Visit };

const PRESENCE_OPTS: Option<Presence>[] = [
  { value: 'home', label: '在宅', tone: 'good' },
  { value: 'away', label: '不在', tone: 'warn' },
  { value: 'noanswer', label: '応答なし', tone: 'warn' },
];
const REACTION_OPTS: Option<Reaction>[] = [
  { value: 'listened', label: '話を聞いて\nくれた', tone: 'info' },
  { value: 'material', label: '資料を\n渡した', tone: 'info' },
  { value: 'appointment', label: 'アポ獲得', tone: 'good' },
  { value: 'contract', label: '成約', tone: 'good' },
  { value: 'rejected', label: '断られた', tone: 'warn' },
  { value: 'refusal', label: '訪問お断り\nの意思表示', tone: 'bad' },
];
const COMPETITOR_OPTS: Option<Competitor>[] = [
  { value: 'yes', label: '来ていた' },
  { value: 'no', label: '来ていない' },
  { value: 'unknown', label: '不明' },
];
const WEATHER_OPTS: Option<Weather>[] = [
  { value: 'sunny', label: '☀️ 晴れ' },
  { value: 'cloudy', label: '☁️ くもり' },
  { value: 'rain', label: '☔ 雨' },
  { value: 'snow', label: '❄️ 雪' },
];
const HOUSING_OPTS: Option<HousingType>[] = (Object.keys(HOUSING_LABEL) as HousingType[]).map((k) => ({ value: k, label: HOUSING_LABEL[k] }));

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayStr(d);
};

export function VisitForm({
  target, onClose, onRegisterParking,
}: { target: VisitFormTarget; onClose: () => void; onRegisterParking?: () => void }) {
  const { visits, toast } = useStore();
  const editing = target.kind === 'edit' ? target.visit : null;
  const pin = target.kind === 'new' ? null : target.pin;

  // 天気は今日の直前の記録を引き継ぐ
  const lastWeatherToday = useMemo(() => {
    const today = todayStr();
    for (let i = visits.length - 1; i >= 0; i--) {
      const v = visits[i];
      if (todayStr(new Date(v.visitedAt)) !== today) break;
      if (v.weather) return v.weather;
    }
    return null;
  }, [visits]);

  const [presence, setPresence] = useState<Presence | null>(editing?.presence ?? null);
  const [reaction, setReaction] = useState<Reaction | null>(editing?.reaction ?? null);
  const [competitor, setCompetitor] = useState<Competitor | null>(editing?.competitor ?? null);
  const [weather, setWeather] = useState<Weather | null>(editing ? editing.weather : lastWeatherToday);
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [visitedAt, setVisitedAt] = useState(() => toLocalInput(editing ? new Date(editing.visitedAt) : new Date()));
  const [editTime, setEditTime] = useState(false);
  const [housing, setHousing] = useState<HousingType | null>(pin?.housingType ?? null);
  const [label, setLabel] = useState(pin?.label ?? '');
  const [revisitDate, setRevisitDate] = useState<string | null>(pin?.revisitDate ?? null);
  const [noRevisit, setNoRevisit] = useState(pin?.noRevisit ?? false);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const isHome = presence === 'home';
  const needReaction = isHome && !reaction;
  const canSave = !!presence && !needReaction && !saving;

  const pickReaction = (r: Reaction | null) => {
    setReaction(r);
    if (r === 'refusal') {
      setNoRevisit(true);
      setRevisitDate(null);
    }
  };

  const save = async () => {
    if (!presence || !canSave) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const blocked = noRevisit || reaction === 'refusal';
      const visit: Visit = {
        id: editing?.id ?? newId(),
        pinId: pin?.id ?? '',
        visitedAt: new Date(visitedAt).toISOString(),
        presence,
        reaction: isHome ? reaction : null,
        competitor,
        weather,
        memo: memo.trim(),
        createdAt: editing?.createdAt ?? now,
      };
      const pinFields = { housingType: housing, label: label.trim(), noRevisit: blocked, revisitDate: blocked ? null : revisitDate };
      if (target.kind === 'new') {
        const newPin: Pin = {
          id: newId(), lat: target.lat, lng: target.lng, regionCode: target.regionCode, areaKey: target.areaKey,
          areaName: target.areaName, createdAt: now, updatedAt: now, ...pinFields,
        };
        visit.pinId = newPin.id;
        await savePinWithVisit(newPin, visit);
      } else {
        await saveVisit(visit, pinFields);
      }
      toast(reaction === 'refusal' && !pin?.noRevisit ? '保存しました(再訪禁止にしました)' : '保存しました');
      onClose();
    } catch (e) {
      toast(`保存できませんでした: ${(e as Error).message}`);
      setSaving(false);
    }
  };

  const title =
    target.kind === 'new' ? (
      <>
        新しい訪問 <small>{target.areaName ?? '地域データ外'}{target.source === 'press' ? '(長押しの位置)' : ''}</small>
      </>
    ) : target.kind === 'add' ? (
      <>訪問を記録 <small>{target.pin.label || target.pin.areaName || ''}</small></>
    ) : (
      '訪問記録を編集'
    );

  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      tall
      footer={
        <button className="btn btn-primary btn-block btn-lg" disabled={!canSave} onClick={save}>
          {!presence ? '在宅/不在を選んでください' : needReaction ? '反応を選んでください' : '保存'}
        </button>
      }
    >
      {target.kind === 'new' && onRegisterParking && (
        <button className="link-btn parking-link" onClick={onRegisterParking}>
          🅿 訪問ではなく、ここを「使える駐車場」として登録
        </button>
      )}
      <div className="when-row">
        {editTime ? (
          <input type="datetime-local" className="input" value={visitedAt} onChange={(e) => setVisitedAt(e.target.value)} />
        ) : (
          <>
            <span>🕒 {visitedAt.replace('T', ' ').replace(/-/g, '/')}</span>
            <button className="link-btn" onClick={() => setEditTime(true)}>日時を変更</button>
          </>
        )}
      </div>

      {pin?.noRevisit && target.kind !== 'edit' && <div className="alert alert-bad">⚠ 再訪禁止の家です</div>}

      <Field label="在宅">
        <Choice options={PRESENCE_OPTS} value={presence} onChange={setPresence} />
      </Field>

      <Field label="反応" hint={!isHome && presence ? '不在のときは省略できます' : undefined}>
        <Choice options={REACTION_OPTS} value={isHome ? reaction : null} onChange={pickReaction} disabled={!isHome} />
      </Field>

      <Field label="他社の営業">
        <Choice options={COMPETITOR_OPTS} value={competitor} onChange={setCompetitor} allowClear />
      </Field>

      <Field label="天気" hint={lastWeatherToday && !editing ? '今日の前回の記録から' : undefined}>
        <Choice options={WEATHER_OPTS} value={weather} onChange={setWeather} cols={4} allowClear />
      </Field>

      {target.kind === 'new' && (
        <Field label="住居の種類">
          <Choice options={HOUSING_OPTS} value={housing} onChange={setHousing} cols={4} allowClear />
        </Field>
      )}

      <Field label="メモ">
        <textarea className="input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 午後なら在宅とのこと" />
        <p className="privacy-note">{PRIVACY_NOTE}</p>
      </Field>

      <button className="link-btn more-toggle" onClick={() => setMore((m) => !m)}>
        {more ? '▲ 閉じる' : '▼ 呼び名・再訪予定など'}
      </button>
      {more && (
        <div className="more-box">
          {target.kind === 'new' && (
            <Field label="呼び名" hint="任意">
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 青い屋根 / ○○アパート201" maxLength={40} />
            </Field>
          )}
          <Field label="再訪予定日">
            <div className="chips">
              {[['なし', null], ['明日', addDays(1)], ['3日後', addDays(3)], ['1週間後', addDays(7)]].map(([l, v]) => (
                <button key={l} className={`chip${revisitDate === v ? ' on' : ''}`} onClick={() => setRevisitDate(v)} disabled={noRevisit}>
                  {l}
                </button>
              ))}
              <input type="date" className="input input-sm" value={revisitDate ?? ''} onChange={(e) => setRevisitDate(e.target.value || null)} disabled={noRevisit} />
            </div>
          </Field>
          <Toggle checked={noRevisit} onChange={setNoRevisit} label="再訪禁止(訪問お断りの表示など)" />
        </div>
      )}
    </BottomSheet>
  );
}
