import { useState } from 'react';
import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, Modal, enterToSave } from '../components/Modal.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { newId } from '../lib/ids.js';
import { attrText, dateLine } from '../lib/labels.js';
import { ROADMAP_PARTS, actionPlan, roadmapItems } from '../lib/review.js';
import { KIND, LAYER, OP } from '../lib/schema.js';

const K = KIND.LONGTERM;
const isPending = (e) => e.history.some((r) => r.pending);

// 入れる欄（text は必須、ほかは空でもよい）
const FIELDS = {
  [LAYER.ROADMAP_WORK]: [
    { key: 'when', label: '時期', placeholder: '例：2030年・40歳' },
    { key: 'text', label: 'ありたい姿', multiline: true },
  ],
  [LAYER.PLAN_GOAL]: [{ key: 'text', label: '目標' }],
  [LAYER.PLAN_MEANS]: [
    { key: 'text', label: '実行すること' },
    { key: 'freq', label: '頻度', placeholder: '例：週2回' },
    { key: 'tactic', label: '打ち手', multiline: true },
  ],
};
FIELDS[LAYER.ROADMAP_PRIVATE] = FIELDS[LAYER.ROADMAP_WORK];

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

// 書く・消すの共通（長期は年をまたぐので年は空欄）
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
  };
}

// 小窓（追加・編集・削除・履歴）をまとめて出す
function Dialogs({ dialog, setDialog, lt }) {
  if (!dialog) return null;
  const close = () => setDialog(null);
  const { type, e, layer, after, parent } = dialog;
  const name = { [LAYER.PLAN_GOAL]: '目標', [LAYER.PLAN_MEANS]: '手段' }[layer || e?.layer] || '項目';
  if (type === 'add') return <FieldsDialog title={`${name}を追加`} layer={layer} saveLabel="追加する" onSave={(v) => lt.add(layer, v, { after, parent })} onClose={close} />;
  if (type === 'edit') return <FieldsDialog title={`${name}を編集`} layer={e.layer} entity={e} saveLabel="保存する" onSave={(v) => lt.edit(e, v)} onClose={close} />;
  if (type === 'del')
    return (
      <ConfirmDialog
        title="削除する"
        message={`「${e.text}」を削除します。消さずに灰色で残ります。${e.layer === LAYER.PLAN_GOAL ? 'この目標の手段も灰色になります。' : ''}`}
        okLabel="削除する"
        warn
        onOk={() => lt.remove(e)}
        onClose={close}
      />
    );
  if (type === 'hist') return <HistorySheet kind={K} id={e.id} title={e.text} onClose={close} />;
  return null;
}

const Back = () => (
  <a className="back" href="#/review">
    ‹ 振り返り
  </a>
);

// 逆算ロードマップ：仕事面／プライベート面。1項目＝時期＋ありたい姿
function Roadmap({ locked }) {
  const { model } = useApp();
  const lt = useLongtermWrite();
  const [dialog, setDialog] = useState(null);
  const menuFor = (e) =>
    e.deletedRec || locked
      ? [{ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) }]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', e }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', layer: e.layer, after: e.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) },
        ];
  return (
    <>
      {ROADMAP_PARTS.map(({ layer, label }) => {
        const items = roadmapItems(model, layer);
        return (
          <section className="list" key={layer}>
            <div className="sec">
              <span>{label}</span>
              {!locked && <MoreMenu small label={`${label}の操作`} items={[{ label: '追加する', onSelect: () => setDialog({ type: 'add', layer }) }]} />}
            </div>
            {items.length === 0 && <p className="note">まだありません</p>}
            {items.map((e) => (
              <ItemRow
                key={e.id}
                text={e.text}
                lead={e.attrs.when || null}
                date={dateLine(e)}
                deleted={!!e.deletedRec}
                pending={isPending(e)}
                menu={menuFor(e)}
              />
            ))}
          </section>
        );
      })}
      <p className="note">時期の遠い順（ありたい姿から逆算）に並べると見やすくなります。「この下に追加」で間に入れられます</p>
      <Dialogs dialog={dialog} setDialog={setDialog} lt={lt} />
    </>
  );
}

// アクションプラン：目標ごとに手段（実行すること・頻度・打ち手）
function Plan({ locked }) {
  const { model } = useApp();
  const lt = useLongtermWrite();
  const [dialog, setDialog] = useState(null);
  const plan = actionPlan(model);

  const goalMenu = (g) =>
    g.deletedRec || locked
      ? [{ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e: g }) }]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', e: g }) },
          { label: '手段を追加', onSelect: () => setDialog({ type: 'add', layer: LAYER.PLAN_MEANS, parent: g.id }) },
          { label: 'この下に目標を追加', onSelect: () => setDialog({ type: 'add', layer: LAYER.PLAN_GOAL, after: g.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e: g }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e: g }) },
        ];
  const meansMenu = (m, deleted) =>
    deleted || locked
      ? [{ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e: m }) }]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', e: m }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', layer: LAYER.PLAN_MEANS, parent: m.parent, after: m.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e: m }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e: m }) },
        ];

  return (
    <>
      {!locked && (
        <HeaderActions>
          <button type="button" className="bar-link add" onClick={() => setDialog({ type: 'add', layer: LAYER.PLAN_GOAL })}>
            ＋目標
          </button>
        </HeaderActions>
      )}
      {plan.length === 0 && <p className="note">まだありません。{locked ? '' : '右上の「＋目標」から足します'}</p>}
      {plan.map(({ goal, means }) => (
        <section className={`list plan${goal.deletedRec ? ' del' : ''}`} key={goal.id}>
          <ItemRow
            className="plan-goal"
            text={goal.text}
            date={dateLine(goal)}
            deleted={!!goal.deletedRec}
            pending={isPending(goal)}
            menu={goalMenu(goal)}
          />
          <div className="means">
            {means.length === 0 && <p className="note">手段はまだありません{locked || goal.deletedRec ? '' : '（「…」→「手段を追加」）'}</p>}
            {means.map(({ e, deleted }) => (
              <ItemRow
                key={e.id}
                text={e.text}
                sub={attrText(e.attrs, ['freq', 'tactic']) || null}
                date={dateLine(e, { deleted })}
                deleted={!!deleted}
                pending={isPending(e)}
                menu={meansMenu(e, deleted)}
              />
            ))}
          </div>
        </section>
      ))}
      <Dialogs dialog={dialog} setDialog={setDialog} lt={lt} />
    </>
  );
}

// 長期（年をまたぐ）：part = 'roadmap' | 'plan'
export function LongtermScreen({ part }) {
  const { readOnly } = useApp();
  return (
    <div className="longterm-screen">
      <Back />
      {part === 'plan' ? <Plan locked={readOnly} /> : <Roadmap locked={readOnly} />}
    </div>
  );
}
