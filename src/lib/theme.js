// 画面の色（ライト／ダーク）：この端末だけ（localStorage の gm.theme）。シートには書かない
// 白く光らないよう、最初の反映は index.html の <head> で済ませている。ここでは theme-color と切り替えを受け持つ
import { safeStorage } from '../config.js';

export const THEMES = [
  { key: 'auto', label: '端末に合わせる' },
  { key: 'light', label: 'ライト' },
  { key: 'dark', label: 'ダーク' },
];
const KEY = 'gm.theme';
const BAR_COLOR = { light: '#F5F2EA', dark: '#0F2B3F' };

export function loadTheme(storage) {
  try {
    const v = storage && storage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function darkQuery() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  } catch {
    return null;
  }
}

export function isDark(theme) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return !!darkQuery()?.matches;
}

let current = 'auto';

export function applyTheme(theme) {
  current = theme;
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark(theme) ? BAR_COLOR.dark : BAR_COLOR.light);
}

// 起動時に1回：記憶を反映し、「端末に合わせる」の時は端末の切り替えを追う
export function initTheme(storage = safeStorage()) {
  applyTheme(loadTheme(storage));
  const q = darkQuery();
  if (!q) return;
  const follow = () => {
    if (current === 'auto') applyTheme('auto');
  };
  if (q.addEventListener) q.addEventListener('change', follow);
  else if (q.addListener) q.addListener(follow);
}

// 設定から：記憶できない時も、今の画面では切り替わる
export function setTheme(theme, storage = safeStorage()) {
  try {
    if (storage) storage.setItem(KEY, theme);
  } catch {
    /* 記憶できなくても切り替える */
  }
  applyTheme(theme);
}
