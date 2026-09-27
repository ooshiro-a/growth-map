// 試験データは作り物だけを使う（本当の記録は入れない）
import { toRow } from '../src/lib/schema.js';

let n = 0;
export const resetNo = () => {
  n = 0;
};

// 1行を作る。年ごとの種類は year を付ける
export function r(o) {
  n++;
  return toRow({
    at: o.at || `2026-02-01T09:00:${String(n % 60).padStart(2, '0')}.000+09:00`,
    ver: o.ver ?? 1,
    no: o.no || `rtest${String(n).padStart(4, '0')}`,
    ...o,
  });
}

export const ids = (list) => list.map((e) => e.id);
