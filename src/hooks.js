import { useEffect, useState } from 'react';

// 画面の条件（幅・カーソルの有無など）に合うか
export function useMedia(query) {
  const [v, setV] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(query);
    } catch {
      return undefined;
    }
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return v;
}

// カーソルを合わせられる端末（PC）か
export const useCanHover = () => useMedia('(hover: hover)');

// 要素の幅（変わったら測り直す）
export function useWidth(ref, fallback = 343) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(cw);
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// 画面の場所（#/map/iceberg など）。サーバー側の設定なしで読み込み直しても同じ画面に戻る
export function useHashRoute(fallback = 'home') {
  const read = () => {
    const h = (window.location.hash || '').replace(/^#\/?/, '');
    return h || fallback;
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  });
  const go = (path) => {
    if (read() !== path) window.location.hash = `#/${path}`;
  };
  return [route, go];
}

// 外側を押した時・Esc で閉じる
export function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const key = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, ref, onClose]);
}
