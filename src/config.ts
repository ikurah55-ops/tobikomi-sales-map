// 前処理済み地域データの置き場所。
// 最初は同じサイト(GitHub Pages)の data/regions/。容量が足りなくなったら
// .env に VITE_DATA_BASE_URL=https://<Cloudflare R2 などの公開URL>/regions/ を書いてビルドし直す。
export const DATA_BASE_URL: string =
  import.meta.env.VITE_DATA_BASE_URL || `${import.meta.env.BASE_URL}data/regions/`;

/** 初回起動時に自動で読み込む地域(山形市) */
export const DEFAULT_REGION = '06201';

/** 地図の初期位置(山形駅付近) */
export const DEFAULT_CENTER: [number, number] = [38.2486, 140.3279];

/** 位置の精度がこれより悪いと注意を出す(メートル) */
export const LOW_ACCURACY_M = 100;
