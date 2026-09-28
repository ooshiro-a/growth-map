import { useMemo, useState } from 'react';
import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, Modal, enterToSave } from '../components/Modal.jsx';
import { PURGE_LABEL, PurgeDialog } from '../components/PurgeDialog.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { BRAKE_KINDS, BRAKE_KIND_NAME, CONTROL, FACING, PLACE, RELEASED, brakeYear, isReleased } from '../lib/brake.js';
import { newId } from '../lib/ids.js';
import { BRAKE_STATUS, dateLine } from '../lib/labels.js';
import { KIND, LAYER, OP } from '../lib/schema.js';

const B = KIND.BRAKE;
const LATER = ''; // 仕分けを「あとで」
const isPending = (e) => e.history.some((r) => r.pending);

// 選ぶ欄（1つだけ選ぶ）
function Pick({ label, options, value, onChange, wideFirst = false }) {
  return (
    <div className="layer-pick" role="radiogroup" aria-label={label}>
      {options.map(([k, l], i) => (
        <button
          type="button"
          key={k || 'later'}
          role="radio"
          aria-checked={value === k}
          className={`${value === k ? 'on' : ''}${wideFirst && i === 0 ? ' wide' : ''}`}
          onClick={() => onChange(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// 足す・直す：文言と、悩みなら2つの仕分け（「あとで」も選べる）
// pickKind：右上の「＋追加」の時だけ、悩み／大きな子どもを選ぶ
function BrakeDialog({ title, saveLabel = '保存する', pickKind = false, initial, onSave, onClose }) {
  const [kind, setKind] = useState(initial.kind);
  const [text, setText] = useState(initial.text || '');
  const [place, setPlace] = useState(initial.place || LATER);
  const [control, setControl] = useState(initial.control || LATER);
  const clean = text.trim();
  const worry = kind === LAYER.WORRY;
  const changed =
    clean !== (initial.text || '').trim() || (worry && (place !== (initial.place || LATER) || control !== (initial.control || LATER)));
  const canSave = !!clean && changed;
  const save = () => {
    if (!canSave) return;
    if (onSave({ kind, text: clean, place: worry ? place : LATER, control: worry ? control : LATER }) === false) return;
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      keep={changed && !!clean}
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
      {pickKind && <Pick label="どちらのブレーキ" options={BRAKE_KINDS.map((k) => [k, BRAKE_KIND_NAME[k]])} value={kind} onChange={setKind} />}
      <input className="field" maxLength={300} value={text} enterKeyHint="done" aria-label="文言" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => enterToSave(e, save)} />
      {worry && (
        <div className="brake-sort">
          <p className="pick-label">どこでの悩み？</p>
          <Pick label="どこでの悩み" options={[...Object.entries(PLACE), [LATER, 'あとで']]} value={place} onChange={setPlace} />
          <p className="pick-label">自分で変えられる？</p>
          <Pick label="自分で変えられるか" options={[...Object.entries(CONTROL), [LATER, 'あとで']]} value={control} onChange={setControl} />
        </div>
      )}
    </Modal>
  );
}

// 札：仕分けと状態
function Tags({ e }) {
  const released = isReleased(e);
  return (
    <span className="tags">
      {PLACE[e.attrs.place] && <span className="bchip">{PLACE[e.attrs.place]}</span>}
      {CONTROL[e.attrs.control] && <span className="bchip">{CONTROL[e.attrs.control]}</span>}
      <span className={`bchip ${released ? 'released' : 'facing'}`}>{BRAKE_STATUS[released ? RELEASED : FACING]}</span>
    </span>
  );
}

// 成長の地図＞ブレーキ（その年の分。前の年は見るだけ）
export function BrakeScreen({ year, viewOnly = false }) {
  const { model, write, readOnly } = useApp();
  const locked = viewOnly || readOnly || (model.currentYear != null && year < model.currentYear);
  const { groups, released } = useMemo(() => brakeYear(model, year), [model, year]);
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);

  const ok = (rows) => rows != null;
  const add = (vals, after) => {
    const extra = {};
    if (vals.kind === LAYER.WORRY) {
      if (vals.place) extra.place = vals.place;
      if (vals.control) extra.control = vals.control;
    }
    if (after !== undefined) extra.after = after;
    return ok(
      write([
        {
          year,
          kind: B,
          id: newId(),
          op: OP.ADD,
          layer: vals.kind,
          text: vals.text,
          value: FACING,
          extra: Object.keys(extra).length ? extra : undefined,
        },
      ]),
    );
  };
  // 修正：文言と、変えた仕分けだけ（「あとで」に戻した時は空で書く）
  const edit = (e, vals) => {
    const extra = {};
    if (e.layer === LAYER.WORRY) {
      if (vals.place !== (e.attrs.place || LATER)) extra.place = vals.place;
      if (vals.control !== (e.attrs.control || LATER)) extra.control = vals.control;
    }
    return ok(write([{ year, kind: B, id: e.id, op: OP.EDIT, text: vals.text, extra: Object.keys(extra).length ? extra : undefined }]));
  };
  const setStatus = (e, value) => ok(write([{ year, kind: B, id: e.id, op: OP.STATUS, value }]));
  const remove = (e) => ok(write([{ year, kind: B, id: e.id, op: OP.DELETE }]));

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
          isReleased(e)
            ? { label: '「向き合い中」に戻す', onSelect: () => setStatus(e, FACING) }
            : { label: '「外せた」にする', onSelect: () => setStatus(e, RELEASED) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', kind: e.layer, after: e.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', e }) },
        ];

  return (
    <div className="brake-screen">
      {!locked && (
        <HeaderActions>
          <button type="button" className="bar-link add" onClick={() => setDialog({ type: 'addAny' })}>
            ＋追加
          </button>
        </HeaderActions>
      )}

      <p className="brake-count">
        この年に外せたブレーキ：<b>{released}</b>
      </p>

      {groups.map((g) => (
        <section className="list" key={g.k}>
          <div className="sec">
            <span>{g.name}</span>
            {!locked && <MoreMenu small label={`${g.name}の操作`} items={[{ label: '追加する', onSelect: () => setDialog({ type: 'add', kind: g.k }) }]} />}
          </div>
          {g.k === LAYER.WORRY && <p className="note">分かれ道の悩みか、決めた道の上の悩みか。自分で変えられるか</p>}
          {g.k === LAYER.CHILD && <p className="note">自分の中の「大きな子ども」が出た場面や傾向</p>}
          {g.items.length === 0 && <p className="note">まだありません</p>}
          {g.items.map((e) => (
            <ItemRow
              key={e.id}
              className="brake-item"
              text={e.text}
              sub={<Tags e={e} />}
              date={dateLine(e, { perYear: true })}
              deleted={!!e.deletedRec}
              pending={isPending(e)}
              menu={menuFor(e)}
            />
          ))}
        </section>
      ))}
      <p className="note">外せたブレーキは翌年に引き継がず、この年の記録として残ります</p>

      {dialog?.type === 'addAny' && (
        <BrakeDialog title="追加する" saveLabel="追加する" pickKind initial={{ kind: LAYER.WORRY }} onClose={close} onSave={(v) => add(v)} />
      )}
      {dialog?.type === 'add' && (
        <BrakeDialog
          title={`${BRAKE_KIND_NAME[dialog.kind]}を追加`}
          saveLabel="追加する"
          initial={{ kind: dialog.kind }}
          onClose={close}
          onSave={(v) => add(v, dialog.after)}
        />
      )}
      {dialog?.type === 'edit' && (
        <BrakeDialog
          title="編集する"
          initial={{ kind: dialog.e.layer, text: dialog.e.text, place: dialog.e.attrs.place, control: dialog.e.attrs.control }}
          onClose={close}
          onSave={(v) => edit(dialog.e, v)}
        />
      )}
      {dialog?.type === 'del' && (
        <ConfirmDialog
          title="削除する"
          message={`「${dialog.e.text}」を削除します。消さずに灰色で残ります。`}
          okLabel="削除する"
          warn
          onOk={() => remove(dialog.e)}
          onClose={close}
        />
      )}
      {dialog?.type === 'purge' && <PurgeDialog e={dialog.e} year={year} note="前の年からも消えます。" onClose={close} />}
      {dialog?.type === 'hist' && <HistorySheet kind={B} id={dialog.e.id} title={dialog.e.text} onClose={close} />}
    </div>
  );
}
