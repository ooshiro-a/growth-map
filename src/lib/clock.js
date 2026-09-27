// 今の時刻。テスト用シートにつないでいる時だけ「日付を仮に変える」ことができる
import { jstYear } from './dates.js';

const KEY = 'gm.clockOffset';
let offset = 0;

try {
  offset = Number(localStorage.getItem(KEY)) || 0;
} catch {
  offset = 0;
}

export const now = () => Date.now() + offset;
export const currentYear = () => jstYear(now());
export const clockOffset = () => offset;

export function setClockOffset(ms) {
  offset = Number(ms) || 0;
  try {
    if (offset) localStorage.setItem(KEY, String(offset));
    else localStorage.removeItem(KEY);
  } catch {
    /* 保存できなくても今の画面では効く */
  }
}
