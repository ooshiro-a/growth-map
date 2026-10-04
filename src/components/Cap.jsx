import { useState } from 'react';

// 欄に出す数を絞る（スマホのホームだけ。PC は CSS で全部出す）
// 超えた分の項目に .over を付け、見出しに「ほか○件」（押すと開く・閉じる）を出す
export function useCap(count, limit) {
  const [open, setOpen] = useState(false);
  const capped = limit != null && count > limit;
  return {
    cls: capped ? (open ? ' capped open' : ' capped') : '',
    over: (i) => (capped && i >= limit ? 'over' : ''),
    button: capped ? (
      <button type="button" className="cap-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? '閉じる' : `ほか${count - limit}件`}
      </button>
    ) : null,
  };
}
