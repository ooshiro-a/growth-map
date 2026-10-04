import { useMemo, useState } from 'react';
import { useApp } from '../app-context.js';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, EditDialog, Modal } from '../components/Modal.jsx';
import { PURGE_LABEL, PurgeDialog } from '../components/PurgeDialog.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { now } from '../lib/clock.js';
import { icebergYear } from '../lib/iceberg.js';
import { newId } from '../lib/ids.js';
import { dateLine } from '../lib/labels.js';
import { QUARTER_MONTHS, currentQuarter, reviewSteps } from '../lib/review.js';
import { KIND, LAYER, OP, quarterLayer } from '../lib/schema.js';
import { GoalSection } from './ReviewScreen.jsx';

const K = KIND.PRINCIPLE;
const isPending = (e) => e.history.some((r) => r.pending);

// 指標（年をまたぐ）
export const principlesOf = (model) => model.list(model.flat(K), 'L:');

// アイスバーグの「意識・想い・人生哲学」から選ぶ（その年の分・削除した言葉は出さない）
// 指標に同じ言葉がある時は「入れ済み」で選べない
function PickDialog({ year, onSave, onClose }) {
  const { model } = useApp();
  const words = useMemo(() => icebergYear(model, year).layers[LAYER.MIND].filter((w) => !w.deletedRec), [model, year]);
  const have = useMemo(() => new Set(principlesOf(model).filter((p) => !p.deletedRec).map((p) => p.text.trim())), [model]);
  const [picked, setPicked] = useState([]);
  const toggle = (id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.concat(id)));
  const save = () => {
    if (!picked.length) return;
    // 並びはアイスバーグの順
    const texts = words.filter((w) => picked.includes(w.id)).map((w) => w.text.trim());
    if (onSave(texts) === false) return;
    onClose();
  };
  return (
    <Modal
      title="アイスバーグから選ぶ"
      onClose={onClose}
      keep={picked.length > 0}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            やめる
          </button>
          <button type="button" className="btn primary" disabled={!picked.length} onClick={save}>
            {picked.length ? `${picked.length}つ追加する` : '追加する'}
          </button>
        </>
      }
    >
      <p className="note">{year}年の「意識・想い・人生哲学」の言葉です。言葉を写すだけなので、後でアイスバーグ側を直しても指標は変わりません</p>
      {words.length === 0 ? (
        <p className="note">この年のアイスバーグに「意識・想い・人生哲学」の言葉がありません</p>
      ) : (
        <div className="pick-list">
          {words.map((w) => {
            const done = have.has(w.text.trim());
            return (
              <label key={w.id} className={`pick${done ? ' done' : ''}`}>
                <input type="checkbox" checked={picked.includes(w.id)} disabled={done} onChange={() => toggle(w.id)} />
                <span className="tx">{w.text}</span>
                {done && <small>入れ済み</small>}
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// 指標の並び
function Principles({ year, locked }) {
  const { model, write } = useApp();
  const list = principlesOf(model);
  const [dialog, setDialog] = useState(null);

  const ok = (rows) => rows != null;
  // まとめて足す時は、前に足したものの後ろにつなげる（after がない時は末尾に順に並ぶ）
  const add = (texts, after, source) => {
    let prev = after;
    const drafts = texts.map((text) => {
      const id = newId();
      const extra = {};
      if (prev !== undefined) extra.after = prev;
      if (source) extra.source = source;
      if (prev !== undefined) prev = id;
      return { year: '', kind: K, id, op: OP.ADD, text, extra: Object.keys(extra).length ? extra : undefined };
    });
    return ok(write(drafts));
  };
  const edit = (e, text) => ok(write([{ year: '', kind: K, id: e.id, op: OP.EDIT, text }]));
  const remove = (e) => ok(write([{ year: '', kind: K, id: e.id, op: OP.DELETE }]));

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
  const close = () => setDialog(null);

  return (
    <section className="list principles">
      <div className="sec">
        <span>指標</span>
        {!locked && (
          <MoreMenu
            small
            label="指標の操作"
            items={[
              { label: '手で打って追加', onSelect: () => setDialog({ type: 'add' }) },
              { label: 'アイスバーグから選ぶ', onSelect: () => setDialog({ type: 'pick' }) },
            ]}
          />
        )}
      </div>
      <p className="note">見たい言葉だけを入れます。手で打つか、アイスバーグの「意識・想い・人生哲学」から選びます（年をまたいで続きます）</p>
      {list.length === 0 && <p className="note">まだありません</p>}
      {list.map((e) => (
        <ItemRow key={e.id} text={e.text} date={dateLine(e)} deleted={!!e.deletedRec} pending={isPending(e)} menu={menuFor(e)} />
      ))}

      {dialog?.type === 'add' && <EditDialog title="指標を追加" saveLabel="追加する" onClose={close} onSave={(t) => add([t], dialog.after)} />}
      {dialog?.type === 'pick' && <PickDialog year={year} onClose={close} onSave={(texts) => add(texts, undefined, 'iceberg')} />}
      {dialog?.type === 'edit' && <EditDialog title="指標を編集" initial={dialog.e.text} onClose={close} onSave={(t) => edit(dialog.e, t)} />}
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
      {dialog?.type === 'purge' && <PurgeDialog e={dialog.e} onClose={close} />}
      {dialog?.type === 'hist' && <HistorySheet kind={K} id={dialog.e.id} title={dialog.e.text} onClose={close} />}
    </section>
  );
}

// 上部の道のり：書いた振り返りの数だけ、山の斜面に一歩ずつ点を打つ（いちばん新しい一歩は金）
// 図は飾り（読み上げない）。文字だけ読む
const STEP_FROM = { x: 190, y: 204 };
const STEP_TO = { x: 626, y: 62 };
export const MAX_STEPS = 11;
const PAPER = '#f5f2ea';

function HomeHero() {
  const { model } = useApp();
  const steps = useMemo(() => reviewSteps(model).slice(-MAX_STEPS), [model]);
  const latest = steps[steps.length - 1];
  const at = (i) => ({
    x: STEP_FROM.x + ((STEP_TO.x - STEP_FROM.x) * i) / (MAX_STEPS - 1),
    y: STEP_FROM.y + ((STEP_TO.y - STEP_FROM.y) * i) / (MAX_STEPS - 1),
  });
  return (
    <div className="home-hero">
      <svg viewBox="0 0 1072 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
        <circle cx="760" cy="70" r="40" fill="var(--gold)" />
        <polygon points="120,220 640,48 900,220" fill={PAPER} stroke="var(--hero)" strokeWidth="22" strokeLinejoin="round" />
        <polygon points="120,220 640,48 900,220" fill={PAPER} stroke={PAPER} strokeWidth="12" strokeLinejoin="round" />
        <rect x="140" y="240" width="740" height="14" rx="7" fill={PAPER} />
        <rect x="300" y="268" width="420" height="14" rx="7" fill={PAPER} />
        {steps.map((s, i) => {
          const p = at(i);
          const last = i === steps.length - 1;
          return (
            <circle
              key={s.id}
              className={last ? 'step new' : 'step'}
              cx={p.x}
              cy={p.y}
              r="10"
              fill={last ? 'var(--gold)' : 'var(--hero)'}
              stroke={last ? 'var(--hero)' : 'none'}
              strokeWidth="5"
            />
          );
        })}
      </svg>
      <div className="hero-cap">
        <span>道のり</span>
        {latest ? (
          <b>
            いちばん新しい一歩：<span>{latest.label}</span>
          </b>
        ) : (
          <span>最初の一歩は振り返りで書きます</span>
        )}
      </div>
    </div>
  );
}

// ホーム（最初の画面）：上部の道のり、今年の目標・今の四半期の目標と指標（PC は3列）
export function HomeScreen() {
  const { readOnly, year, quarter } = useApp();
  // 今の四半期は App が見張っている（開いたまま四半期をまたいでも描き直す）。無い時（試験など）はその場で求める
  // 今年の中で数える（年が変わった直後、年を確かめ直すまでは前の年の4Q のまま）
  const cq = quarter || currentQuarter(now());
  const q = !cq ? 1 : cq.year === year ? cq.q : cq.year > year ? 4 : 1;
  return (
    <div className="home-screen">
      <HomeHero />
      <div className="home-cols">
        <GoalSection title="今年の目標" goalYear={year} tags locked={readOnly} emptyText="まだありません。年末年始に振り返りの③で決めます" />
        <GoalSection
          title={`${q}Qの目標（${QUARTER_MONTHS[q]}）`}
          goalYear={year}
          layer={quarterLayer(q)}
          tags
          toResult={false}
          locked={readOnly}
          emptyText="まだありません。振り返りの「四半期」で決めます"
        />
        <Principles year={year} locked={readOnly} />
      </div>
    </div>
  );
}
