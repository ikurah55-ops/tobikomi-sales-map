import { useEffect, useState } from 'react';

const KEY = 'tobikomi-desktop-hint-off';

/**
 * スマホなのに PC 用の表示(Safari の「デスクトップ用Webサイトを表示」など)になっていると、
 * 画面が約 980px 幅で描かれ、ボタンや文字が半分くらいに小さくなる。そのときだけ戻し方を出す。
 */
export function DesktopModeHint() {
  const [ratio, setRatio] = useState(0);
  useEffect(() => {
    const check = () => {
      const touch = navigator.maxTouchPoints > 0;
      const phoneWidth = Math.min(screen.width, screen.height);
      const r = window.innerWidth / phoneWidth;
      let off = false;
      try {
        off = sessionStorage.getItem(KEY) === '1';
      } catch {
        // 無視
      }
      setRatio(touch && phoneWidth < 600 && r > 1.4 && !off ? r : 0);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  if (!ratio) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const crios = /CriOS/.test(navigator.userAgent);
  return (
    <div className="desktop-hint" style={{ fontSize: `${Math.round(15 * ratio)}px` }} role="alert">
      <b>PC用の表示になっているため、ボタンや文字が小さくなっています。</b>
      <p>
        {ios && !crios
          ? 'アドレスバーの「ぁあ」(またはページメニュー)→「モバイル用Webサイトを表示」を押すと、普通の大きさに戻ります。'
          : '右上(または下)のメニュー →「PC版サイト」のチェックを外す(「モバイルサイトをリクエスト」)と、普通の大きさに戻ります。'}
      </p>
      <button
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, '1');
          } catch {
            // 無視
          }
          setRatio(0);
        }}
      >
        閉じる
      </button>
    </div>
  );
}
