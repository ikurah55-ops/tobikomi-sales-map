import { useMemo } from 'react';
import { pct, rates } from '../lib/records';
import { CLASS_COLORS, INDICATOR_KEYS, INDICATOR_LABEL, ageRangeLabel, formatIndicator } from '../lib/score';
import { useStore } from '../store';
import { BottomSheet } from './ui';

export function AreaSheet({ areaKey, onClose }: { areaKey: string; onClose: () => void }) {
  const { scoreByKey, activeGroup, avgLabel, settings, pins, visitsByPin } = useStore();
  const a = scoreByKey.get(areaKey);

  const stats = useMemo(() => {
    const vs = pins.filter((p) => p.areaKey === areaKey).flatMap((p) => visitsByPin.get(p.id) ?? []);
    return { pins: pins.filter((p) => p.areaKey === areaKey).length, ...rates(vs) };
  }, [pins, visitsByPin, areaKey]);

  if (!a) return null;
  const avg = activeGroup?.averages;

  return (
    <BottomSheet
      onClose={onClose}
      title={
        <span>
          {a.name}
          {a.score != null && <small>{a.rank}位 / {a.rankTotal}</small>}
        </span>
      }
    >
      {a.insufficient || a.score == null ? (
        <div className="alert alert-info">データ不足のためランキング対象外です({a.insufficientReason ?? '指標を計算できません'})</div>
      ) : (
        <div className="score-hero">
          <div className="score-big" style={{ background: CLASS_COLORS[a.cls ?? 0], color: (a.cls ?? 0) >= 3 ? '#fff' : '#1f2937' }}>
            {Math.round(a.score)}
            <span>点</span>
          </div>
          <div className="score-reason">{a.reason}</div>
        </div>
      )}

      <table className="ind-table">
        <thead>
          <tr>
            <th>指標</th>
            <th>この町</th>
            <th>{avgLabel}平均</th>
          </tr>
        </thead>
        <tbody>
          {INDICATOR_KEYS.map((k) => {
            const v = a.values[k];
            const m = avg?.[k] ?? null;
            const ratio = v != null && m != null && m > 0 && k !== 'growth' ? v / m : null;
            return (
              <tr key={k}>
                <td>
                  {INDICATOR_LABEL[k]}
                  {k === 'age' && <small>({ageRangeLabel(settings.ageFrom, settings.ageTo)})</small>}
                  {a.pct[k] != null && (
                    <div className="pct-bar"><span style={{ width: `${a.pct[k]}%` }} /></div>
                  )}
                </td>
                <td className={ratio != null ? (ratio >= 1.1 ? 'up' : ratio <= 0.9 ? 'down' : '') : ''}>
                  {formatIndicator(k, v)}
                  {ratio != null && <small>{ratio.toFixed(1)}倍</small>}
                </td>
                <td>{formatIndicator(k, m)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">バーは{avgLabel}内での順位(右ほど上位)。人口増加率は2015→2020年、境界が変わった町丁目は「—」。</p>

      <h4 className="sub-head">この町丁目での実績</h4>
      {stats.visits === 0 ? (
        <p className="muted">まだ訪問記録がありません</p>
      ) : (
        <div className="mini-stats">
          <div><b>{stats.pins}</b>軒</div>
          <div><b>{stats.visits}</b>回訪問</div>
          <div>在宅率 <b>{pct(stats.homeRate)}</b></div>
          <div>会話率 <b>{pct(stats.talkRate)}</b></div>
          <div>アポ率 <b>{pct(stats.apptRate)}</b></div>
        </div>
      )}
    </BottomSheet>
  );
}
