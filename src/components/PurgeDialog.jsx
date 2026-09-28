import { useApp } from '../app-context.js';
import { purgeDrafts } from '../lib/purge.js';
import { ConfirmDialog } from './Modal.jsx';

export const PURGE_LABEL = '完全に削除する';

// 完全に削除する（間違えて足した時）。year：年ごとの種類はその画面の年（今年）
// note：消える範囲の補足（「この先の枝もいっしょに消えます。」など）
// onDone：書いた行を受け取る（人生マップの「元に戻す」に積む）
export function PurgeDialog({ e, year = '', note = '', undoable = false, onDone, onClose }) {
  const { model, write } = useApp();
  const tail = undoable ? '直後なら「元に戻す」で戻せます。' : '履歴にも出なくなり、元に戻せません。';
  return (
    <ConfirmDialog
      title={PURGE_LABEL}
      message={`「${e.text}」を画面から完全に消します。間違えて足した時のためのものです。${note}${tail}（シートの記録は残ります）`}
      okLabel={PURGE_LABEL}
      warn
      onOk={() => {
        const rows = write(purgeDrafts(model, e, year));
        if (rows == null) return false;
        if (onDone) onDone(rows);
        return true;
      }}
      onClose={onClose}
    />
  );
}
