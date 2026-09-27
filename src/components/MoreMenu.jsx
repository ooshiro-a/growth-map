import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EDGE = 8; // 画面の端からの余白

// 選択肢を置く場所：「…」の右端にそろえて下に開く。下に入らなければ上に。
// 左右は画面の中に収める（図の中の言葉など、画面の左の方にある「…」でも切れないように）
function placeMenu(btn, menu) {
  const b = btn.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vv = window.visualViewport;
  const vh = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const nav = document.querySelector('.nav');
  const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
  const bottom = vh - navH - 4;
  let top = b.bottom + 4;
  if (top + h > bottom) top = b.top - 4 - h >= EDGE ? b.top - 4 - h : Math.max(EDGE, bottom - h);
  const left = Math.max(EDGE, Math.min(b.right - w, vw - EDGE - w));
  return { top, left };
}

// 「…」ボタンと、押した時の選択肢（編集・追加・削除・履歴など）
// 選択肢は画面のいちばん上の層に出す（小窓の中の一覧で、枠に切られないように）
// items: [{ label, onSelect, warn?, disabled? }]
export function MoreMenu({ items, label = '操作を選ぶ', small = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const byKey = useRef(false);

  const close = useCallback((back = false) => {
    setOpen(false);
    if (back) btnRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    if (!btnRef.current || !menuRef.current) return;
    setPos(placeMenu(btnRef.current, menuRef.current));
  }, [open]);

  // キーボードで開いた時は、置き場所が決まって見えるようになってから最初の選択肢へ
  useLayoutEffect(() => {
    if (!pos || !byKey.current || !menuRef.current) return;
    byKey.current = false;
    menuRef.current.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [pos]);

  // 外側を押した時・Esc・画面が動いた時に閉じる
  useEffect(() => {
    if (!open) return undefined;
    const inside = (t) => (btnRef.current && btnRef.current.contains(t)) || (menuRef.current && menuRef.current.contains(t));
    const down = (e) => {
      if (!inside(e.target)) close();
    };
    const key = (e) => {
      if (e.key === 'Escape') close(true);
    };
    const moved = (e) => {
      if (!(menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target))) close();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    document.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      document.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    };
  }, [open, close]);

  // 選択肢の中：上下の矢印で動く。Tab で閉じて「…」の次へ
  const onMenuKey = (e) => {
    const list = [...menuRef.current.querySelectorAll('button:not(:disabled)')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    } else if (e.key === 'Tab') {
      close(true);
    }
  };

  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <span className={`more-wrap ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className={`more${open ? ' on' : ''}${small ? ' sm' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          byKey.current = e.detail === 0;
          setOpen((o) => !o);
        }}
      >
        …
      </button>
      {open &&
        createPortal(
          <span
            className="menu"
            role="menu"
            aria-label={label}
            ref={menuRef}
            style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
            onKeyDown={onMenuKey}
          >
            {list.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.warn ? 'warn' : ''}
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  // 小窓を閉じた時に「…」へ戻れるように
                  close(true);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            ))}
          </span>,
          document.body,
        )}
    </span>
  );
}
