import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HOUSING_LABEL, WEATHER_LABEL, pct, periodStart, rates, weekdayLabel } from '../lib/records';
import { useStore } from '../store';
import type { HousingType, Visit, Weather } from '../types';

type Period = 'week' | 'month' | '3months' | 'all';
const PERIODS: { v: Period; l: string }[] = [
  { v: 'week', l: '今週' }, { v: 'month', l: '今月' }, { v: '3months', l: '3か月' }, { v: 'all', l: '全期間' },
];
const HOURS = Array.from({ length: 10 }, (_, i) => 9 + i); // 9時台〜18時台
const DAYS = [1, 2, 3, 4, 5]; // 月〜金

type SortKey = 'name' | 'score' | 'visits' | 'homeRate' | 'talkRate' | 'apptRate' | 'competitorRate';

export function AnalysisPage() {
  const { visits, pins, scoreByKey } = useStore();
  const [period, setPeriod] = useState<Period>('month');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'visits', desc: true });

  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);
  const vs = useMemo(() => {
    const from = periodStart(period);
    return visits.filter((v) => new Date(v.visitedAt).getTime() >= from);
  }, [visits, period]);

  const summary = useMemo(() => rates(vs), [vs]);

  const heat = useMemo(() => {
    const cells = new Map<string, { n: number; home: number }>();
    for (const v of vs) {
      const d = new Date(v.visitedAt);
      const k = `${d.getDay()}-${d.getHours()}`;
      const c = cells.get(k) ?? { n: 0, home: 0 };
      c.n++;
      if (v.presence === 'home') c.home++;
      cells.set(k, c);
    }
    return cells;
  }, [vs]);

  const areaRows = useMemo(() => {
    const m = new Map<string, { key: string; name: string; list: Visit[] }>();
    for (const v of vs) {
      const p = pinById.get(v.pinId);
      const key = p?.areaKey ?? '_none';
      const row = m.get(key) ?? { key, name: p?.areaName ?? '地域データ外', list: [] };
      row.list.push(v);
      m.set(key, row);
    }
    const rows = [...m.values()].map((r) => ({ ...r, score: scoreByKey.get(r.key)?.score ?? null, ...rates(r.list) }));
    const dir = sort.desc ? -1 : 1;
    return rows.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y as string, 'ja') : (x as number) - (y as number)) * dir;
    });
  }, [vs, pinById, scoreByKey, sort]);

  const byWeather = useMemo(() => {
    return (Object.keys(WEATHER_LABEL) as Weather[]).map((w) => {
      const r = rates(vs.filter((v) => v.weather === w));
      return { name: WEATHER_LABEL[w], 在宅率: r.homeRate != null ? Math.round(r.homeRate * 100) : null, n: r.visits };
    });
  }, [vs]);

  const byHousing = useMemo(() => {
    return (Object.keys(HOUSING_LABEL) as HousingType[]).map((h) => {
      const r = rates(vs.filter((v) => pinById.get(v.pinId)?.housingType === h));
      return {
        name: HOUSING_LABEL[h],
        在宅率: r.homeRate != null ? Math.round(r.homeRate * 100) : null,
        会話率: r.talkRate != null ? Math.round(r.talkRate * 100) : null,
        n: r.visits,
      };
    });
  }, [vs, pinById]);

  const th = (key: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))} className={sort.key === key ? 'sorted' : ''}>
      {label}{sort.key === key ? (sort.desc ? '▼' : '▲') : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h2>分析</h2>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.v} className={period === p.v ? 'on' : ''} onClick={() => setPeriod(p.v)}>{p.l}</button>
          ))}
        </div>
      </div>

      {vs.length === 0 ? (
        <p className="muted empty">この期間の訪問記録はまだありません。</p>
      ) : (
        <>
          <section className="cards">
            <Card label="総訪問数" value={`${summary.visits}`} unit="件" />
            <Card label="在宅率" value={pct(summary.homeRate)} sub={`${summary.home}/${summary.visits}`} />
            <Card label="会話率" value={pct(summary.talkRate)} sub="在宅のうち話を聞いた以上" />
            <Card label="アポ率" value={pct(summary.apptRate)} sub="在宅のうちアポ・成約" />
            <Card label="他社既訪問率" value={pct(summary.competitorRate)} sub={`判明 ${summary.competitorKnown}件中`} />
          </section>

          <section className="panel">
            <h3>曜日×時間帯の在宅率</h3>
            <p className="muted small">平日9〜18時台。件数が少ないマスは薄く表示します(上段=在宅率、下段=件数)。</p>
            <div className="heat-wrap">
              <table className="heat">
                <thead>
                  <tr>
                    <th />
                    {HOURS.map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((d) => (
                    <tr key={d}>
                      <th>{weekdayLabel(d)}</th>
                      {HOURS.map((h) => {
                        const c = heat.get(`${d}-${h}`);
                        if (!c) return <td key={h} className="heat-empty" />;
                        const rate = c.home / c.n;
                        const conf = Math.min(1, 0.25 + c.n / 8);
                        return (
                          <td key={h} style={{ background: `rgba(27, 58, 107, ${(0.12 + rate * 0.88) * conf})`, color: rate * conf > 0.45 ? '#fff' : '#1f2937' }}>
                            <b>{Math.round(rate * 100)}</b>
                            <small>{c.n}</small>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>町丁目別の成績</h3>
            <p className="muted small">見出しをタップで並べ替え。スコアは統計から見た見込み、右の率は実際の成績です。</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {th('name', '町丁目')}
                    {th('score', 'スコア')}
                    {th('visits', '訪問')}
                    {th('homeRate', '在宅')}
                    {th('talkRate', '会話')}
                    {th('apptRate', 'アポ')}
                    {th('competitorRate', '他社')}
                  </tr>
                </thead>
                <tbody>
                  {areaRows.map((r) => (
                    <tr key={r.key}>
                      <td className="name-cell">{r.name}</td>
                      <td>{r.score != null ? Math.round(r.score) : '—'}</td>
                      <td>{r.visits}</td>
                      <td>{pct(r.homeRate)}</td>
                      <td>{pct(r.talkRate)}</td>
                      <td>{pct(r.apptRate)}</td>
                      <td>{pct(r.competitorRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>天気別の在宅率</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byWeather} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => `${l}(${p?.[0]?.payload?.n ?? 0}件)`} />
                <Bar dataKey="在宅率" fill="#1b3a6b" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="n" position="top" formatter={(n: number) => (n ? `${n}件` : '')} style={{ fontSize: 11, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="panel">
            <h3>住居の種類別</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byHousing} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => `${l}(${p?.[0]?.payload?.n ?? 0}件)`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="在宅率" fill="#1b3a6b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="会話率" fill="#5b8fd6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </>
      )}
    </div>
  );
}

function Card({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}

