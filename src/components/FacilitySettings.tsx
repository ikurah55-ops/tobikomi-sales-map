import { useEffect, useState } from 'react';
import { FACILITY_CATS, FACILITY_LABEL, SPACE_STEPS, downloadFacilities, fetchFacilityIndex, type FacilityIndex } from '../data/facilities';
import { formatSize } from '../data/regions';
import { clearHiddenFacilities, deleteFacilitySet } from '../data/repository';
import { PREFECTURES } from '../lib/prefectures';
import { useStore } from '../store';
import type { FacilityCat, FacilityIndexEntry } from '../types';
import { Toggle } from './ui';

/** 設定画面の「駐車場のある店」。pref は「地域の追加」で選んでいる都道府県 */
export function FacilitySettings({ pref }: { pref: string }) {
  const { settings, updateSettings, regions, toast, facilitySets, reloadFacilities, facilityMarks } = useStore();
  const [index, setIndex] = useState<FacilityIndex | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchFacilityIndex().then(setIndex).catch(() => setIndex({ regions: [] }));
  }, []);

  const install = async (entries: FacilityIndexEntry[], key: string) => {
    setBusy(key);
    try {
      for (const e of entries) await downloadFacilities(e);
      await reloadFacilities();
      toast(entries.length === 1 ? `${entries[0].name}の店データを保存しました` : `${entries.length}市区町村の店データを保存しました`);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (code: string, name: string) => {
    await deleteFacilitySet(code);
    await reloadFacilities();
    toast(`${name}の店データを削除しました(登録・消した店の情報は残ります)`);
  };

  const toggleCat = (c: FacilityCat) =>
    updateSettings({ facilityCats: settings.facilityCats.includes(c) ? settings.facilityCats.filter((x) => x !== c) : [...settings.facilityCats, c] });

  const all = facilitySets.flatMap((f) => f.data.facilities);
  const countAt = (min: number) =>
    all.filter((f) => settings.facilityCats.includes(f.c) && f.s >= min && facilityMarks.get(f.id)?.status !== 'hidden').length;
  const marks = [...facilityMarks.values()];
  const okCount = marks.filter((m) => m.status === 'ok').length;
  const customCount = marks.filter((m) => m.custom).length;
  const hiddenCount = marks.length - okCount;
  // 地域データを持っているのに店データがない市区町村(まとめて取得する)
  const missing = index?.regions.filter((e) => regions.some((r) => r.code === e.code) && !facilitySets.some((f) => f.code === e.code)) ?? [];
  const cities = index?.regions.filter((r) => r.prefCode === pref) ?? [];

  return (
    <section className="panel">
      <h3>駐車場のある店</h3>
      <p className="muted small">
        コンビニ・スーパー・本屋・ホームセンター・ドラッグストア・モールのうち、駐車場が大きい店を地図に出します。台数は OpenStreetMap の地図データの駐車場の面積から推定しています(地図データに駐車場がない店は出ません)。
        店のアイコンは地図を町丁目の名前が読めるくらいまで寄せると出ます。「使える駐車場」に登録した店はいつでも出ます。店のデータにない駐車場は、地図を長押し →「ここを使える駐車場として登録」で追加できます。
      </p>
      <Toggle checked={settings.showFacilities} onChange={(v) => updateSettings({ showFacilities: v })} label="地図に表示する" />

      <h4 className="sub-head">駐車場の大きさ</h4>
      <div className="chips">
        {SPACE_STEPS.map((n) => (
          <button key={n} className={`chip${settings.facilityMinSpaces === n ? ' on' : ''}`} onClick={() => updateSettings({ facilityMinSpaces: n })}>
            {n}台以上{facilitySets.length > 0 && <small> {countAt(n)}件</small>}
          </button>
        ))}
      </div>

      <h4 className="sub-head">種類</h4>
      <div className="chips">
        {FACILITY_CATS.map((c) => (
          <button key={c} className={`chip${settings.facilityCats.includes(c) ? ' on' : ''}`} onClick={() => toggleCat(c)}>
            {FACILITY_LABEL[c]}
          </button>
        ))}
      </div>

      <p className="small" style={{ marginTop: 12 }}>
        使える駐車場に登録: {okCount}件{customCount > 0 && `(うち自分で追加 ${customCount}件)`} ・ 地図から消した店: {hiddenCount}件
        {hiddenCount > 0 && (
          <button
            className="link-btn"
            onClick={async () => {
              if (!window.confirm(`地図から消した${hiddenCount}件の店を元に戻しますか?`)) return;
              toast(`${await clearHiddenFacilities()}件を元に戻しました`);
            }}
          >
            すべて戻す
          </button>
        )}
      </p>

      <h4 className="sub-head">店データ(市区町村ごと)</h4>
      <ul className="region-list">
        {facilitySets.map((f) => {
          const remote = index?.regions.find((e) => e.code === f.code);
          const update = !!remote && remote.generatedAt > f.generatedAt;
          return (
            <li key={f.code}>
              <div className="region-info">
                <b>{f.prefName} {f.name}</b>
                {update && <span className="tag tag-info">更新あり</span>}
                <div className="muted small">{f.data.facilities.length}店 ・ {formatSize(f.size)}</div>
              </div>
              <div className="region-actions">
                {remote && (
                  <button className="btn btn-sm btn-outline" disabled={busy === f.code} onClick={() => install([remote], f.code)}>
                    {busy === f.code ? '…' : '更新'}
                  </button>
                )}
                <button className="btn btn-sm btn-danger-outline" onClick={() => remove(f.code, f.name)}>削除</button>
              </div>
            </li>
          );
        })}
        {!facilitySets.length && <li className="muted">まだ店データがありません</li>}
      </ul>
      {missing.length > 0 && (
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => install(missing, 'missing')}>
          {busy === 'missing' ? '取得中…' : `地域データのある${missing.length}市区町村の店データを取得`}
        </button>
      )}

      {index && (
        <>
          <h4 className="sub-head">市区町村を選んで追加({PREFECTURES.find(([c]) => c === pref)?.[1]})</h4>
          <ul className="region-list">
            {cities.map((e) => (
              <li key={e.code}>
                <div className="region-info">
                  <b>{e.name}</b>
                  <div className="muted small">{e.count}店 ・ {formatSize(e.size)}</div>
                </div>
                <div className="region-actions">
                  {facilitySets.some((f) => f.code === e.code) ? (
                    <span className="muted small">保存済み</span>
                  ) : (
                    <button className="btn btn-sm btn-primary" disabled={busy === e.code} onClick={() => install([e], e.code)}>
                      {busy === e.code ? '取得中…' : 'ダウンロード'}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {!cities.length && <li className="muted">この都道府県の店データはまだ用意されていません(都道府県は「地域の追加」で切り替えます)</li>}
          </ul>
        </>
      )}
    </section>
  );
}
