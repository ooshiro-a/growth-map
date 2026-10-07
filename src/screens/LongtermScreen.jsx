import { useState } from 'react';
import { useApp } from '../app-context.js';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, Modal, enterToSave } from '../components/Modal.jsx';
import { PURGE_LABEL, PurgeDialog } from '../components/PurgeDialog.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { GRAY_NOTE, SORT_LABEL, SortHead, SortRow, shift } from '../components/Sort.jsx';
import { newId } from '../lib/ids.js';
import { dateLine } from '../lib/labels.js';
import { orderMoves } from '../lib/order.js';
import { ROADMAP_PARTS, childItems, roadmapItems } from '../lib/review.js';
import { KIND, LAYER, OP } from '../lib/schema.js';

const K = KIND.LONGTERM;
const SKILL = LAYER.ROADMAP_SKILL;
const LONG = LAYER.LONG_SKILL;
const SUB = LAYER.LONG_SUB;
const LONG_LABEL = '習得すべきスキル';
const SKILL_LABEL = '必要なスキルや考え方など';
const SUB_LABEL = 'サブスキル';
// 上から：習得すべきスキル（＞サブスキル）、仕事面・プライベート面（＞必要なスキルや考え方など）
const PARTS = [{ layer: LONG, label: LONG_LABEL }, ...ROADMAP_PARTS];
// 親の層 → 下の段の層・親の呼び名
const CHILD = { [LAYER.ROADMAP_WORK]: SKILL, [LAYER.ROADMAP_PRIVATE]: SKILL, [LONG]: SUB };
const OWNER = { [LAYER.ROADMAP_WORK]: '姿', [LAYER.ROADMAP_PRIVATE]: '姿', [LONG]: 'スキル' };
const NAME = { [SKILL]: SKILL_LABEL, [LONG]: LONG_LABEL, [SUB]: SUB_LABEL };
const isPending = (e) => e.history.some((r) => r.pending);

// 入れる欄（text は必須、ほかは空でもよい）
const VISION = [
  { key: 'when', label: '時期', placeholder: '例：2030年・40歳' },
  { key: 'text', label: 'ありたい姿', multiline: true },
];
const FIELDS = {
  [LAYER.ROADMAP_WORK]: VISION,
  [LAYER.ROADMAP_PRIVATE]: VISION,
  [SKILL]: [{ key: 'text', label: SKILL_LABEL }],
  [LONG]: [{ key: 'text', label: LONG_LABEL }],
  [SUB]: [{ key: 'text', label: SUB_LABEL }],
};
const nameOf = (layer) => NAME[layer] || 'ありたい姿';
// 親の項目なら「この姿の必要なスキルや考え方なども」などの言い回し。下の段の項目は ''
const kidsOf = (e) => (CHILD[e.layer] ? `この${OWNER[e.layer]}の${NAME[CHILD[e.layer]]}も` : '');

// 追加・編集の小窓（複数の欄）。onSave が false を返したら閉じない
function FieldsDialog({ title, layer, entity = null, saveLabel, onSave, onClose }) {
  const fields = FIELDS[layer];
  const initial = {};
  for (const f of fields) initial[f.key] = entity ? (f.key === 'text' ? entity.text : entity.attrs[f.key] || '') : '';
  const [vals, setVals] = useState(initial);
  const clean = {};
  for (const f of fields) clean[f.key] = (vals[f.key] || '').trim();
  const changed = fields.some((f) => clean[f.key] !== (initial[f.key] || '').trim());
  const canSave = !!clean.text && changed;
  const dirty = fields.some((f) => vals[f.key] !== initial[f.key]);
  const save = () => {
    if (!canSave) return;
    if (onSave(clean) === false) return;
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      keep={dirty}
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
      {fields.map((f) => (
        <label key={f.key} className="fld">
          <span className="lbl">
            {f.label}
            {f.key !== 'text' && <small>（空でもよい）</small>}
          </span>
          {f.multiline ? (
            <textarea
              className="field"
              rows={3}
              maxLength={2000}
              value={vals[f.key]}
              placeholder={f.placeholder || ''}
              onChange={(ev) => setVals({ ...vals, [f.key]: ev.target.value })}
            />
          ) : (
            <input
              className="field"
              maxLength={300}
              value={vals[f.key]}
              placeholder={f.placeholder || ''}
              enterKeyHint="done"
              onChange={(ev) => setVals({ ...vals, [f.key]: ev.target.value })}
              onKeyDown={(ev) => enterToSave(ev, save)}
            />
          )}
        </label>
      ))}
    </Modal>
  );
}

// 書く・消す・並べ替えの共通（長期プランは年をまたぐので年は空欄）
function useLongtermWrite() {
  const { write } = useApp();
  const ok = (rows) => rows != null;
  const attrsOf = (layer, vals, forEdit) => {
    const out = {};
    for (const f of FIELDS[layer]) {
      if (f.key === 'text') continue;
      // 追加は入れた欄だけ。編集は空にした欄も書く（消したことが分かるように）
      if (forEdit || vals[f.key]) out[f.key] = vals[f.key];
    }
    return out;
  };
  return {
    add: (layer, vals, { after, parent = '' } = {}) => {
      const extra = attrsOf(layer, vals, false);
      if (after !== undefined) extra.after = after;
      return ok(write([{ year: '', kind: K, id: newId(), op: OP.ADD, layer, parent, text: vals.text, extra }]));
    },
    edit: (e, vals) => ok(write([{ year: '', kind: K, id: e.id, op: OP.EDIT, text: vals.text, extra: attrsOf(e.layer, vals, true) }])),
    remove: (e) => ok(write([{ year: '', kind: K, id: e.id, op: OP.DELETE }])),
    // moves：[{id, after}]（同じ組の中だけ。親と層は変えない）
    move: (moves) => moves.length === 0 || ok(write(moves.map(({ id, after }) => ({ year: '', kind: K, id, op: OP.MOVE, extra: { after } })))),
  };
}

// 小窓（追加・編集・削除・履歴）をまとめて出す
function Dialogs({ dialog, setDialog, lt }) {
  if (!dialog) return null;
  const close = () => setDialog(null);
  const { type, e, layer, after, parent } = dialog;
  const kids = e ? kidsOf(e) : '';
  if (type === 'add') return <FieldsDialog title={`${nameOf(layer)}を追加`} layer={layer} saveLabel="追加する" onSave={(v) => lt.add(layer, v, { after, parent })} onClose={close} />;
  if (type === 'edit') return <FieldsDialog title={`${nameOf(e.layer)}を編集`} layer={e.layer} entity={e} saveLabel="保存する" onSave={(v) => lt.edit(e, v)} onClose={close} />;
  if (type === 'del')
    return (
      <ConfirmDialog
        title="削除する"
        message={`「${e.text}」を削除します。消さずに灰色で残ります。${kids && `${kids}灰色になります。`}`}
        okLabel="削除する"
        warn
        onOk={() => lt.remove(e)}
        onClose={close}
      />
    );
  if (type === 'purge') return <PurgeDialog e={e} note={kids && `${kids}いっしょに消えます。`} onClose={close} />;
  if (type === 'hist') return <HistorySheet kind={K} id={e.id} title={e.text} onClose={close} />;
  return null;
}

// 並べ替えの下書き：生きている親と、その下の生きている項目の番号
function liveOrder(model, layer) {
  const top = roadmapItems(model, layer).filter((e) => !e.deletedRec);
  const kids = {};
  for (const e of top) kids[e.id] = childItems(model, e, CHILD[layer]).filter((s) => !s.deleted).map((s) => s.e.id);
  return { top: top.map((e) => e.id), kids };
}
const canSort = (o) => o.top.length > 1 || Object.values(o.kids).some((k) => k.length > 1);

// 1つの面の並べ替え。↑↓ は下書きだけ動かし、「保存する」で動いた項目の分だけ記録を足す
function SortPart({ label, layer, onDone }) {
  const { model } = useApp();
  const lt = useLongtermWrite();
  const [start] = useState(() => liveOrder(model, layer));
  const [draft, setDraft] = useState(start);
  const v = model.flat(K);
  const get = (id) => v.entities.get(id);
  const moves = [
    ...orderMoves(start.top, draft.top),
    ...start.top.flatMap((id) => orderMoves(start.kids[id], draft.kids[id])),
  ];
  const save = () => {
    if (lt.move(moves)) onDone();
  };
  const hasGray = roadmapItems(model, layer).some((e) => e.deletedRec || childItems(model, e, CHILD[layer]).some((s) => s.deleted));
  return (
    <section className="list sorting" aria-label={`${label}の並べ替え`}>
      <SortHead label={label} canSave={moves.length > 0} onCancel={onDone} onSave={save} />
      {draft.top.map((id, i) => {
        const kids = draft.kids[id];
        return (
          <div key={id} className="sort-group">
            <SortRow e={get(id)} i={i} n={draft.top.length} onMove={(at, d) => setDraft({ ...draft, top: shift(draft.top, at, d) })} />
            {kids.length > 0 && (
              <div className="means">
                {kids.map((sid, j) => (
                  <SortRow
                    key={sid}
                    className="skill"
                    e={get(sid)}
                    i={j}
                    n={kids.length}
                    onMove={(at, d) => setDraft({ ...draft, kids: { ...draft.kids, [id]: shift(kids, at, d) } })}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {hasGray && <p className="note">{GRAY_NOTE}</p>}
    </section>
  );
}

// 1つの面：親（時期＋ありたい姿／習得すべきスキル）と、その下の段（必要なスキルや考え方など／サブスキル）
function Part({ label, layer, locked, onSort, setDialog }) {
  const { model } = useApp();
  const items = roadmapItems(model, layer);
  const child = CHILD[layer];
  const childName = NAME[child];
  const sortable = !locked && canSort(liveOrder(model, layer));
  const hist = (e) => ({ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) });
  const purge = (e) => ({ label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', e }) });
  const sortItem = sortable ? [{ label: SORT_LABEL, onSelect: onSort }] : [];
  const visionMenu = (e) =>
    locked
      ? [hist(e)]
      : e.deletedRec
      ? [hist(e), purge(e)]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', e }) },
          { label: `${childName}を追加`, onSelect: () => setDialog({ type: 'add', layer: child, parent: e.id }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', layer: e.layer, after: e.id }) },
          ...sortItem,
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e }) },
          hist(e),
          purge(e),
        ];
  const skillMenu = (s, deleted) =>
    locked
      ? [hist(s)]
      : deleted
      ? [hist(s), purge(s)]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', e: s }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', layer: child, parent: s.parent, after: s.id }) },
          ...sortItem,
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e: s }) },
          hist(s),
          purge(s),
        ];
  return (
    <section className="list">
      <div className="sec">
        <span>{label}</span>
        {!locked && (
          <MoreMenu small label={`${label}の操作`} items={[{ label: '追加する', onSelect: () => setDialog({ type: 'add', layer }) }, ...sortItem]} />
        )}
      </div>
      {items.length === 0 && <p className="note">まだありません</p>}
      {items.map((e) => {
        const skills = childItems(model, e, child);
        return (
          <div key={e.id} className={`vision${e.deletedRec ? ' del' : ''}`}>
            <ItemRow
              text={e.text}
              lead={e.attrs.when || null}
              date={dateLine(e)}
              deleted={!!e.deletedRec}
              pending={isPending(e)}
              menu={visionMenu(e)}
            />
            {(skills.length > 0 || !(locked || e.deletedRec)) && (
              <div className="means skills">
                {skills.length === 0 && <p className="note">（「…」→「{childName}を追加」）</p>}
                {skills.map(({ e: s, deleted }) => (
                  <ItemRow
                    key={s.id}
                    className="skill"
                    text={s.text}
                    date={dateLine(s, { deleted })}
                    deleted={!!deleted}
                    pending={isPending(s)}
                    menu={skillMenu(s, deleted)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// 長期プラン（年をまたぐ）：習得すべきスキル ＞ サブスキル、仕事面／プライベート面 ＞ 時期＋ありたい姿 ＞ 必要なスキルや考え方など
export function LongtermScreen() {
  const { readOnly } = useApp();
  const lt = useLongtermWrite();
  const [dialog, setDialog] = useState(null);
  const [sorting, setSorting] = useState(null); // 並べ替え中の面の層
  const part = ({ layer, label }) =>
    sorting === layer && !readOnly ? (
      <SortPart key={layer} label={label} layer={layer} onDone={() => setSorting(null)} />
    ) : (
      <Part key={layer} label={label} layer={layer} locked={readOnly} onSort={() => setSorting(layer)} setDialog={setDialog} />
    );
  return (
    <div className="longterm-screen">
      {part(PARTS[0])}
      {/* 仕事面・プライベート面：PC は左右に並べる（スマホは縦） */}
      <div className="plan-cols">{PARTS.slice(1).map(part)}</div>
      <p className="note">ありたい姿は時期の遠い順（ありたい姿から逆算）に並べると見やすくなります。「…」→「並べ替える」で順番を変えられます</p>
      <Dialogs dialog={dialog} setDialog={setDialog} lt={lt} />
    </div>
  );
}
