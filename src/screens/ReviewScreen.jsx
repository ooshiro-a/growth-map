import { useState } from 'react';
import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { HistorySheet } from '../components/HistorySheet.jsx';
import { ItemRow } from '../components/ItemRow.jsx';
import { ConfirmDialog, EditDialog } from '../components/Modal.jsx';
import { MoreMenu } from '../components/MoreMenu.jsx';
import { now } from '../lib/clock.js';
import { newId } from '../lib/ids.js';
import { dateLine, writtenLine } from '../lib/labels.js';
import { canWriteReview, defaultReviewYear, goalCounts, goalsOf, reviewEntry, reviewYears } from '../lib/review.js';
import { KIND, LAYER, OP, reviewId } from '../lib/schema.js';

const isPending = (e) => e.history.some((r) => r.pending);

// 選んだ年は、画面を移って戻っても同じにする（開き直すと最初の年に戻る）
let chosenYear = null;

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

// 目標の並び（①その年の答え合わせ／③翌年の目標／ホームの今年の目標）
// judge：達成・未達のボタンを出す／tags：答え合わせの札だけ出す（ホーム。変えるのは振り返り）
export function GoalSection({ num = null, title, goalYear, judge = false, tags = false, locked, emptyText, children }) {
  const { model, write } = useApp();
  const goals = goalsOf(model, goalYear);
  const [dialog, setDialog] = useState(null);

  const ok = (rows) => rows != null;
  const add = (text, after) =>
    ok(write([{ year: goalYear, kind: KIND.GOAL, id: newId(), op: OP.ADD, text, extra: after === undefined ? undefined : { after } }]));
  const edit = (g, text) => ok(write([{ year: goalYear, kind: KIND.GOAL, id: g.id, op: OP.EDIT, text }]));
  const remove = (g) => ok(write([{ year: goalYear, kind: KIND.GOAL, id: g.id, op: OP.DELETE }]));
  const onJudge = (g, op) =>
    write([op ? { year: goalYear, kind: KIND.GOAL, id: g.id, op } : { year: goalYear, kind: KIND.GOAL, id: g.id, op: OP.STATUS, value: '' }]);

  const menuFor = (g) =>
    g.deletedRec || locked
      ? [{ label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', g }) }]
      : [
          { label: '編集する', onSelect: () => setDialog({ type: 'edit', g }) },
          { label: 'この下に追加', onSelect: () => setDialog({ type: 'add', after: g.id }) },
          { label: '削除する（灰色で残る）', warn: true, onSelect: () => setDialog({ type: 'del', g }) },
          { label: '履歴を見る', onSelect: () => setDialog({ type: 'hist', g }) },
        ];
  const c = judge ? goalCounts(goals) : null;

  return (
    <section className="list">
      <div className="sec">
        <span>
          {num != null && <span className="num">{num}</span>}
          {title}
        </span>
        {!locked && <MoreMenu small label={`${title}の操作`} items={[{ label: '目標を追加', onSelect: () => setDialog({ type: 'add' }) }]} />}
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
      {children}

      {dialog?.type === 'add' && <EditDialog title="目標を追加" onClose={() => setDialog(null)} onSave={(t) => add(t, dialog.after)} saveLabel="追加する" />}
      {dialog?.type === 'edit' && <EditDialog title="目標を編集" initial={dialog.g.text} onClose={() => setDialog(null)} onSave={(t) => edit(dialog.g, t)} />}
      {dialog?.type === 'del' && (
        <ConfirmDialog
          title="削除する"
          message={`「${dialog.g.text}」を削除します。消さずに灰色で残り、成果にも載りません。`}
          okLabel="削除する"
          warn
          onOk={() => remove(dialog.g)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'hist' && <HistorySheet kind={KIND.GOAL} id={dialog.g.id} title={dialog.g.text} onClose={() => setDialog(null)} />}
    </section>
  );
}

// 自由に書く欄（②今年の振り返り／④来年の抱負）
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

// 振り返り：どの年の分かを選び、上から順に ①答え合わせ ②振り返り ③来年の目標 ④抱負。下に長期の入口
// fixedYear を渡すと年を選ばせない（年表の「年ごとの記録」で使う）
export function ReviewScreen({ fixedYear = null, viewOnly = false }) {
  const { model, readOnly, year: currentYear } = useApp();
  const [picked, setPicked] = useState(() => chosenYear ?? defaultReviewYear(now()) ?? currentYear);
  const years = reviewYears(model, currentYear, picked);
  const year = fixedYear ?? (years.includes(picked) ? picked : currentYear);
  const tooOld = !canWriteReview(year, currentYear);
  const locked = viewOnly || readOnly || tooOld;

  const choose = (y) => {
    chosenYear = y;
    setPicked(y);
  };

  return (
    <div className="review-screen">
      {fixedYear == null && (
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

      {tooOld && !viewOnly ? (
        <p className="note">{year}年の分は見るだけです（書けるのは今年と前の年の分）</p>
      ) : (
        !locked && <p className="note">年末年始は上から順に進めます</p>
      )}

      <GoalSection num={1} title={`${year}年の目標の答え合わせ`} goalYear={year} judge locked={locked} emptyText={`${year}年の目標はありません（前の年の振り返りの③で決めます）`}>
        <p className="note">「達成」にした目標は、{year}年のアイスバーグの成果（水面の上）に載ります</p>
      </GoalSection>
      <TextSection num={2} title="今年の振り返り" year={year} layer={LAYER.REVIEW} locked={locked} />
      <GoalSection num={3} title={`${year + 1}年の目標`} goalYear={year + 1} locked={locked} emptyText="まだありません">
        <p className="note">{year + 1}年になると、ホームの「今年の目標」に出ます</p>
      </GoalSection>
      <TextSection num={4} title="来年の抱負" year={year} layer={LAYER.RESOLUTION} locked={locked} />

      {fixedYear == null && (
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
