// 接続先（GAS のウェブアプリ URL）は組み立て時に入れる（GitHub Actions の変数 GAS_URL / GAS_URL_TEST）
// 手元では .env.local に VITE_GAS_URL / VITE_GAS_URL_TEST を書く（.env.example 参照）
// 手元の確認でスマホから PC を開いた時（npm run dev:lan）は、localhost を PC の場所に読み替える
const forDev = (u) =>
  import.meta.env.DEV && u && typeof location !== 'undefined' ? u.replace('//localhost', `//${location.hostname}`) : u;

export const GAS_URLS = {
  prod: forDev(import.meta.env.VITE_GAS_URL || ''),
  test: forDev(import.meta.env.VITE_GAS_URL_TEST || ''),
};

export const ENV_LABEL = { prod: '本番', test: 'テスト用' };

// アプリの名前（画面に出す表示名。URL・リポジトリ名・内部の名前は growth-map のまま）
export const APP_NAME = 'grops';

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export function safeStorage() {
  try {
    const k = 'gm.__probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

export function loadEnv(storage) {
  let env = 'prod';
  try {
    env = (storage && storage.getItem('gm.env')) || 'prod';
  } catch {
    env = 'prod';
  }
  env = env === 'test' ? 'test' : 'prod';
  // 片方の接続先しかない時はそちらを使う
  if (!GAS_URLS[env]) env = env === 'test' ? 'prod' : GAS_URLS.test ? 'test' : 'prod';
  return env;
}

export function saveEnv(storage, env) {
  try {
    if (storage) storage.setItem('gm.env', env);
  } catch {
    /* 保存できなくても今の画面では切り替わる */
  }
}
