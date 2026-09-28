import { useMemo, useState } from 'react';
import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { Iceberg } from '../components/Iceberg.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, Modal, enterToSave } from '../components/Modal.jsx';
import { PURGE_LABEL, PurgeDialog } from '../components/PurgeDialog.jsx';
import { useMedia } from '../hooks.js';
import { ICEBERG_LAYERS, LAYER_NAME, icebergYear } from '../lib/iceberg.js';
import { newId } from '../lib/ids.js';
import { STAGE, STAGE_HINT, dateLine, recDate } from '../lib/labels.js';
import { KIND, LAYER, OP, SCORED_LAYERS } from '../lib/schema.js';

const K = KIND.ICEBERG;

// 採点を選ぶ（目指す・実践中・定着。短い説明つき）
function StagePicker({ value, onChange }) {
  return (
    <div className="stage-pick" role="radiogroup" aria-label="採点">
      {[1, 2, 3].map((s) => (
        <button
          type="button"
          key={s}
          role="radio"
          aria-checked={Number(value) === s}
          className={Number(value) === s ? 'on' : ''}
          onClick={() => onChange(s)}
        >
          <span className={`mk g${s}`} />
          <b>{STAGE[s]}</b>
          <small>{STAGE_HINT[s]}</small>
        </button>
      ))}
    </div>
  );
}

// 言葉を足す・直す（層・文言・採点）
function WordDialog({ title, entity = null, layer: fixedLayer = null, saveLabel, onSave, onClose }) {
  const [layer, setLayer] = useState(entity ? entity.layer : fixedLayer || LAYER.SKILL);
  const [text, setText] = useState(entity ? entity.text : '');
  const [stage, setStage] = useState(entity && entity.value ? Number(entity.value) : 1);
  const scored = SCORED_LAYERS.has(layer);
  const clean = text.trim();
  const changed = !entity || clean !== entity.text.trim() || (scored && String(stage) !== String(entity.value || ''));
  const canSave = !!clean && changed;
  const dirty = entity ? changed : !!clean;
  const save = () => {
    if (!canSave) return;
    if (onSave({ layer, text: clean, stage: scored ? stage : '' }) === false) return;
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
      {!entity && !fixedLayer && (
        <div className="layer-pick" role="radiogroup" aria-label="層">
          {ICEBERG_LAYERS.map((l) => (
            <button type="button" key={l} role="radio" aria-checked={layer === l} className={layer === l ? 'on' : ''} onClick={() => setLayer(l)}>
              {LAYER_NAME[l]}
            </button>
          ))}
        </div>
      )}
      {(entity || fixedLayer) && <p className="note">{LAYER_NAME[layer]}</p>}
      <input className="field" maxLength={300} value={text} enterKeyHint="done" aria-label="言葉" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => enterToSave(e, save)} />
      {scored ? <StagePicker value={stage} onChange={setStage} /> : <p className="note">«マイナス»のふるまいは点数に入れません。なくせたら削除（灰色）にします</p>}
    </Modal>
  );
}

// 成長の地図＞アイスバーグ（その年の分。前の年は見るだけ）
export function IcebergScreen({ year, viewOnly = false }) {
  const { model, write, readOnly } = useApp();
  const wide = useMedia('(min-width: 768px)');
  const data = useMemo(() => icebergYear(model, year), [model, year]);
  const locked = viewOnly || readOnly || (model.currentYear != null && year < model.currentYear);
  const [dialog, setDialog] = useState(null);
  const [showSize, setShowSize] = useState(false);

  const ok = (rows) => rows != null;
  const add = ({ layer, text, stage }, after) =>
    ok(
      write([
        { year, kind: K, id: newId(), op: OP.ADD, layer, text, value: stage === '' ? '' : String(stage), extra: after === undefined ? undefined : { after } },
      ]),
    );
  const edit = (e, { text, stage }) => {
    const drafts = [];
    if (text !== e.text.trim()) drafts.push({ year, kind: K, id: e.id, op: OP.EDIT, text });
    if (SCORED_LAYERS.has(e.layer) && String(stage) !== String(e.value || '')) drafts.push({ year, kind: K, id: e.id, op: OP.SCORE, value: String(stage) });
    return drafts.length ? ok(write(drafts)) : true;
  };
  const remove = (e) => ok(write([{ year, kind: K, id: e.id, op: OP.DELETE }]));

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
          { label: 'この層に追加', onSelect: () => setDialog({ type: 'add', layer: e.layer, after: e.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', e }) },
        ];
  const dateOf = (e) => dateLine(e, { perYear: true }).split('／');

  const delta = data.prevSize == null ? null : data.size - data.prevSize;
  const sizeDate = data.lastChange
    ? `${recDate(data.lastChange.rec)}に更新（${data.lastChange.before}→${data.lastChange.after}点）`
    : null;
  const total = Object.values(data.layers).reduce((n, l) => n + l.length, 0);

  return (
    <div className="iceberg-screen">
      {!locked && (
        <HeaderActions>
          <button type="button" className="bar-link add" onClick={() => setDialog({ type: 'add' })}>
            ＋追加
          </button>
        </HeaderActions>
      )}

      <div
        className={`size rv${showSize ? ' show' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={showSize}
        onClick={() => setShowSize((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowSize((s) => !s);
          }
        }}
      >
        <span className="k">大きさ</span>
        <b>{data.size}点</b>
        {delta != null && (
          <span className="d">
            昨年末{data.prevSize}点から{delta > 0 ? `＋${delta}` : delta < 0 ? `−${-delta}` : '±0'}
          </span>
        )}
        {sizeDate && <div className="date">{sizeDate}</div>}
      </div>

      <Iceberg
        data={data}
        wide={wide}
        menuFor={menuFor}
        dateOf={dateOf}
        onTip={() => setDialog({ type: 'goals' })}
        onChip={(layer) => setDialog({ type: 'layer', layer })}
      />

      {total === 0 && (
        <p className="note center">
          {locked ? 'この年の言葉はありません' : 'まだ言葉がありません。右上の「＋追加」から足すか、設定の「初回の取り込み」で初期データを入れます'}
        </p>
      )}
      <p className="note center">言葉を押すと日付と「…」が出ます</p>

      {dialog?.type === 'add' && (
        <WordDialog
          title={dialog.layer ? `${LAYER_NAME[dialog.layer]}に追加` : '言葉を追加'}
          layer={dialog.layer}
          saveLabel="追加する"
          onSave={(v) => add(v, dialog.after)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'edit' && (
        <WordDialog title="編集する" entity={dialog.e} saveLabel="保存する" onSave={(v) => edit(dialog.e, v)} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'del' && (
        <ConfirmDialog
          title="削除する"
          message={`「${dialog.e.text}」を削除します。消さずに灰色で残り、点数には入りません。`}
          okLabel="削除する"
          warn
          onOk={() => remove(dialog.e)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'purge' && <PurgeDialog e={dialog.e} year={year} note="前の年からも消えます。" onClose={() => setDialog(null)} />}
      {dialog?.type === 'hist' && <HistorySheet kind={K} id={dialog.e.id} title={dialog.e.text} onClose={() => setDialog(null)} />}
      {dialog?.type === 'goals' && (
        <Modal title={`成果（${year}年に達成した目標）`} onClose={() => setDialog(null)}>
          {data.achieved.length === 0 ? (
            <p className="note">まだありません。振り返りで「達成」にした目標がここに出ます</p>
          ) : (
            <ul className="plain">
              {data.achieved.map((g) => (
                <li key={g.id}>{g.text}</li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {dialog?.type === 'layer' && (
        <Modal title={`${LAYER_NAME[dialog.layer]}の言葉（${data.layers[dialog.layer].length}語）`} onClose={() => setDialog(null)}>
          {data.layers[dialog.layer].map((e) => (
            <ItemRow
              key={e.id}
              text={e.text}
              date={dateLine(e, { perYear: true })}
              deleted={!!e.deletedRec}
              aside={dialog.layer !== LAYER.MINUS && <span className="stage-tag">{STAGE[e.value] || '—'}</span>}
              menu={menuFor(e)}
            />
          ))}
        </Modal>
      )}
    </div>
  );
}
