import { useEffect, useRef, useState } from 'react';

// 画面に見えている範囲（iPhone でキーボードが出た時は、その上だけ）に小窓を合わせる
function useVisibleArea(ref) {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const el = ref.current;
    if (!vv || !el) return undefined;
    const fit = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, [ref]);
}

// 1行の入力で Enter を押したら保存する
// 変換を確定する Enter では保存しない（Safari は isComposing が false で keyCode 229 になる）
export function enterToSave(e, save) {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) save();
}

// 下から出る小さな画面（スマホ）／中央の小窓（PC）
// keep：外側を押しても閉じない（書きかけの文字を消さないように）
export function Modal({ title, onClose, children, footer, keep = false }) {
  const ref = useRef(null);
  const overlayRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useVisibleArea(overlayRef);
  useEffect(() => {
    const before = document.activeElement;
    const key = (e) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', key);
    const el = ref.current;
    const first = el && (el.querySelector('input, textarea, select') || el.querySelector('.sheet-foot button, button'));
    if (first) first.focus();
    return () => {
      document.removeEventListener('keydown', key);
      // 閉じたら、開く前の場所（「…」など）に戻る
      if (before && before.isConnected && typeof before.focus === 'function') before.focus();
    };
  }, []);
  return (
    <div className="overlay" ref={overlayRef} onPointerDown={(e) => e.target === e.currentTarget && !keep && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head">
          <b>{title}</b>
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

// 文言を入れる（追加・編集）。onSave が false を返したら閉じない（書けなかった時に入力を残す）
export function EditDialog({ title, initial = '', multiline = false, placeholder = '', saveLabel = '保存する', maxLength, onSave, onClose, children }) {
  const [text, setText] = useState(initial);
  const clean = text.trim();
  const limit = maxLength ?? (multiline ? 5000 : 300);
  const canSave = !!clean && clean !== initial.trim();
  const save = () => {
    if (!canSave) return;
    if (onSave(clean) === false) return;
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      keep={text !== initial}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            やめる
          </button>
          <button type="button" className="btn primary" disabled={!canSave} onClick={save}>
            {saveLabel}
          </button>
        </>
      }
    >
      {multiline ? (
        <textarea className="field" rows={5} maxLength={limit} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      ) : (
        <input
          className="field"
          maxLength={limit}
          value={text}
          placeholder={placeholder}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => enterToSave(e, save)}
        />
      )}
      {children}
    </Modal>
  );
}

// 確かめる（削除など）
export function ConfirmDialog({ title, message, okLabel = 'はい', warn = false, onOk, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            やめる
          </button>
          <button
            type="button"
            className={`btn ${warn ? 'danger' : 'primary'}`}
            onClick={() => {
              if (onOk() === false) return;
              onClose();
            }}
          >
            {okLabel}
          </button>
        </>
      }
    >
      <p className="sheet-msg">{message}</p>
    </Modal>
  );
}
