import { useState } from 'react';
import { useCanHover } from '../hooks.js';
import { MoreMenu } from './MoreMenu.jsx';

// 1つの項目：文言＋「…」。押すと（PCはカーソルを合わせると）小さな灰色の日付が出る。もう一度押すと消える
// 削除した項目は灰色で残る
// lead：文言の前に出す小さな札（時期など）／sub：文言の下に出す補足（頻度・打ち手など）
export function ItemRow({ text, date, deleted = false, pending = false, menu, aside = null, lead = null, sub = null, className = '' }) {
  const canHover = useCanHover();
  const [show, setShow] = useState(false);
  return (
    <div
      className={`item rv${show ? ' show' : ''}${deleted ? ' del' : ''} ${className}`}
      tabIndex={0}
      onClick={() => {
        if (!canHover) setShow((s) => !s);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) setShow((s) => !s);
      }}
    >
      <div className="row">
        <span className="tx">
          {lead && <span className="lead">{lead}</span>}
          {text}
        </span>
        {aside}
        {menu && <MoreMenu items={menu} label={`「${text}」の操作`} />}
      </div>
      {sub && <div className="subline">{sub}</div>}
      <div className="date">
        {date}
        {pending && <span className="pend">（未保存）</span>}
      </div>
    </div>
  );
}
