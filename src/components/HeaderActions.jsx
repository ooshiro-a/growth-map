import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// 画面の右上（上の帯）に、その画面のボタン（「＋追加」など）を出す
export function HeaderActions({ children }) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    setEl(document.getElementById('bar-actions'));
  }, []);
  return el ? createPortal(children, el) : null;
}
