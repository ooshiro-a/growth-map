import { useId, useMemo, useState } from 'react';
import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, EditDialog, Modal, enterToSave } from '../components/Modal.jsx';
import { PURGE_LABEL, PurgeDialog } from '../components/PurgeDialog.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { QUADRANT_DIR, QUADRANT_NAME, axisOf, motiveYear, scoreLine } from '../lib/accel.js';
import { newId } from '../lib/ids.js';
import { dateLine } from '../lib/labels.js';
import { KIND, MOTIVE_QUADRANTS, OP, motiveQuadrantId } from '../lib/schema.js';

const AX = KIND.AXIS;
const MV = KIND.MOTIVE;
const AXIS_TARGET = 'axis';
const isPending = (e) => e.history.some((r) => r.pending);

// 動機の四象限の図：中心から各区分へ矢印（長さ＝点数）。前の年は薄いグレーで重ねる
const C = { x: 130, y: 112 };
const UNIT = 10; // 1点の長さ
const LABEL_POS = {
  selfVisible: { x: 236, y: 30, anchor: 'end' },
  otherVisible: { x: 24, y: 30, anchor: 'start' },
  selfInvisible: { x: 236, y: 202, anchor: 'end' },
  otherInvisible: { x: 24, y: 202, anchor: 'start' },
};
const scoreText = (s) => (s == null ? '—' : String(s));

function tip(q, s) {
  const [dx, dy] = QUADRANT_DIR[q];
  const d = (s * UNIT) / Math.SQRT2;
  return { x2: +(C.x + dx * d).toFixed(1), y2: +(C.y + dy * d).toFixed(1) };
}

export function MotiveChart({ year, quads, prev }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const aria = `動機の四象限。${year}年は${quads.map((x) => `${x.name}${scoreText(x.score)}`).join('、')}${prev ? `。灰色は${year - 1}年` : ''}`;
  return (
    <svg className="motive-chart" viewBox="0 0 260 230" role="img" aria-label={aria}>
      <defs>
        <marker id={`hg${uid}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--matsu-tx)" />
        </marker>
        <marker id={`hgr${uid}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--faint)" />
        </marker>
      </defs>
      <rect x="18" y="14" width="224" height="196" rx="8" fill="var(--head)" stroke="var(--line)" />
      <line x1="18" y1={C.y} x2="242" y2={C.y} stroke="var(--edge)" />
      <line x1={C.x} y1="14" x2={C.x} y2="210" stroke="var(--edge)" />
      <text x="130" y="10" fontSize="10" textAnchor="middle" fill="var(--sub)">
        見える
      </text>
      <text x="130" y="224" fontSize="10" textAnchor="middle" fill="var(--sub)">
        見えない
      </text>
      <text x="22" y="106" fontSize="10" fill="var(--sub)">
        他者
      </text>
      <text x="238" y="106" fontSize="10" textAnchor="end" fill="var(--sub)">
        自分
      </text>
      {quads.map((x) => (
        <text key={x.q} x={LABEL_POS[x.q].x} y={LABEL_POS[x.q].y} fontSize="10" textAnchor={LABEL_POS[x.q].anchor} fill="var(--ink)">
          {x.name} {scoreText(x.score)}
        </text>
      ))}
      {prev &&
        MOTIVE_QUADRANTS.filter((q) => prev[q] > 0).map((q) => (
          <line key={`p${q}`} className="arrow-prev" x1={C.x} y1={C.y} {...tip(q, prev[q])} stroke="var(--faint)" strokeWidth="3" markerEnd={`url(#hgr${uid})`} />
        ))}
      {quads
        .filter((x) => x.score > 0)
        .map((x) => (
          <line key={x.q} className="arrow-now" x1={C.x} y1={C.y} {...tip(x.q, x.score)} stroke="var(--matsu-tx)" strokeWidth="2.5" markerEnd={`url(#hg${uid})`} />
        ))}
      <circle cx={C.x} cy={C.y} r="3" fill="var(--ink)" />
    </svg>
  );
}

// 点数を選ぶ（0〜10）
function ScoreDialog({ name, value, onSave, onClose }) {
  const [v, setV] = useState(value);
  const canSave = v != null && v !== value;
  const save = () => {
    if (!canSave) return;
    if (onSave(v) === false) return;
    onClose();
  };
  return (
    <Modal
      title={`${name}の点数`}
      onClose={onClose}
      keep={v !== value}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            やめる
          </button>
          <button type="button" className="btn primary" disabled={!canSave} onClick={save}>
            保存する
          </button>
        </>
      }
    >
      <p className="note">0〜10点。矢印の長さになります</p>
      <div className="score-pick" role="radiogroup" aria-label="点数">
        {Array.from({ length: 11 }, (_, n) => (
          <button type="button" key={n} role="radio" aria-checked={v === n} className={v === n ? 'on' : ''} onClick={() => setV(n)}>
            {n}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// 右上の「＋追加」：足す先（自分軸・理念／4つの区分）を選んで文言を打つ
function AddDialog({ onSave, onClose }) {
  const [target, setTarget] = useState(AXIS_TARGET);
  const [text, setText] = useState('');
  const clean = text.trim();
  const save = () => {
    if (!clean) return;
    if (onSave(target, clean) === false) return;
    onClose();
  };
  const targets = [[AXIS_TARGET, '自分軸・理念'], ...MOTIVE_QUADRANTS.map((q) => [q, `動機：${QUADRANT_NAME[q]}`])];
  return (
    <Modal
      title="追加する"
      onClose={onClose}
      keep={!!clean}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            やめる
          </button>
          <button type="button" className="btn primary" disabled={!clean} onClick={save}>
            追加する
          </button>
        </>
      }
    >
      <div className="layer-pick" role="radiogroup" aria-label="足す先">
        {targets.map(([k, l]) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={target === k}
            className={`${target === k ? 'on' : ''}${k === AXIS_TARGET ? ' wide' : ''}`}
            onClick={() => setTarget(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <input className="field" maxLength={300} value={text} enterKeyHint="done" aria-label="文言" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => enterToSave(e, save)} />
    </Modal>
  );
}

// 成長の地図＞アクセル（その年の分。前の年は見るだけ）
export function AccelScreen({ year, viewOnly = false }) {
  const { model, write, readOnly } = useApp();
  const locked = viewOnly || readOnly || (model.currentYear != null && year < model.currentYear);
  const axis = axisOf(model, year);
  const motive = useMemo(() => motiveYear(model, year), [model, year]);
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);

  const ok = (rows) => rows != null;
  const withAfter = (after) => (after === undefined ? undefined : { after });
  const addAxis = (text, after) => ok(write([{ year, kind: AX, id: newId(), op: OP.ADD, text, extra: withAfter(after) }]));
  const addMotive = (q, text, after) => ok(write([{ year, kind: MV, id: newId(), op: OP.ADD, layer: q, text, extra: withAfter(after) }]));
  const edit = (e, text) => ok(write([{ year, kind: e.kind, id: e.id, op: OP.EDIT, text }]));
  const remove = (e) => ok(write([{ year, kind: e.kind, id: e.id, op: OP.DELETE }]));
  const setScore = (q, n) => ok(write([{ year, kind: MV, id: motiveQuadrantId(q), op: OP.SCORE, layer: q, value: String(n) }]));

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
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', kind: e.kind, q: e.layer, after: e.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', e }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', e }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', e }) },
        ];
  const quadMenu = (x) => [
    !locked && { label: '点数を変える', onSelect: () => setDialog({ type: 'score', x }) },
    !locked && { label: '中身を追加', onSelect: () => setDialog({ type: 'add', kind: MV, q: x.q }) },
    x.scoreEntity && { label: '点数の履歴', onSelect: () => setDialog({ type: 'scoreHist', x }) },
  ];
  const row = (e) => (
    <ItemRow key={e.id} text={e.text} date={dateLine(e, { perYear: true })} deleted={!!e.deletedRec} pending={isPending(e)} menu={menuFor(e)} />
  );

  return (
    <div className="accel-screen">
      {!locked && (
        <HeaderActions>
          <button type="button" className="bar-link add" onClick={() => setDialog({ type: 'addAny' })}>
            ＋追加
          </button>
        </HeaderActions>
      )}

      <section className="list">
        <div className="sec">
          <span>自分軸・理念</span>
          {!locked && <MoreMenu small label="自分軸・理念の操作" items={[{ label: '追加する', onSelect: () => setDialog({ type: 'add', kind: AX }) }]} />}
        </div>
        <p className="note">大切な言葉・価値観。ホームの「指標」とは別に持ちます</p>
        {axis.length === 0 && <p className="note">まだありません</p>}
        {axis.map(row)}
      </section>

      <section className="list">
        <div className="sec">
          <span>動機の四象限</span>
          <span className="lgd">
            緑＝{year}年{motive.prev && `　灰＝${year - 1}年`}
          </span>
        </div>
        <MotiveChart year={year} quads={motive.quads} prev={motive.prev} />
        <p className="note">何のために頑張るか。区分ごとに 0〜10点（矢印の長さ）</p>
        {motive.quads.map((x) => (
          <div className="quad" key={x.q}>
            <ItemRow
              className="quad-h"
              text={x.name}
              date={scoreLine(x.scoreEntity)}
              pending={!!x.scoreEntity && isPending(x.scoreEntity)}
              aside={<span className={`score-chip${x.score == null ? ' none' : ''}`}>{x.score == null ? '—' : `${x.score}点`}</span>}
              menu={quadMenu(x)}
            />
            <div className="quad-items">
              {x.items.length === 0 && <p className="note">中身はまだありません</p>}
              {x.items.map(row)}
            </div>
          </div>
        ))}
      </section>

      {dialog?.type === 'addAny' && <AddDialog onClose={close} onSave={(t, text) => (t === AXIS_TARGET ? addAxis(text) : addMotive(t, text))} />}
      {dialog?.type === 'add' && (
        <EditDialog
          title={dialog.kind === AX ? '自分軸・理念を追加' : `${QUADRANT_NAME[dialog.q]}に追加`}
          saveLabel="追加する"
          onClose={close}
          onSave={(t) => (dialog.kind === AX ? addAxis(t, dialog.after) : addMotive(dialog.q, t, dialog.after))}
        />
      )}
      {dialog?.type === 'edit' && <EditDialog title="編集する" initial={dialog.e.text} onClose={close} onSave={(t) => edit(dialog.e, t)} />}
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
      {dialog?.type === 'hist' && <HistorySheet kind={dialog.e.kind} id={dialog.e.id} title={dialog.e.text} onClose={close} />}
      {dialog?.type === 'score' && <ScoreDialog name={dialog.x.name} value={dialog.x.score} onClose={close} onSave={(n) => setScore(dialog.x.q, n)} />}
      {dialog?.type === 'scoreHist' && <HistorySheet kind={MV} id={motiveQuadrantId(dialog.x.q)} title={`${dialog.x.name}の点数`} onClose={close} />}
    </div>
  );
}
