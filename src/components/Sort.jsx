import { useState } from 'react';
import { orderMoves } from '../lib/order.js';

// 並べ替えの共通部品：欄を ↑↓ の形にし、「保存する」で動いた項目の分だけ記録を足す。「やめる」は何も書かない
// 灰色（削除した項目）は動かさない（削除より後の記録は姿を変えない決まり）
export const SORT_LABEL = '並べ替える';
export const GRAY_NOTE = '灰色（削除した項目）は元の場所のまま動きません';

// 配列の i 番目を d（-1 上・+1 下）へ1つ動かす
export const shift = (list, i, d) => {
  const out = list.slice();
  [out[i], out[i + d]] = [out[i + d], out[i]];
  return out;
};

// 見出し：「○○を並べ替え」と やめる／保存する
export function SortHead({ label, canSave, onCancel, onSave }) {
  return (
    <div className="sec">
      <span>{label}を並べ替え</span>
      <span className="sort-acts">
        <button type="button" className="btn small" onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="btn small primary" disabled={!canSave} onClick={onSave}>
          保存する
        </button>
      </span>
    </div>
  );
}

// 1行：文言（時期があれば前に）と ↑↓
export function SortRow({ e, i, n, onMove, className = '' }) {
  if (!e) return null; // 並べ替え中に別の端末で完全に削除された時
  return (
    <div className={`item sort-row ${className}`}>
      <span className="tx">
        {e.attrs?.when && <span className="lead">{e.attrs.when}</span>}
        {e.text}
      </span>
      <span className="sort-btns">
        <button type="button" className="sort-btn" aria-label={`「${e.text}」を上へ`} disabled={i === 0} onClick={() => onMove(i, -1)}>
          ↑
        </button>
        <button type="button" className="sort-btn" aria-label={`「${e.text}」を下へ`} disabled={i === n - 1} onClick={() => onMove(i, 1)}>
          ↓
        </button>
      </span>
    </div>
  );
}

// 1段の欄の並べ替え。items：今の並び（灰色も含む）。onSave(moves) が false なら閉じない
export function SortList({ label, items, onSave, onDone, className = '' }) {
  const [start] = useState(() => items.filter((e) => !e.deletedRec).map((e) => e.id));
  const [draft, setDraft] = useState(start);
  const byId = new Map(items.map((e) => [e.id, e]));
  const moves = orderMoves(start, draft);
  const save = () => {
    if (onSave(moves) !== false) onDone();
  };
  return (
    <section className={`list sorting ${className}`} aria-label={`${label}の並べ替え`}>
      <SortHead label={label} canSave={moves.length > 0} onCancel={onDone} onSave={save} />
      {draft.map((id, i) => (
        <SortRow key={id} e={byId.get(id)} i={i} n={draft.length} onMove={(at, d) => setDraft(shift(draft, at, d))} />
      ))}
      {items.some((e) => e.deletedRec) && <p className="note">{GRAY_NOTE}</p>}
    </section>
  );
}
