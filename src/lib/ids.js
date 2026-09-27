// 項目番号：旧マインドマップと同じ形「n」＋時刻（36進数8桁）＋連番＋乱数
// 記録番号：「r」＋同じ形（1行ごと）
let seq = 0;

const rand4 = () => {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0].toString(36).padStart(4, '0').slice(-4);
  } catch {
    return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  }
};

const make = (prefix, ms) => prefix + ms.toString(36) + (seq++ % 1296).toString(36) + rand4();

export const newId = (ms = Date.now()) => make('n', ms);
export const newRecordNo = (ms = Date.now()) => make('r', ms);

const MIN_MS = Date.UTC(2020, 0, 1);

// 旧マップの番号から追加日時（ミリ秒）を戻す。読めない番号（root など）は null
export function decodeIdTime(id, nowMs = Date.now()) {
  if (typeof id !== 'string' || id.length < 9 || id[0] !== 'n') return null;
  const part = id.slice(1, 9);
  if (!/^[0-9a-z]{8}$/.test(part)) return null;
  const ms = parseInt(part, 36);
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > nowMs + 86400000) return null;
  return ms;
}
