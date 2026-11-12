import { useEffect, useRef, useState } from 'react';
import { FacilitySettings } from '../components/FacilitySettings';
import { Toggle } from '../components/ui';
import { canShareFile, exportCsv, exportJson, importJson, lastBackupAt, shareJson } from '../data/backup';
import { downloadRegion, fetchRegionIndex, formatSize, hasUpdate, type RegionIndex } from '../data/regions';
import { downloadFacilities, fetchFacilityIndex, type FacilityIndex } from '../data/facilities';
import { deleteFacilitySet, deleteRegion } from '../data/repository';
import { PREFECTURES } from '../lib/prefectures';
import { AGE_TOP, INDICATOR_KEYS, INDICATOR_LABEL, PRESETS, adjustWeights, ageRangeLabel } from '../lib/score';
import { isStandalone, useInstallPrompt } from '../hooks/useInstallPrompt';
import { useStore } from '../store';
import type { IndicatorKey, RegionIndexEntry } from '../types';

const AGE_MIN = 5; // 25〜29歳
const AGE_MAX = AGE_TOP; // 75歳以上

export function SettingsPage() {
  const { settings, updateSettings, regions, reloadRegions, toast, activeRegion, setTab, facilitySets, reloadFacilities } = useStore();
  const [facIndex, setFacIndex] = useState<FacilityIndex | null>(null);
  const [index, setIndex] = useState<RegionIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [pref, setPref] = useState('06');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { canInstall, install: installApp } = useInstallPrompt();
  const [lastBackup, setLastBackup] = useState(lastBackupAt);

  const loadIndex = () => {
    setIndexError(null);
    fetchRegionIndex().then(setIndex).catch((e: Error) => setIndexError(e.message));
    fetchFacilityIndex().then(setFacIndex).catch(() => setFacIndex({ regions: [] }));
  };
  useEffect(loadIndex, []);

  const setAge = (from: number, to: number) => updateSettings({ ageFrom: Math.min(from, to), ageTo: Math.max(from, to), preset: null });
  const setWeight = (k: IndicatorKey, v: number) => updateSettings({ weights: adjustWeights(settings.weights, k, v), preset: null });

  const facEntry = (code: string) => facIndex?.regions.find((f) => f.code === code);
  const facSet = (code: string) => facilitySets.find((f) => f.code === code);

  // 地域データと、その市区町村の駐車場のある店データをセットで保存する
  const install = async (e: RegionIndexEntry) => {
    setBusy(e.code);
    try {
      await downloadRegion(e);
      // 店の一覧をまだ読めていなければ、ここで読む
      const fi = facIndex ?? (await fetchFacilityIndex().catch(() => null));
      const fe = fi?.regions.find((f) => f.code === e.code);
      if (fe) await downloadFacilities(fe);
      await Promise.all([reloadRegions(), reloadFacilities()]);
      toast(fe ? `${e.name}の地域データと店データを保存しました` : `${e.name}のデータを保存しました`);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (code: string, name: string) => {
    if (!window.confirm(`${name}の地域データと店データを端末から削除しますか?(訪問記録や、登録した駐車場は消えません)`)) return;
    await deleteRegion(code);
    await deleteFacilitySet(code);
    await Promise.all([reloadRegions(), reloadFacilities()]);
    toast(`${name}のデータを削除しました`);
  };

  // 以前に地域データだけ入れた市区町村の店データ(まとめて取得する)
  const facMissing = regions.filter((r) => !facSet(r.code)).map((r) => facEntry(r.code)).filter((f) => !!f);
  const installMissingFac = async () => {
    setBusy('fac-missing');
    try {
      for (const f of facMissing) await downloadFacilities(f);
      await reloadFacilities();
      toast(`${facMissing.length}市区町村の店データを保存しました`);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const prefsWithData = new Set(index?.regions.map((r) => r.prefCode));
  const cities = index?.regions.filter((r) => r.prefCode === pref) ?? [];
  // 前処理で実データに合わせて変えた点(持ち家一戸建て率の近似など)
  const dataNotes = activeRegion?.data.notes ?? [];

  return (
    <div className="page settings">
      <div className="page-head"><h2>設定</h2></div>

      <section className="panel">
        <h3>プリセット</h3>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset${settings.preset === p.id ? ' on' : ''}`}
              onClick={() => updateSettings({ preset: p.id, ageFrom: p.ageFrom, ageTo: p.ageTo, weights: p.weights })}
            >
              <b>{p.label}</b>
              <small>{ageRangeLabel(p.ageFrom, p.ageTo)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>狙う年齢層 <span className="value-pill">{ageRangeLabel(settings.ageFrom, settings.ageTo)}</span></h3>
        <div className="dual-range">
          <div
            className="dual-fill"
            style={{
              left: `${((settings.ageFrom - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100}%`,
              right: `${100 - ((settings.ageTo - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100}%`,
            }}
          />
          <input type="range" min={AGE_MIN} max={AGE_MAX} step={1} value={settings.ageFrom}
            onChange={(e) => setAge(Math.min(+e.target.value, settings.ageTo), settings.ageTo)} aria-label="下限" />
          <input type="range" min={AGE_MIN} max={AGE_MAX} step={1} value={settings.ageTo}
            onChange={(e) => setAge(settings.ageFrom, Math.max(+e.target.value, settings.ageFrom))} aria-label="上限" />
        </div>
        <div className="range-ticks">
          {Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => <span key={i}>{(AGE_MIN + i) * 5}{AGE_MIN + i === AGE_MAX ? '+' : ''}</span>)}
        </div>
        <p className="muted small">
          年齢の設定は「狙う年齢層の人口割合」の指標にだけ反映します。ほかの指標(家族類型・子どもがいる世帯・持ち家・人口増加率)は統計の都合で年齢と連動できないため固定で計算しています
          。
        </p>
        {dataNotes.map((n) => <p key={n} className="muted small">※ {n}</p>)}
      </section>

      <section className="panel">
        <h3>指標の重み <small className="muted">合計100%に自動調整</small></h3>
        {INDICATOR_KEYS.map((k) => (
          <div key={k} className="weight-row">
            <div className="weight-label">
              <span>{INDICATOR_LABEL[k]}</span>
              <b>{settings.weights[k]}%</b>
            </div>
            <input type="range" min={0} max={100} step={5} value={settings.weights[k]} onChange={(e) => setWeight(k, +e.target.value)} />
          </div>
        ))}
        <h4 className="sub-head">比較する範囲</h4>
        <div className="seg seg-block">
          <button className={settings.scope === 'region' ? 'on' : ''} onClick={() => updateSettings({ scope: 'region' })}>市区町村の中で</button>
          <button className={settings.scope === 'all' ? 'on' : ''} onClick={() => updateSettings({ scope: 'all' })}>読み込み済みの全地域で</button>
        </div>
      </section>

      <section className="panel">
        <h3>地域データ</h3>
        <ul className="region-list">
          {regions.map((r) => {
            const remote = index?.regions.find((e) => e.code === r.code);
            const fs = facSet(r.code);
            const fe = facEntry(r.code);
            const update = hasUpdate(r, remote) || (!!fs && !!fe && fe.generatedAt > fs.generatedAt);
            return (
              <li key={r.code}>
                <div className="region-info">
                  <b>{r.prefName} {r.name}</b>
                  {r.code === settings.activeRegion && <span className="tag tag-good">表示中</span>}
                  {r.isDummy && <span className="tag tag-warn">ダミー</span>}
                  {update && <span className="tag tag-info">更新あり</span>}
                  <div className="muted small">
                    {r.dataYear}年国勢調査 ・ {r.data.features.length}町丁目 ・ {fs ? `駐車場のある店 ${fs.data.facilities.length}店` : '店データなし'} ・ {formatSize(r.size + (fs?.size ?? 0))}
                  </div>
                </div>
                <div className="region-actions">
                  {r.code !== settings.activeRegion && (
                    <button className="btn btn-sm btn-outline" onClick={() => { updateSettings({ activeRegion: r.code }); setTab('map'); }}>表示</button>
                  )}
                  {remote && (
                    <button className="btn btn-sm btn-outline" disabled={busy === r.code} onClick={() => install(remote)}>
                      {busy === r.code ? '…' : '更新'}
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger-outline" onClick={() => remove(r.code, r.name)}>削除</button>
                </div>
              </li>
            );
          })}
          {!regions.length && <li className="muted">まだ地域がありません</li>}
        </ul>
        {facMissing.length > 0 && (
          <button className="btn btn-outline btn-block" style={{ marginTop: 10 }} disabled={!!busy} onClick={installMissingFac}>
            {busy === 'fac-missing' ? '取得中…' : `駐車場のある店データを取得(${facMissing.length}市区町村)`}
          </button>
        )}

        <h4 className="sub-head">地域の追加</h4>
        {indexError ? (
          <div className="alert alert-info">
            {indexError}(電波の良い場所で再試行してください) <button className="link-btn" onClick={loadIndex}>再試行</button>
          </div>
        ) : !index ? (
          <p className="muted">地域一覧を読み込み中…</p>
        ) : (
          <>
            <select className="input" value={pref} onChange={(e) => setPref(e.target.value)}>
              {PREFECTURES.map(([c, n]) => (
                <option key={c} value={c} disabled={!prefsWithData.has(c)}>
                  {n}{prefsWithData.has(c) ? '' : '(準備中)'}
                </option>
              ))}
            </select>
            <ul className="region-list">
              {cities.map((e) => {
                const have = regions.some((r) => r.code === e.code);
                return (
                  <li key={e.code}>
                    <div className="region-info">
                      <b>{e.name}</b>
                      {e.isDummy && <span className="tag tag-warn">ダミー</span>}
                      <div className="muted small">
                        {e.dataYear}年国勢調査 ・ {e.areaCount}町丁目{facEntry(e.code) && ` ・ 駐車場のある店 ${facEntry(e.code)!.count}店`} ・ {formatSize(e.size + (facEntry(e.code)?.size ?? 0))}
                      </div>
                    </div>
                    <div className="region-actions">
                      {have ? (
                        <span className="muted small">保存済み</span>
                      ) : (
                        <button className="btn btn-sm btn-primary" disabled={busy === e.code} onClick={() => install(e)}>
                          {busy === e.code ? '取得中…' : 'ダウンロード'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              {!cities.length && <li className="muted">この都道府県のデータはまだ用意されていません</li>}
            </ul>
          </>
        )}
      </section>

      <FacilitySettings />

      <section className="panel">
        <h3>地図のボタンの大きさ <span className="value-pill">{settings.mapButtonScale ?? 100}%</span></h3>
        <input
          type="range" min={50} max={200} step={10} value={settings.mapButtonScale ?? 100}
          onChange={(e) => updateSettings({ mapButtonScale: +e.target.value })}
          aria-label="地図のボタンの大きさ"
          style={{ width: '100%' }}
        />
        <div className="range-ticks"><span>50%</span><span>100%</span><span>150%</span><span>200%</span></div>
        <div className="btn-scale-preview" style={{ '--btn-scale': (settings.mapButtonScale ?? 100) / 100 } as React.CSSProperties}>
          <span className="fab"><span>🎨</span><small>色分け</small></span>
          <span className={`pin-here-btn${(settings.mapButtonScale ?? 100) >= 150 ? ' stacked' : ''}`}><span className="pin-here-icon">📍</span>現在地にピンを立てる</span>
        </div>
        <div className="row-gap" style={{ marginTop: 8 }}>
          <button className="btn btn-outline" onClick={() => updateSettings({ mapButtonScale: 100 })} disabled={(settings.mapButtonScale ?? 100) === 100}>100%に戻す</button>
        </div>
        <p className="muted small">「色分け」「絞込」「駐車場」「範囲」「凡例」「現在地」「現在地にピンを立てる」の大きさが変わります。</p>
      </section>

      <section className="panel">
        <h3>位置情報</h3>
        <Toggle
          checked={settings.locationChoice === 'allowed'}
          onChange={(v) => updateSettings({ locationChoice: v ? 'allowed' : 'declined' })}
          label="現在地を地図に表示する"
        />
        <Toggle checked={settings.autoRegion} onChange={(v) => updateSettings({ autoRegion: v })} label="現在地の地域に自動で切り替える" />
        <p className="muted small">位置情報は端末内でだけ使い、移動の軌跡は保存しません。アプリが画面に出ていないときは取得を止めます。</p>
      </section>

      <section className="panel">
        <h3>バックアップ</h3>
        <p className="muted small">記録はこの端末の中だけに保存されています。機種変更や消去に備えて、ときどきJSONで保存してください。7日以上保存していないと地図にお知らせが出ます。</p>
        <p className="small">最後のバックアップ: {lastBackup != null ? new Date(lastBackup).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : 'まだありません'}</p>
        <div className="btn-stack">
          {canShareFile() && (
            <button
              className="btn btn-primary btn-block"
              onClick={async () => {
                try {
                  const n = await shareJson();
                  if (n != null) { setLastBackup(lastBackupAt()); toast(`${n}件の訪問記録をバックアップしました`); }
                } catch (err) {
                  toast(`バックアップできませんでした: ${(err as Error).message}`);
                }
              }}
            >
              Googleドライブなどに保存(共有)
            </button>
          )}
          <button className="btn btn-outline btn-block" onClick={async () => { toast(`${await exportJson()}件の訪問記録を書き出しました`); setLastBackup(lastBackupAt()); }}>
            JSONでバックアップ
          </button>
          <button className="btn btn-outline btn-block" onClick={() => fileRef.current?.click()}>JSONから復元</button>
          <button className="btn btn-outline btn-block" onClick={async () => toast(`${await exportCsv()}件をCSVに書き出しました`)}>
            CSVで書き出し(Excel用)
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const r = await importJson(f);
              toast(`ピン${r.pins}件・訪問${r.visits}件を復元しました`);
            } catch (err) {
              toast(`復元できませんでした: ${(err as Error).message}`);
            }
          }}
        />
        <p className="muted small">復元すると、同じ記録は上書きされ、ない記録は追加されます(今ある記録は消えません)。</p>
      </section>

      {!isStandalone() && (
        <section className="panel">
          <h3>アプリとして使う</h3>
          {canInstall ? (
            <button
              className="btn btn-primary btn-block"
              onClick={async () => { if (await installApp()) toast('ホーム画面に追加しました'); }}
            >
              ホーム画面にインストール
            </button>
          ) : (
            <p className="muted small">
              Chromeの「⋮ → アプリをインストール」から追加できます。「既にインストールされています」と出る場合は、ホーム画面の古いショートカットを削除してから試してください(訪問記録は消えません)。
            </p>
          )}
        </section>
      )}

      <section className="panel about">
        <h3>プライバシーと出典</h3>
        <ul>
          <li>訪問記録は端末内(IndexedDB)にだけ保存し、外部には送信しません。</li>
          <li>氏名・電話番号・健康状態など個人情報は記録しないでください。</li>
          <li>地図・店と駐車場の情報: © OpenStreetMap contributors</li>
          <li>
            統計: {regions.some((r) => r.isDummy)
              ? '現在はダミーデータ(架空の数値)です。実データは政府統計の総合窓口(e-Stat)の国勢調査 小地域集計を加工して作成します。'
              : '政府統計の総合窓口(e-Stat)「国勢調査 小地域集計」・境界データを加工して作成'}
          </li>
        </ul>
      </section>
    </div>
  );
}
