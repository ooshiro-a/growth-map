// 並べ替え：画面の ↑↓ で決めた並びを「並べ替え」の記録（付記.after）にする

// 今の並び current（番号）を desired にする記録 [{id, after}]
// 動かさずに済む最も長い組（今の並びで増えていく列）は残し、ほかだけを直前の項目の後ろへ移す
// 上から順に足すので、移す先（直前の項目）はいつも並べ終わっている
export function orderMoves(current, desired) {
  const pos = new Map(current.map((id, i) => [id, i]));
  const seq = desired.map((id) => pos.get(id));
  // 最も長い増えていく列（並べる数は少ないので素直に O(n²)）
  const len = seq.map(() => 1);
  const prev = seq.map(() => -1);
  let best = -1;
  for (let i = 0; i < seq.length; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j] < seq[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
    if (best < 0 || len[i] > len[best]) best = i;
  }
  const stay = new Set();
  for (let i = best; i >= 0; i = prev[i]) stay.add(i);
  const out = [];
  desired.forEach((id, i) => {
    if (!stay.has(i)) out.push({ id, after: i === 0 ? '' : desired[i - 1] });
  });
  return out;
}

// 並べ替えられる組か（灰色＝削除した項目は動かさないので数えない）
export const canSortItems = (items) => items.filter((e) => !e.deletedRec).length > 1;
