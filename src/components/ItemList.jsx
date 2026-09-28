import { useState } from 'react';
import { useApp } from '../app-context.js';
import { newId } from '../lib/ids.js';
import { dateLine } from '../lib/labels.js';
import { OP, PER_YEAR_KINDS } from '../lib/schema.js';
import { HistorySheet } from './HistorySheet.jsx';
import { ConfirmDialog, EditDialog } from './Modal.jsx';
import { MoreMenu } from './MoreMenu.jsx';
import { PURGE_LABEL, PurgeDialog } from './PurgeDialog.jsx';
import { ItemRow } from './ItemRow.jsx';

const isPending = (e) => e.history.some((r) => r.pending);

// 文言だけの項目の並び（指標・自分軸・動作確認など）
// 「…」：編集／この下に追加／削除（灰色で残る）／履歴／完全に削除。削除した項目は履歴と完全に削除だけ
export function ItemList({ kind, layer = '', year = null, title, emptyText = 'まだありません', addLabel = '追加する', viewOnly = false }) {
  const { model, write, readOnly } = useApp();
  const perYear = PER_YEAR_KINDS.has(kind);
  const v = model.view(kind, year);
  const items = model.list(v, `L:${layer}`).filter((e) => perYear || year == null || e.year === year);
  const locked = viewOnly || readOnly;
  const [dialog, setDialog] = useState(null);

  // 書けなかった時（年が変わった等）は false を返し、入力の小窓を残す
  const ok = (rows) => rows != null;
  const add = (text, after) =>
    ok(write([{ year: year ?? '', kind, id: newId(), op: OP.ADD, layer, text, extra: after === undefined ? undefined : { after } }]));
  const edit = (e, text) => ok(write([{ year: year ?? '', kind, id: e.id, op: OP.EDIT, text }]));
  const remove = (e) => ok(write([{ year: year ?? '', kind, id: e.id, op: OP.DELETE }]));

  const menuFor = (e) =>
    locked
      ? [{ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) }]
      : e.deletedRec
      ? [
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', e }) },
        ]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', e }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', after: e.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', e }) },
        ];

  return (
    <section className="list">
      <div className="sec">
        <span>{title}</span>
        {!locked && <MoreMenu small label={`${title}の操作`} items={[{ label: addLabel, onSelect: () => setDialog({ type: 'add' }) }]} />}
      </div>
      {items.length === 0 && <p className="note">{emptyText}</p>}
      {items.map((e) => (
        <ItemRow
          key={e.id}
          text={e.text}
          date={dateLine(e, { perYear })}
          deleted={!!e.deletedRec}
          pending={isPending(e)}
          menu={menuFor(e)}
        />
      ))}

      {dialog?.type === 'add' && (
        <EditDialog title={addLabel} onClose={() => setDialog(null)} onSave={(t) => add(t, dialog.after)} saveLabel="追加する" />
      )}
      {dialog?.type === 'edit' && (
        <EditDialog title="編集する" initial={dialog.e.text} onClose={() => setDialog(null)} onSave={(t) => edit(dialog.e, t)} />
      )}
      {dialog?.type === 'del' && (
        <ConfirmDialog
          title="削除する"
          message={`「${dialog.e.text}」を削除します。消さずに灰色で残ります。`}
          okLabel="削除する"
          warn
          onOk={() => remove(dialog.e)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'purge' && <PurgeDialog e={dialog.e} year={year ?? ''} note={perYear ? '前の年からも消えます。' : ''} onClose={() => setDialog(null)} />}
      {dialog?.type === 'hist' && <HistorySheet kind={kind} id={dialog.e.id} title={dialog.e.text} onClose={() => setDialog(null)} />}
    </section>
  );
}
