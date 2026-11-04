import { useMemo } from 'react';
import { pct, rates } from '../lib/records';
import { CLASS_COLORS, ageRangeLabel } from '../lib/score';
import { useStore } from '../store';
import type { Visit } from '../types';

export function RankingPage() {
  const { activeGroup, activeRegion, regions, settings, pins, visitsByPin, requestFocusArea } = useStore();

  const byArea = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const p of pins) {
      if (!p.areaKey) continue;
      const vs = visitsByPin.get(p.id) ?? [];
      m.set(p.areaKey, [...(m.get(p.areaKey) ?? []), ...vs]);
    }
    return m;
  }, [pins, visitsByPin]);

  const regionName = (code: string) => regions.find((r) => r.code === code)?.name ?? '';
  const scopeLabel = settings.scope === 'all' ? '読み込み済みの全地域' : activeRegion?.name ?? '';

  if (!activeGroup) return <div className="page"><p className="muted">地域データがありません。設定から地域を追加してください。</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h2>ランキング</h2>
        <p className="muted small">
          {scopeLabel} ・ 狙う年齢 {ageRangeLabel(settings.ageFrom, settings.ageTo)} ・ {activeGroup.ranked.length}町丁目
        </p>
      </div>
      <ol className="rank-list">
        {activeGroup.ranked.map((a) => {
          const r = rates(byArea.get(a.key) ?? []);
          return (
            <li key={a.key}>
              <button className="rank-row" onClick={() => requestFocusArea(a.key)}>
                <span className="rank-no">{a.rank}</span>
                <span className="rank-score" style={{ background: CLASS_COLORS[a.cls ?? 0], color: (a.cls ?? 0) >= 3 ? '#fff' : '#1f2937' }}>
                  {Math.round(a.score!)}
                </span>
                <span className="rank-body">
                  <span className="rank-name">
                    {a.name}
                    {settings.scope === 'all' && <small> {regionName(a.regionCode)}</small>}
                  </span>
                  <span className="rank-reason">{a.reason}</span>
                  <span className="rank-stats">
                    訪問 {r.visits}件 ・ 在宅率 {pct(r.homeRate)}
                  </span>
                </span>
                <span className="rank-go">›</span>
              </button>
            </li>
          );
        })}
      </ol>
      {activeGroup.insufficient.length > 0 && (
        <details className="insufficient">
          <summary>データ不足でランキング対象外({activeGroup.insufficient.length})</summary>
          <ul>
            {activeGroup.insufficient.map((a) => (
              <li key={a.key}>
                <button className="link-btn" onClick={() => requestFocusArea(a.key)}>{a.name}</button>
                <small className="muted"> {a.insufficientReason}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
