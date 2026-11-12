import { FACILITY_CATS, FACILITY_LABEL, SPACE_STEPS } from '../data/facilities';
import { clearHiddenFacilities } from '../data/repository';
import { useStore } from '../store';
import type { FacilityCat } from '../types';
import { Toggle } from './ui';

/** 設定画面の「駐車場のある店」の表示設定(店データは地域データと一緒にダウンロードする) */
export function FacilitySettings() {
  const { settings, updateSettings, toast, facilitySets, facilityMarks } = useStore();
  const toggleCat = (c: FacilityCat) =>
    updateSettings({ facilityCats: settings.facilityCats.includes(c) ? settings.facilityCats.filter((x) => x !== c) : [...settings.facilityCats, c] });

  const all = facilitySets.flatMap((f) => f.data.facilities);
  const countAt = (min: number) =>
    all.filter((f) => settings.facilityCats.includes(f.c) && f.s >= min && facilityMarks.get(f.id)?.status !== 'hidden').length;
  const marks = [...facilityMarks.values()];
  const okCount = marks.filter((m) => m.status === 'ok').length;
  const customCount = marks.filter((m) => m.custom).length;
  const hiddenCount = marks.length - okCount;
  return (
    <section className="panel">
      <h3>駐車場のある店</h3>
      <p className="muted small">
        コンビニ・スーパー・本屋・ホームセンター・ドラッグストア・モールのうち、駐車場が大きい店を地図に出します。台数は OpenStreetMap の地図データの駐車場の面積から推定しています(地図データに駐車場がない店は出ません)。
        店のアイコンは地図を町丁目の名前が読めるくらいまで寄せると出ます。「使える駐車場」に登録した店はいつでも出ます。店のデータにない駐車場は、地図を長押し →「ここを使える駐車場として登録」で追加できます。店データは「地域データ」をダウンロードすると一緒に入ります。
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
    </section>
  );
}
