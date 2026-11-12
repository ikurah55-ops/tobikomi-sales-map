import { useMemo, useState } from 'react';
import { AreaRecordSheet } from '../components/AreaRecordSheet';
import { VisitDetailSheet } from '../components/VisitDetailSheet';
import { VisitForm } from '../components/VisitForm';
import { HOUSING_LABEL, PRESENCE_LABEL, REACTION_LABEL, WEATHER_ICON, weekdayLabel } from '../lib/records';
import { useStore } from '../store';
import type { AreaRecord, Pin, Visit } from '../types';

type Kind = 'all' | 'pin' | 'area';
type Item =
  | { kind: 'pin'; at: string; visit: Visit; pin: Pin | undefined }
  | { kind: 'area'; at: string; record: AreaRecord };

const PAGE = 60;

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const base = `${d.getMonth() + 1}/${d.getDate()}(${weekdayLabel(d.getDay())})`;
  if (dayKey(iso) === dayKey(today.toISOString())) return `今日 ${base}`;
  if (dayKey(iso) === dayKey(y.toISOString())) return `昨日 ${base}`;
  return d.getFullYear() === today.getFullYear() ? base : `${d.getFullYear()}年 ${base}`;
};
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 履歴: ピンの訪問記録と範囲記録を新しい順にカードで並べる */
export function HistoryPage() {
  const { visits, pins, areaRecords, requestMapFocus } = useStore();
  const [kind, setKind] = useState<Kind>('all');
  const [limit, setLimit] = useState(PAGE);
  const [openVisit, setOpenVisit] = useState<string | null>(null);
  const [editVisit, setEditVisit] = useState<{ pin: Pin; visit: Visit } | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);

  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);
  const items = useMemo(() => {
    const list: Item[] = [];
    if (kind !== 'area') for (const v of visits) list.push({ kind: 'pin', at: v.visitedAt, visit: v, pin: pinById.get(v.pinId) });
    if (kind !== 'pin') for (const r of areaRecords) list.push({ kind: 'area', at: r.recordedAt, record: r });
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [visits, areaRecords, pinById, kind]);

  const shown = items.slice(0, limit);
  const visitNow = openVisit ? visits.find((v) => v.id === openVisit) ?? null : null;
  const areaNow = openArea ? areaRecords.find((r) => r.id === openArea) ?? null : null;

  let lastDay = '';
  return (
    <div className="page">
      <div className="page-head">
        <h2>履歴</h2>
        <div className="seg">
          {([['all', 'すべて'], ['pin', 'ピン'], ['area', '範囲']] as const).map(([k, l]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setLimit(PAGE); }}>{l}</button>
          ))}
        </div>
      </div>

      {items.length === 0 && <p className="muted empty">まだ営業記録がありません。地図でピンを立てるか、「✍️ 範囲」で記録すると、ここに並びます。</p>}

      <ul className="history-list">
        {shown.map((it) => {
          const day = dayKey(it.at);
          const head = day !== lastDay ? <li className="history-day" key={`d-${day}`}>{dayLabel(it.at)}</li> : null;
          lastDay = day;
          if (it.kind === 'pin') {
            const { visit: v, pin: p } = it;
            const home = v.presence === 'home';
            return [
              head,
              <li key={v.id}>
                <button className="history-card" onClick={() => setOpenVisit(v.id)}>
                  <span className="hc-kind hc-pin">📍 ピン</span>
                  <span className="hc-time">{timeLabel(v.visitedAt)}</span>
                  <div className="hc-title">
                    {p?.label || (p?.housingType ? HOUSING_LABEL[p.housingType] : '訪問先')}
                    <small>{p?.areaName ?? '地域データ外'}</small>
                  </div>
                  <div className="hc-tags">
                    <span className={`tag ${home ? 'tag-good' : 'tag-warn'}`}>{PRESENCE_LABEL[v.presence]}</span>
                    {v.reaction && <span className={`tag${v.reaction === 'appointment' || v.reaction === 'contract' ? ' tag-good' : ''}`}>{REACTION_LABEL[v.reaction]}</span>}
                    {v.weather && <span>{WEATHER_ICON[v.weather]}</span>}
                  </div>
                  {v.memo && <div className="hc-memo">{v.memo}</div>}
                </button>
              </li>,
            ];
          }
          const r = it.record;
          return [
            head,
            <li key={r.id}>
              <button className="history-card" onClick={() => setOpenArea(r.id)}>
                <span className="hc-kind hc-area">✍️ 範囲</span>
                <span className="hc-time">{timeLabel(r.recordedAt)}</span>
                <div className="hc-counts">
                  <span><b>{r.visited}</b>訪問</span>
                  <span><b>{r.talked}</b>話</span>
                  <span><b>{r.revisit}</b>再訪予約</span>
                  <span className={r.contract > 0 ? 'good' : ''}><b>{r.contract}</b>成約</span>
                </div>
                {r.memo && <div className="hc-memo">{r.memo}</div>}
              </button>
            </li>,
          ];
        })}
      </ul>
      {items.length > limit && (
        <button className="btn btn-outline btn-block" onClick={() => setLimit((n) => n + PAGE)}>もっと見る(残り {items.length - limit}件)</button>
      )}

      {visitNow && !editVisit && (
        <VisitDetailSheet
          visit={visitNow}
          pin={pinById.get(visitNow.pinId)}
          onClose={() => setOpenVisit(null)}
          onEdit={(pin) => setEditVisit({ pin, visit: visitNow })}
          onShowOnMap={(pin) => { setOpenVisit(null); requestMapFocus({ kind: 'pin', id: pin.id }); }}
        />
      )}
      {editVisit && <VisitForm target={{ kind: 'edit', pin: editVisit.pin, visit: editVisit.visit }} onClose={() => setEditVisit(null)} />}
      {areaNow && (
        <AreaRecordSheet
          key={areaNow.id}
          record={areaNow}
          polygon={areaNow.polygon}
          onClose={() => setOpenArea(null)}
          onShowOnMap={() => { setOpenArea(null); requestMapFocus({ kind: 'area', id: areaNow.id }); }}
        />
      )}
    </div>
  );
}
