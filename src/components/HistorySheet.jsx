import { useApp } from '../app-context.js';
import { historyText, recDate } from '../lib/labels.js';
import { KIND, OP, quarterOfLayer } from '../lib/schema.js';
import { Modal } from './Modal.jsx';

// 「2026年分」。四半期の目標・振り返りは「2026年3Q分」
function yearLabel(rec) {
  const q = rec.kind === KIND.GOAL || rec.kind === KIND.REVIEW ? quarterOfLayer(rec.layer) : null;
  return q ? `${rec.year}年${q}Q分 ` : `${rec.year}年分 `;
}

// 「…」→「履歴」：その項目の記録を古い順に全部出す（修正前の文言も）
export function HistorySheet({ kind, id, title, onClose }) {
  const { model } = useApp();
  const recs = model.historyOf(kind, id);
  return (
    <Modal title={`履歴：${title}`} onClose={onClose}>
      {recs.length === 0 ? (
        <p className="note">記録がありません</p>
      ) : (
        <ol className="hist">
          {recs.map((rec) => {
            const voided = rec.op !== OP.UNDO && !model.isEffective(rec);
            return (
              <li key={rec.no} className={voided ? 'voided' : ''}>
                <span className="hist-d">{rec.pending ? '未保存' : recDate(rec)}</span>
                <span className="hist-t">
                  {rec.year != null && <span className="hist-y">{yearLabel(rec)}</span>}
                  {historyText(rec, kind)}
                  {voided && '（打ち消し済み）'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
