import { useEffect, useState } from 'react';

// カーソルを合わせられる端末（PC）か
export function useCanHover() {
  const [v, setV] = useState(() => {
    try {
      return window.matchMedia('(hover: hover)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia('(hover: hover)');
    } catch {
      return undefined;
    }
    const on = () => setV(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return v;
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
