// 日時は日本時間で扱う（端末の時間帯に関係なく）
const JST_OFFSET = 9 * 3600 * 1000;

export function toMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v) {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// 日本時間の年・月・日・時・分
export function jstParts(v) {
  const ms = toMs(v);
  if (ms == null) return null;
  const d = new Date(ms + JST_OFFSET);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export function jstYear(v) {
  const p = jstParts(v);
  return p ? p.year : null;
}

// 「27年1月10日」
export function formatJpDate(v) {
  const p = jstParts(v);
  if (!p) return '';
  return `${String(p.year % 100).padStart(2, '0')}年${p.month}月${p.day}日`;
}

// シートに書く形「2026-09-27T11:30:00.123+09:00」
export function toJstIso(v) {
  const ms = toMs(v);
  if (ms == null) return '';
  const d = new Date(ms + JST_OFFSET);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+09:00`
  );
}
