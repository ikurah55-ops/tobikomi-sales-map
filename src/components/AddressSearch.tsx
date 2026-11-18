import { useMemo, useRef, useState } from 'react';
import type { AreaFeature, StoredRegion } from '../types';

/** 検索結果1件 */
export type SearchHit =
  | { kind: 'area'; label: string; sub: string; regionCode: string; feature: AreaFeature }
  | { kind: 'point'; label: string; sub: string; lat: number; lng: number };

const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 1〜99 を漢数字に(「本町1丁目」→「本町一丁目」で町丁目名と合わせる) */
const toKanjiNum = (n: number) => (n < 10 ? KANJI[n] : `${n >= 20 ? KANJI[Math.floor(n / 10)] : ''}十${KANJI[n % 10]}`);

const normalize = (s: string) =>
  s.normalize('NFKC').replace(/[\s　]/g, '').replace(/^〒/, '').replace(/[‐‑‒–—―−]/g, '-'); // いろいろなハイフンをそろえる
const ZIP_RE = /^(\d{3})-?(\d{4})$/;

/** 端末に入っている地域データの町丁目名から探す(電波がなくても使える) */
function searchAreas(regions: StoredRegion[], raw: string, cityHint?: string): SearchHit[] {
  let q = normalize(raw);
  if (!q) return [];
  const hits: { hit: SearchHit; rank: number }[] = [];
  for (const r of regions) {
    if (cityHint && r.name !== cityHint) continue;
    // 「山形市本町」のように県名・市区町村名から書いた場合は、その市の中だけで探す
    let qq = q.replace(r.prefName, '');
    const inCity = qq.startsWith(r.name);
    if (inCity) qq = qq.slice(r.name.length);
    if (!qq) continue;
    const variants = [qq, qq.replace(/(\d{1,2})(?=丁目|$|-)/g, (_, d) => toKanjiNum(+d)).replace(/-.*$/, '')];
    for (const f of r.data.features) {
      const name = normalize(f.properties.name);
      let rank = -1;
      for (const v of variants) {
        if (!v) continue;
        if (name === v) rank = Math.max(rank, 3);
        else if (name.startsWith(v)) rank = Math.max(rank, 2);
        else if (name.includes(v)) rank = Math.max(rank, 1);
        else if (v.startsWith(name) && name.length >= 2) rank = Math.max(rank, 0); // 「本町一丁目3-5」→「本町一丁目」
      }
      if (rank >= 0) hits.push({ hit: { kind: 'area', label: f.properties.name, sub: `${r.prefName}${r.name}`, regionCode: r.code, feature: f }, rank: rank + (inCity ? 1 : 0) });
    }
  }
  return hits.sort((a, b) => b.rank - a.rank || a.hit.label.length - b.hit.label.length).slice(0, 8).map((h) => h.hit);
}

/** 国土地理院の住所検索(住所・地名 → 緯度経度) */
async function searchGsi(q: string): Promise<SearchHit[]> {
  const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('住所検索に失敗しました');
  const list = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const it of list) {
    const t = it.properties.title;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ kind: 'point', label: t, sub: '住所検索', lat: it.geometry.coordinates[1], lng: it.geometry.coordinates[0] });
    if (out.length >= 8) break;
  }
  return out;
}

/** 郵便番号 → 住所(zipcloud) */
async function zipToAddress(zip: string): Promise<{ pref: string; city: string; town: string } | null> {
  const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
  if (!res.ok) throw new Error('郵便番号を調べられませんでした');
  const j = (await res.json()) as { results: { address1: string; address2: string; address3: string }[] | null };
  const r = j.results?.[0];
  return r ? { pref: r.address1, city: r.address2, town: r.address3 } : null;
}

/** 地図の上の検索バー: 町の名前・住所・郵便番号で探して、その場所へ移動する */
export function AddressSearch({ regions, onPick, onClear, hasMarker }: {
  regions: StoredRegion[];
  onPick: (hit: SearchHit) => void;
  onClear: () => void;
  hasMarker: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<SearchHit[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 入力中は端末内の町丁目から候補を出す
  const nq = normalize(q);
  const isZip = ZIP_RE.test(nq);
  const local = useMemo(() => (isZip ? [] : searchAreas(regions, q)), [regions, q, isZip]);

  const pick = (h: SearchHit) => {
    setOpen(false);
    setOnline(null);
    setMsg(null);
    inputRef.current?.blur();
    onPick(h);
  };

  const submit = async () => {
    if (!nq) return;
    setBusy(true);
    setMsg(null);
    setOnline(null);
    setOpen(true);
    try {
      const zip = nq.match(ZIP_RE);
      if (zip) {
        const a = await zipToAddress(zip[1] + zip[2]);
        if (!a) { setMsg('その郵便番号は見つかりませんでした'); return; }
        // 端末内の町丁目にあればそれを、なければ住所検索の結果へ
        const area = searchAreas(regions, a.town, a.city)[0];
        if (area) return pick({ ...area, sub: `〒${zip[1]}-${zip[2]} ${area.sub}` });
        const g = await searchGsi(a.pref + a.city + a.town);
        if (g[0]) return pick({ ...g[0], label: `${a.city}${a.town}`, sub: `〒${zip[1]}-${zip[2]}` });
        setMsg(`${a.pref}${a.city}${a.town} の場所が見つかりませんでした`);
        return;
      }
      const g = await searchGsi(nq);
      if (local.length + g.length === 1) return pick(local[0] ?? g[0]);
      setOnline(g);
      if (!local.length && !g.length) setMsg('見つかりませんでした。町の名前や住所を変えて試してください');
    } catch {
      setMsg(local.length ? '電波が弱いため、住所検索はできませんでした(端末内の町丁目だけ表示)' : '電波が弱いため検索できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const showList = open && (local.length > 0 || (online?.length ?? 0) > 0 || !!msg || busy);

  return (
    <div className="addr-search">
      <form
        className="addr-search-bar"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <span className="addr-search-icon" aria-hidden>🔍</span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="町名・住所・郵便番号で検索"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOnline(null); setMsg(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-label="町名・住所・郵便番号で検索"
        />
        {(q || hasMarker) && (
          <button type="button" className="addr-search-clear" aria-label="検索をクリア" onClick={() => { setQ(''); setOnline(null); setMsg(null); setOpen(false); onClear(); }}>✕</button>
        )}
        <button type="submit" className="addr-search-go" disabled={!nq || busy}>{busy ? '…' : '検索'}</button>
      </form>

      {showList && (
        <>
          <div className="addr-search-backdrop" onClick={() => setOpen(false)} />
          <ul className="addr-search-list">
            {local.map((h) => (
              <li key={`a-${h.kind === 'area' ? h.feature.properties.key : ''}`}>
                <button onClick={() => pick(h)}>
                  <b>{h.label}</b><small>{h.sub}・町丁目</small>
                </button>
              </li>
            ))}
            {online?.map((h, i) => (
              <li key={`p-${i}`}>
                <button onClick={() => pick(h)}>
                  <b>{h.label}</b><small>{h.sub}</small>
                </button>
              </li>
            ))}
            {busy && <li className="addr-search-msg">検索中…</li>}
            {msg && <li className="addr-search-msg">{msg}</li>}
            {!busy && !online && !msg && !isZip && (
              <li className="addr-search-msg">「検索」を押すと住所からも探します</li>
            )}
            {!busy && !online && !msg && isZip && (
              <li className="addr-search-msg">「検索」を押すと郵便番号の場所へ移動します</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
