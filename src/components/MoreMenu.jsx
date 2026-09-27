import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '../hooks.js';

// 「…」ボタンと、押した時の選択肢（編集・追加・削除・履歴など）
// items: [{ label, onSelect, warn?, disabled? }]
export function MoreMenu({ items, label = '操作を選ぶ', small = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  // 下に入りきらない時（画面の下の方・下の切り替えの裏）は上に開く
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const nav = document.querySelector('.nav');
    const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    setUp(b.bottom + 4 + h > vh - navH && b.top - 4 - h > 0);
  }, [open]);

  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <span className={`more-wrap ${className}`} ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className={`more${open ? ' on' : ''}${small ? ' sm' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        …
      </button>
      {open && (
        <span className={`menu${up ? ' up' : ''}`} role="menu" ref={menuRef}>
          {list.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.warn ? 'warn' : ''}
              disabled={it.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                // 小窓を閉じた時に「…」へ戻れるように
                btnRef.current?.focus({ preventScroll: true });
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
