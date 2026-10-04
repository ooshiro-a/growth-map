import { useState } from 'react';
import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, EditDialog } from '../components/Modal.jsx';
import { PURGE_LABEL, PurgeDialog } from '../components/PurgeDialog.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { now } from '../lib/clock.js';
import { newId } from '../lib/ids.js';
import { dateLine, writtenLine } from '../lib/labels.js';
import {
  QUARTERS,
  QUARTER_MONTHS,
  canWriteReview,
  defaultQuarter,
  defaultReviewMode,
  defaultReviewYear,
  goalCounts,
  goalsOf,
  missedToCarry,
  nextQuarter,
  reviewEntry,
  reviewYears,
} from '../lib/review.js';
import { KIND, LAYER, OP, quarterLayer, reviewId } from '../lib/schema.js';

const isPending = (e) => e.history.some((r) => r.pending);

// 選んだ年・年か四半期か・四半期は、画面を移って戻っても同じにする（開き直すと最初に戻る）
let chosenYear = null;
let chosenMode = null;
let chosenQuarter = null;

// 答え合わせのボタン：押した方をもう一度押すと「判定なし」に戻る
function Judge({ goal, locked, onJudge }) {
  const r = goal.result;
  if (locked) {
    if (r === OP.ACHIEVE) return <span className="judge-tag ach">達成</span>;
    if (r === OP.MISS) return <span className="judge-tag miss">未達</span>;
    return null;
  }
  const btn = (op, label, cls) => (
    <button
      type="button"
      className={`${cls}${r === op ? ' on' : ''}`}
      aria-pressed={r === op}
      onClick={(ev) => {
        ev.stopPropagation();
        onJudge(goal, r === op ? null : op);
      }}
    >
      {label}
    </button>
  );
  return (
    <span className="judge" role="group" aria-label={`「${goal.text}」の答え合わせ`}>
      {btn(OP.ACHIEVE, '達成', 'ach')}
      {btn(OP.MISS, '未達', 'miss')}
    </span>
  );
}

// 目標の並び（①その年の答え合わせ／③翌年の目標／ホームの今年の目標。四半期の目標も同じ部品）
// layer：''＝年の目標、q1〜q4＝四半期の目標（行には必ず層を書く。履歴に「2026年3Q分」と出すため）
// judge：達成・未達のボタンを出す／tags：答え合わせの札だけ出す（ホーム。変えるのは振り返り）
// toResult：達成がアイスバーグの成果に載る目標か（年の目標だけ）
// carryTo：{ year, layer, label }。未達の目標を「…」から写す先（四半期の①から次の四半期へ）
export function GoalSection({
  num = null,
  title,
  goalYear,
  layer = '',
  judge = false,
  tags = false,
  locked,
  emptyText,
  toResult = true,
  carryTo = null,
  children,
}) {
  const { model, write } = useApp();
  const goals = goalsOf(model, goalYear, layer);
  const [dialog, setDialog] = useState(null);

  const ok = (rows) => rows != null;
  const row = (o) => ({ year: goalYear, kind: KIND.GOAL, layer, ...o });
  const add = (text, after) => ok(write([row({ id: newId(), op: OP.ADD, text, extra: after === undefined ? undefined : { after } })]));
  const edit = (g, text) => ok(write([row({ id: g.id, op: OP.EDIT, text })]));
  const remove = (g) => ok(write([row({ id: g.id, op: OP.DELETE })]));
  const onJudge = (g, op) => write([op ? row({ id: g.id, op }) : row({ id: g.id, op: OP.STATUS, value: '' })]);

  // 未達を次の四半期へ写す（同じ文言がもう写す先にあれば写さない）
  const toCarry = carryTo && !locked ? missedToCarry(goals, goalsOf(model, carryTo.year, carryTo.layer)) : [];
  const carry = (list) =>
    write(
      list.map((g) => ({ year: carryTo.year, kind: KIND.GOAL, layer: carryTo.layer, id: newId(), op: OP.ADD, text: g.text, extra: { source: 'quarter' } })),
    );
  const carryItem = (g) => {
    if (!carryTo || g.result !== OP.MISS) return null;
    const can = toCarry.includes(g);
    return can
      ? { label: `${carryTo.label}へ写す`, onSelect: () => carry([g]) }
      : { label: `${carryTo.label}へ写し済み`, disabled: true, onSelect: () => {} };
  };

  const menuFor = (g) =>
    locked
      ? [{ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', g }) }]
      : g.deletedRec
      ? [
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', g }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', g }) },
        ]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', g }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', after: g.id }) },
          carryItem(g),
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', g }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', g }) },
          { label: PURGE_LABEL, warn: true, onSelect: () => setDialog({ type: 'purge', g }) },
        ];
  const sectionMenu = [
    { label: '目標を追加', onSelect: () => setDialog({ type: 'add' }) },
    toCarry.length > 0 && { label: `未達を${carryTo.label}へ写す（${toCarry.length}件）`, onSelect: () => carry(toCarry) },
  ];
  const c = judge ? goalCounts(goals) : null;

  return (
    <section className="list">
      <div className="sec">
        <span>
          {num != null && <span className="num">{num}</span>}
          {title}
        </span>
        {!locked && <MoreMenu small label={`${title}の操作`} items={sectionMenu} />}
      </div>
      {goals.length === 0 && <p className="note">{emptyText}</p>}
      {goals.map((g) => (
        <ItemRow
          key={g.id}
          text={g.text}
          date={dateLine(g)}
          deleted={!!g.deletedRec}
          pending={isPending(g)}
          aside={(judge || tags) && !g.deletedRec ? <Judge goal={g} locked={locked || !judge} onJudge={onJudge} /> : null}
          menu={menuFor(g)}
        />
      ))}
      {c && goals.length > 0 && (
        <p className="note">
          達成 {c.achieved}件・未達 {c.missed}件・まだ {c.open}件
        </p>
      )}
      {toCarry.length > 0 && <p className="note">未達の目標は「…」から{carryTo.label}へ写せます</p>}
      {children}

      {dialog?.type === 'add' && <EditDialog title="目標を追加" onClose={() => setDialog(null)} onSave={(t) => add(t, dialog.after)} saveLabel="追加する" />}
      {dialog?.type === 'edit' && <EditDialog title="目標を編集" initial={dialog.g.text} onClose={() => setDialog(null)} onSave={(t) => edit(dialog.g, t)} />}
      {dialog?.type === 'del' && (
        <ConfirmDialog
          title="削除する"
          message={`「${dialog.g.text}」を削除します。消さずに灰色で残り${toResult ? '、成果にも載りません' : 'ます'}。`}
          okLabel="削除する"
          warn
          onOk={() => remove(dialog.g)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'purge' && <PurgeDialog e={dialog.g} year={goalYear} onClose={() => setDialog(null)} />}
      {dialog?.type === 'hist' && <HistorySheet kind={KIND.GOAL} id={dialog.g.id} title={dialog.g.text} onClose={() => setDialog(null)} />}
    </section>
  );
}

// 自由に書く欄（②今年の振り返り／④来年の抱負／四半期の振り返り）
function TextSection({ num, title, year, layer, locked }) {
  const { model, write } = useApp();
  const e = reviewEntry(model, year, layer);
  const text = e ? e.text : '';
  const [dialog, setDialog] = useState(null);
  const save = (t) => write([{ year, kind: KIND.REVIEW, id: reviewId(year, layer), op: OP.EDIT, layer, text: t }]) != null;

  const items = [];
  if (!locked) items.push({ label: text ? '編集する' : '書く', onSelect: () => setDialog('edit') });
  if (e) items.push({ label: '履歴を見る', onSelect: () => setDialog('hist') });

  return (
    <section className="list">
      <div className="sec">
        <span>
          <span className="num">{num}</span>
          {title}
        </span>
        <MoreMenu small label={`${title}の操作`} items={items} />
      </div>
      {text ? (
        <div className="box">
          <div className="box-tx">{text}</div>
          <div className="box-date">
            {writtenLine(e)}
            {isPending(e) && <span className="pend">（未保存）</span>}
          </div>
        </div>
      ) : locked ? (
        <p className="note">書いていません</p>
      ) : (
        <button type="button" className="box empty" onClick={() => setDialog('edit')}>
          ＋ 書く
        </button>
      )}
      {dialog === 'edit' && (
        <EditDialog title={title} initial={text} multiline rows={8} allowEmpty onClose={() => setDialog(null)} onSave={save} />
      )}
      {dialog === 'hist' && <HistorySheet kind={KIND.REVIEW} id={reviewId(year, layer)} title={`${year}年の${title}`} onClose={() => setDialog(null)} />}
    </section>
  );
}

// 年の振り返り：①答え合わせ ②振り返り ③来年の目標 ④抱負
function YearReview({ year, locked }) {
  return (
    <>
      <GoalSection num={1} title={`${year}年の目標の答え合わせ`} goalYear={year} judge locked={locked} emptyText={`${year}年の目標はありません（前の年の振り返りの③で決めます）`}>
        <p className="note">「達成」にした目標は、{year}年のアイスバーグの成果（水面の上）に載ります</p>
      </GoalSection>
      <TextSection num={2} title="今年の振り返り" year={year} layer={LAYER.REVIEW} locked={locked} />
      <GoalSection num={3} title={`${year + 1}年の目標`} goalYear={year + 1} locked={locked} emptyText="まだありません">
        <p className="note">{year + 1}年になると、ホームの「今年の目標」に出ます</p>
      </GoalSection>
      <TextSection num={4} title="来年の抱負" year={year} layer={LAYER.RESOLUTION} locked={locked} />
    </>
  );
}

// 四半期の振り返り：①その四半期の目標の答え合わせ ②振り返り ③次の四半期の目標（4Q の次は翌年の1Q）
function QuarterReview({ year, q, locked }) {
  const layer = quarterLayer(q);
  const nq = nextQuarter(year, q);
  const nextLabel = `${nq.year !== year ? `${nq.year}年` : ''}${nq.q}Qの目標`;
  const next = { year: nq.year, layer: quarterLayer(nq.q), label: nextLabel };
  return (
    <>
      <GoalSection
        num={1}
        title={`${year}年${q}Qの目標の答え合わせ`}
        goalYear={year}
        layer={layer}
        judge
        toResult={false}
        carryTo={next}
        locked={locked}
        emptyText={`${q}Qの目標はありません（前の四半期の③で決めます）`}
      />
      <TextSection num={2} title={`${q}Qの振り返り`} year={year} layer={layer} locked={locked} />
      <GoalSection num={3} title={nextLabel} goalYear={nq.year} layer={next.layer} toResult={false} locked={locked} emptyText="まだありません">
        <p className="note">
          {nq.q}Q（{QUARTER_MONTHS[nq.q]}）になると、ホームの「今の四半期の目標」に出ます
        </p>
      </GoalSection>
    </>
  );
}

// 振り返り：どの年の分かを選び、「年の振り返り」と「四半期」を切り替える。下に長期の入口
// fixedYear を渡すと年を選ばせない（年表の「年ごとの記録」で使う。見るだけ）
export function ReviewScreen({ fixedYear = null, viewOnly = false }) {
  const { model, readOnly, year: currentYear } = useApp();
  const fixed = fixedYear != null;
  const [picked, setPicked] = useState(() => chosenYear ?? defaultReviewYear(now()) ?? currentYear);
  const [mode, setMode] = useState(() => (fixed ? 'year' : chosenMode ?? defaultReviewMode(now())));
  const [q, setQ] = useState(() => {
    if (!fixed && chosenQuarter) return chosenQuarter;
    const d = defaultQuarter(now());
    return d && (!fixed || d.year === fixedYear) ? d.q : 1;
  });
  const years = reviewYears(model, currentYear, picked);
  const year = fixedYear ?? (years.includes(picked) ? picked : currentYear);
  const tooOld = !canWriteReview(year, currentYear);
  const locked = viewOnly || readOnly || tooOld;

  const choose = (y) => {
    chosenYear = y;
    setPicked(y);
  };
  const chooseMode = (m) => {
    if (!fixed) chosenMode = m;
    setMode(m);
  };
  const chooseQuarter = (n) => {
    if (!fixed) chosenQuarter = n;
    setQ(n);
  };

  return (
    <div className="review-screen">
      {!fixed && (
        <HeaderActions>
          <select className="year-pick" aria-label="どの年の分か" value={year} onChange={(ev) => choose(Number(ev.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}年の分
              </option>
            ))}
          </select>
        </HeaderActions>
      )}

      <div className="seg review-mode" role="tablist" aria-label="振り返りの種類">
        {[
          ['year', '年の振り返り'],
          ['quarter', '四半期'],
        ].map(([k, label]) => (
          <button type="button" key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => chooseMode(k)}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'quarter' && (
        <div className="seg quarters" role="tablist" aria-label="どの四半期か">
          {QUARTERS.map((n) => (
            <button
              type="button"
              key={n}
              role="tab"
              aria-selected={q === n}
              aria-label={`${n}Q（${QUARTER_MONTHS[n]}）`}
              className={q === n ? 'on' : ''}
              onClick={() => chooseQuarter(n)}
            >
              <b>{n}Q</b>
              <small>{QUARTER_MONTHS[n]}</small>
            </button>
          ))}
        </div>
      )}

      {tooOld && !viewOnly ? (
        <p className="note">{year}年の分は見るだけです（書けるのは今年と前の年の分）</p>
      ) : (
        !locked && <p className="note">{mode === 'quarter' ? '四半期の終わりに上から順に進めます' : '年末年始は上から順に進めます'}</p>
      )}

      {mode === 'quarter' ? <QuarterReview key={`${year}/${q}`} year={year} q={q} locked={locked} /> : <YearReview year={year} locked={locked} />}

      {!fixed && (
        <section className="list">
          <div className="sec">
            <span>長期（年をまたぐ）</span>
          </div>
          <a className="item link-row" href="#/review/roadmap">
            <span className="tx">逆算ロードマップ</span>
            <span className="note">仕事面／プライベート面 ›</span>
          </a>
          <a className="item link-row" href="#/review/plan">
            <span className="tx">アクションプラン</span>
            <span className="note">目標／手段 ›</span>
          </a>
        </section>
      )}
    </div>
  );
}
