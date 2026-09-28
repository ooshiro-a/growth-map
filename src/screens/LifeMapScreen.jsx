import { useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context.js';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ConfirmDialog, EditDialog, Modal } from '../components/Modal.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { now } from '../lib/clock.js';
import { jstParts } from '../lib/dates.js';
import { newId } from '../lib/ids.js';
import { dateLine } from '../lib/labels.js';
import { ROOT_ID, deepIds, lifeTree, toOutline } from '../lib/lifemap.js';
import { KIND, OP } from '../lib/schema.js';

const M = KIND.MAP;
const ZOOMS = [0.55, 0.7, 0.85, 1, 1.15, 1.3];
const PAPER = '#F5F2EA';
const isPending = (e) => e.history.some((r) => r.pending);

// 元に戻す：この端末で、ページを開いてから書いた記録だけ（新しい順に1つずつ打ち消す）
// 取り込んだ中身や、別の端末で書いたものは戻さない
const undoStack = []; // [{ env, no, id, label }]

// 1本の枝（旧アプリの形：真ん中は金、最初の枝は朱・藍・松葉・菖蒲の順）
function Branch({ node, color, ui }) {
  const { e, depth, deleted, children } = node;
  const collapsed = ui.collapsed.has(e.id);
  const selected = ui.selected === e.id;
  const size = depth === 0 ? 'lm-root' : depth === 1 ? 'lm-main' : 'lm-leaf';
  return (
    <div className={`lm-branch ${color}${deleted ? ' del' : ''}`}>
      <div className="lm-row">
        <div className={`lm-node ${size}${selected ? ' sel' : ''}`}>
          <button
            type="button"
            className="lm-text"
            aria-pressed={selected}
            onClick={(ev) => {
              ev.stopPropagation();
              ui.select(selected ? null : e.id);
            }}
          >
            {e.text}
          </button>
          <div className="lm-pop" onClick={(ev) => ev.stopPropagation()}>
            <span className="date">
              {dateLine(e, { deleted })}
              {isPending(e) && <span className="pend">（未保存）</span>}
            </span>
            <MoreMenu small items={ui.menuFor(node)} label={`「${e.text}」の操作`} />
          </div>
        </div>
        {children.length > 0 && (
          <button
            type="button"
            className="lm-tg"
            aria-label={collapsed ? `枝を開く（${children.length}）` : `枝をたたむ：${e.text}`}
            onClick={(ev) => {
              ev.stopPropagation();
              ui.toggle(e.id);
            }}
          >
            {collapsed ? children.length : '−'}
          </button>
        )}
        {children.length > 0 && !collapsed && (
          <>
            <div className="lm-stub" />
            <div className="lm-kids">
              {children.map((c, i) => (
                <Branch key={c.e.id} node={c} color={depth === 0 ? `c${i % 4}` : color} ui={ui} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 文章として書き出す
function OutlineDialog({ text, onClose }) {
  const ref = useRef(null);
  const [msg, setMsg] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg('コピーしました');
      return;
    } catch {
      /* 下へ */
    }
    try {
      ref.current.focus();
      ref.current.select();
      if (document.execCommand('copy')) {
        setMsg('コピーしました');
        return;
      }
    } catch {
      /* 下へ */
    }
    setMsg('自動でコピーできませんでした。下の文章を長押し（PCは Ctrl+A → Ctrl+C）してコピーしてください');
  };
  return (
    <Modal
      title="文章として書き出す"
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={copy}>
          全部コピーする
        </button>
      }
    >
      <p className="note">控えや、ほかの場所への貼り付けに使えます（削除した項目は入りません）</p>
      {msg && <p className={msg === 'コピーしました' ? 'ok' : 'err'}>{msg}</p>}
      <textarea ref={ref} className="field mono" rows={12} readOnly value={text} aria-label="書き出した文章" onFocus={(ev) => ev.target.select()} />
    </Modal>
  );
}

// 人生マップ：なりたい姿／なりたくない姿の木（年をまたいで続く）
export function LifeMapScreen() {
  const { model, write, readOnly, env } = useApp();
  const tree = useMemo(() => lifeTree(model), [model]);
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [zoomIdx, setZoomIdx] = useState(3);
  const [dialog, setDialog] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setUndoCount] = useState(undoStack.length);
  const mapRef = useRef(null);
  const msgTimer = useRef(null);
  const close = () => setDialog(null);

  const say = (m, ms = 2500) => {
    setMsg(m);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(''), ms);
  };

  const mine = undoStack.filter((u) => u.env === env);
  const put = (draft, label) => {
    const rows = write([draft]);
    if (rows == null) return false;
    undoStack.push({ env, no: rows[0][2], id: draft.id, label });
    setUndoCount(undoStack.length);
    return true;
  };
  const addNode = (parent, text, after) => {
    const id = parent ? newId() : ROOT_ID;
    const ok = put({ year: '', kind: M, id, parent: parent || '', op: OP.ADD, text, extra: after === undefined ? undefined : { after } }, `「${text}」の追加`);
    if (ok) {
      setSelected(id);
      if (parent) setCollapsed((s) => (s.has(parent) ? new Set([...s].filter((x) => x !== parent)) : s));
    }
    return ok;
  };
  const edit = (e, text) => put({ year: '', kind: M, id: e.id, op: OP.EDIT, text }, `「${text}」への修正`);
  const remove = (e) => {
    const ok = put({ year: '', kind: M, id: e.id, op: OP.DELETE }, `「${e.text}」の削除`);
    if (ok) setSelected(null);
    return ok;
  };
  const undo = () => {
    let i = undoStack.length - 1;
    while (i >= 0 && undoStack[i].env !== env) i--;
    if (i < 0) return;
    const u = undoStack[i];
    const rows = write([{ year: '', kind: M, id: u.id, op: OP.UNDO, extra: { undo: u.no } }]);
    if (rows == null) return;
    undoStack.splice(i, 1);
    setUndoCount(undoStack.length);
    setSelected(null);
    say(`ひとつ前に戻しました（${u.label}を取り消し）`, 3500);
  };

  const menuFor = (node) => {
    const { e, depth, deleted } = node;
    const hist = { label: '履歴', onSelect: () => setDialog({ type: 'hist', e }) };
    if (deleted || readOnly) return [hist];
    return [
      { label: '文字を直す', onSelect: () => setDialog({ type: 'edit', e }) },
      { label: '枝を伸ばす', onSelect: () => setDialog({ type: 'child', e }) },
      depth > 0 && { label: '下に追加', onSelect: () => setDialog({ type: 'sibling', e }) },
      depth > 0 && { label: '削除', warn: true, onSelect: () => setDialog({ type: 'del', e, kids: node.children.length > 0 }) },
      hist,
    ];
  };
  const ui = {
    selected,
    collapsed,
    menuFor,
    select: setSelected,
    toggle: (id) =>
      setCollapsed((s) => {
        const c = new Set(s);
        if (c.has(id)) c.delete(id);
        else c.add(id);
        return c;
      }),
  };

  const exportPdf = async () => {
    if (busy || !tree) return;
    setBusy(true);
    setSelected(null);
    const prevZoom = zoomIdx;
    setZoomIdx(3); // 等倍にして撮る
    say('PDFを作っています…（数秒かかります）', 60000);
    try {
      // 部品はアプリの中に入れてあり、押した時だけ読み込む（外のサイトにはつながない）
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      await new Promise((r) => setTimeout(r, 300));
      const el = mapRef.current;
      const w = el.scrollWidth;
      const h = el.scrollHeight;
      const scale = Math.max(1, Math.min(2, Math.sqrt(14000000 / (w * h))));
      const canvas = await html2canvas(el, { backgroundColor: PAPER, scale, logging: false });
      const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'], compress: true });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h, undefined, 'FAST');
      const p = jstParts(now());
      const pad = (n) => String(n).padStart(2, '0');
      pdf.save(`人生マップ_${p.year}-${pad(p.month)}-${pad(p.day)}.pdf`);
      say('PDFを保存しました');
    } catch {
      say('PDFを作れませんでした。もう一度お試しください', 4500);
    } finally {
      setZoomIdx(prevZoom);
      setBusy(false);
    }
  };

  const toolMenu = [
    { label: 'すべての枝を開く', onSelect: () => setCollapsed(new Set()) },
    { label: '深い枝をたたむ', onSelect: () => setCollapsed(new Set(deepIds(tree))) },
    { label: 'PDFで保存', disabled: busy, onSelect: exportPdf },
    { label: '文章として書き出す', onSelect: () => setDialog({ type: 'outline' }) },
  ];

  if (!tree) {
    return (
      <div className="lifemap-screen">
        <section className="list">
          <div className="sec">
            <span>人生マップ</span>
          </div>
          <p className="note">まだありません。旧マインドマップは「設定」の「初回の取り込み」から入れられます（取り込みは、人生マップに何も書いていない時だけ）</p>
          {!readOnly && (
            <button type="button" className="btn" onClick={() => setDialog({ type: 'root' })}>
              真ん中を作る
            </button>
          )}
        </section>
        {dialog?.type === 'root' && <EditDialog title="真ん中を作る" saveLabel="作る" placeholder="例：人生" onClose={close} onSave={(t) => addNode(null, t)} />}
      </div>
    );
  }

  return (
    <div className="lifemap-screen">
      <div className="lm-tools">
        {!readOnly && (
          <button type="button" className="btn small" disabled={mine.length === 0} onClick={undo}>
            元に戻す
          </button>
        )}
        <button type="button" className="btn small lm-z" aria-label="縮小" disabled={zoomIdx === 0} onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}>
          －
        </button>
        <button type="button" className="btn small lm-z" aria-label="拡大" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))}>
          ＋
        </button>
        <span className="lm-msg" role="status">
          {msg}
        </span>
        <MoreMenu items={toolMenu} label="人生マップの操作" />
      </div>
      <p className="note lm-hint">項目を押すと、日付と「…」が出ます</p>

      <div className={`lm-wrap${busy ? ' busy' : ''}`} onClick={() => setSelected(null)}>
        <div ref={mapRef} className="lm-map" style={{ zoom: ZOOMS[zoomIdx] }}>
          <Branch node={tree} color="gold" ui={ui} />
        </div>
      </div>

      {dialog?.type === 'edit' && <EditDialog title="文字を直す" initial={dialog.e.text} onClose={close} onSave={(t) => edit(dialog.e, t)} />}
      {dialog?.type === 'child' && (
        <EditDialog title="枝を伸ばす" saveLabel="追加する" placeholder={`「${dialog.e.text}」の先に足す言葉`} onClose={close} onSave={(t) => addNode(dialog.e.id, t)} />
      )}
      {dialog?.type === 'sibling' && (
        <EditDialog title="下に追加" saveLabel="追加する" placeholder={`「${dialog.e.text}」の下に並べる言葉`} onClose={close} onSave={(t) => addNode(dialog.e.parent, t, dialog.e.id)} />
      )}
      {dialog?.type === 'del' && (
        <ConfirmDialog
          title="削除する"
          message={`「${dialog.e.text}」を削除します。消さずに灰色で残ります。${dialog.kids ? 'この先の枝もいっしょに灰色になります。' : ''}`}
          okLabel="削除する"
          warn
          onOk={() => remove(dialog.e)}
          onClose={close}
        />
      )}
      {dialog?.type === 'hist' && <HistorySheet kind={M} id={dialog.e.id} title={dialog.e.text} onClose={close} />}
      {dialog?.type === 'outline' && <OutlineDialog text={toOutline(tree)} onClose={close} />}
    </div>
  );
}
