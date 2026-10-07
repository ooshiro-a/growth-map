// @vitest-environment happy-dom
// 振り返り・長期（試験データは作り物だけ）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { buildModel } from '../src/lib/fold.js';
import { icebergYear } from '../src/lib/iceberg.js';
import { historyText, writtenLine } from '../src/lib/labels.js';
import {
  canWriteReview,
  currentQuarter,
  defaultQuarter,
  defaultReviewMode,
  defaultReviewYear,
  goalCounts,
  goalsOf,
  missedToCarry,
  nextQuarter,
  reviewEntry,
  reviewYears,
  roadmapItems,
  roadmapSkills,
} from '../src/lib/review.js';
import { KIND, LAYER, OP, quarterLayer, quarterOfLayer, reviewId, toRow } from '../src/lib/schema.js';
import { orderMoves } from '../src/lib/order.js';
import { growthYears } from '../src/lib/timeline.js';
import { LongtermScreen } from '../src/screens/LongtermScreen.jsx';
import { GoalSection, ReviewScreen } from '../src/screens/ReviewScreen.jsx';
import { ids, r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const G = KIND.GOAL;
const L = KIND.LONGTERM;

describe('振り返り：年の選び方', () => {
  it('1月は前の年、2月からは今年（日本時間）', () => {
    expect(defaultReviewYear(Date.parse('2027-01-01T00:30:00+09:00'))).toBe(2026);
    expect(defaultReviewYear(Date.parse('2027-01-31T23:59:00+09:00'))).toBe(2026);
    expect(defaultReviewYear(Date.parse('2027-02-01T00:00:00+09:00'))).toBe(2027);
    expect(defaultReviewYear(Date.parse('2026-12-31T23:59:00+09:00'))).toBe(2026);
    // 日本時間では1月1日（世界時ではまだ12月31日）
    expect(defaultReviewYear(Date.parse('2026-12-31T16:00:00Z'))).toBe(2026);
  });

  it('書けるのは今年と前の年の分だけ', () => {
    expect(canWriteReview(2027, 2027)).toBe(true);
    expect(canWriteReview(2026, 2027)).toBe(true);
    expect(canWriteReview(2025, 2027)).toBe(false);
    expect(canWriteReview(2028, 2027)).toBe(false);
  });

  it('選べる年：記録のある最初の年〜今年（新しい順）。先の年の目標は数えない', () => {
    const rows = [
      r({ year: 2024, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の目標' }),
      r({ year: 2028, kind: G, id: 'ng2', op: OP.ADD, text: '先の目標' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    expect(reviewYears(m, 2027)).toEqual([2027, 2026, 2025, 2024]);
    expect(reviewYears(buildModel([], [], { currentYear: 2027 }), 2027, 2026)).toEqual([2027, 2026]);
  });
});

describe('振り返り：目標の答え合わせ・②④', () => {
  it('達成／未達／判定を戻す。達成だけがその年の成果に載る。削除した目標は載らない', () => {
    const rows = [
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ADD, text: '作り物A' }),
      r({ year: 2026, kind: G, id: 'ng2', op: OP.ADD, text: '作り物B' }),
      r({ year: 2026, kind: G, id: 'ng3', op: OP.ADD, text: '作り物C' }),
      r({ year: 2027, kind: G, id: 'ng4', op: OP.ADD, text: '来年の作り物' }),
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ACHIEVE }),
      r({ year: 2026, kind: G, id: 'ng2', op: OP.MISS }),
      r({ year: 2026, kind: G, id: 'ng3', op: OP.ACHIEVE }),
      r({ year: 2026, kind: G, id: 'ng3', op: OP.DELETE }),
    ];
    let m = buildModel(rows, [], { currentYear: 2026 });
    expect(ids(goalsOf(m, 2026))).toEqual(['ng1', 'ng2', 'ng3']);
    expect(ids(goalsOf(m, 2027))).toEqual(['ng4']);
    expect(goalCounts(goalsOf(m, 2026))).toEqual({ achieved: 1, missed: 1, open: 0 });
    expect(ids(icebergYear(m, 2026).achieved)).toEqual(['ng1']);

    // 判定を戻す（状態変更・空）→ まだ
    rows.push(r({ year: 2026, kind: G, id: 'ng1', op: OP.STATUS, value: '' }));
    m = buildModel(rows, [], { currentYear: 2026 });
    expect(goalCounts(goalsOf(m, 2026))).toEqual({ achieved: 0, missed: 1, open: 1 });
    expect(icebergYear(m, 2026).achieved).toEqual([]);
    // 未達から達成へ
    rows.push(r({ year: 2026, kind: G, id: 'ng2', op: OP.ACHIEVE }));
    m = buildModel(rows, [], { currentYear: 2026 });
    expect(ids(icebergYear(m, 2026).achieved)).toEqual(['ng2']);
  });

  it('②④は決まった番号で、修正を重ねる。空にもできる。履歴に全部残る', () => {
    const id = reviewId(2026, LAYER.REVIEW);
    const rows = [
      r({ at: '2026-12-30T10:00:00.000+09:00', year: 2026, kind: KIND.REVIEW, id, op: OP.EDIT, layer: LAYER.REVIEW, text: '作り物の振り返り' }),
      r({ at: '2027-01-03T10:00:00.000+09:00', year: 2026, kind: KIND.REVIEW, id, op: OP.EDIT, layer: LAYER.REVIEW, text: '作り物の振り返り\n2行目' }),
    ];
    let m = buildModel(rows, [], { currentYear: 2027 });
    const e = reviewEntry(m, 2026, LAYER.REVIEW);
    expect(e.text).toBe('作り物の振り返り\n2行目');
    expect(writtenLine(e)).toBe('書いた日：26年12月30日／27年1月3日に修正');
    expect(reviewEntry(m, 2026, LAYER.RESOLUTION)).toBeNull();
    expect(reviewEntry(m, 2027, LAYER.REVIEW)).toBeNull();

    rows.push(r({ year: 2026, kind: KIND.REVIEW, id, op: OP.EDIT, layer: LAYER.REVIEW, text: '' }));
    m = buildModel(rows, [], { currentYear: 2027 });
    expect(reviewEntry(m, 2026, LAYER.REVIEW).text).toBe('');
    expect(m.historyOf(KIND.REVIEW, id).map((x) => historyText(x, KIND.REVIEW))).toEqual([
      '書いた「作り物の振り返り」',
      '書いた「作り物の振り返り\n2行目」',
      '空にした',
    ]);
  });
});

describe('四半期：区切り（1Q＝1〜3月、日本時間）', () => {
  const at = (s) => Date.parse(s);

  it('最初に出す四半期：四半期の最初の月は前の四半期、ほかは今の四半期。1月は前の年の4Q', () => {
    expect(defaultQuarter(at('2026-10-04T12:00:00+09:00'))).toEqual({ year: 2026, q: 3 });
    expect(defaultQuarter(at('2026-10-31T23:59:00+09:00'))).toEqual({ year: 2026, q: 3 });
    expect(defaultQuarter(at('2026-11-01T00:00:00+09:00'))).toEqual({ year: 2026, q: 4 });
    expect(defaultQuarter(at('2026-12-31T23:59:00+09:00'))).toEqual({ year: 2026, q: 4 });
    expect(defaultQuarter(at('2027-01-15T12:00:00+09:00'))).toEqual({ year: 2026, q: 4 });
    expect(defaultQuarter(at('2027-02-01T00:00:00+09:00'))).toEqual({ year: 2027, q: 1 });
    expect(defaultQuarter(at('2027-04-01T00:00:00+09:00'))).toEqual({ year: 2027, q: 1 });
    expect(defaultQuarter(at('2027-05-10T12:00:00+09:00'))).toEqual({ year: 2027, q: 2 });
    expect(defaultQuarter(at('2027-07-01T09:00:00+09:00'))).toEqual({ year: 2027, q: 2 });
    // 日本時間では10月1日（世界時ではまだ9月30日）
    expect(defaultQuarter(at('2026-09-30T15:30:00Z'))).toEqual({ year: 2026, q: 3 });
    expect(currentQuarter(at('2026-09-30T15:30:00Z'))).toEqual({ year: 2026, q: 4 });
    expect(currentQuarter(at('2026-09-30T14:59:00Z'))).toEqual({ year: 2026, q: 3 });
    // 日本時間では1月1日
    expect(currentQuarter(at('2026-12-31T16:00:00Z'))).toEqual({ year: 2027, q: 1 });
    expect(defaultQuarter(at('2026-12-31T16:00:00Z'))).toEqual({ year: 2026, q: 4 });
  });

  it('最初に出す四半期の年は、年の振り返りで最初に選ぶ年と同じ', () => {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15, 28]) {
        const ms = at(`2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+09:00`);
        expect(defaultQuarter(ms).year).toBe(defaultReviewYear(ms));
      }
    }
  });

  it('次の四半期：4Q の次は翌年の1Q', () => {
    expect(nextQuarter(2026, 1)).toEqual({ year: 2026, q: 2 });
    expect(nextQuarter(2026, 3)).toEqual({ year: 2026, q: 4 });
    expect(nextQuarter(2026, 4)).toEqual({ year: 2027, q: 1 });
  });

  it('最初に出す方：12月・1月は年の振り返り、ほかは四半期', () => {
    expect(defaultReviewMode(at('2026-12-01T00:00:00+09:00'))).toBe('year');
    expect(defaultReviewMode(at('2027-01-31T23:59:00+09:00'))).toBe('year');
    expect(defaultReviewMode(at('2027-02-01T00:00:00+09:00'))).toBe('quarter');
    expect(defaultReviewMode(at('2026-11-30T23:59:00+09:00'))).toBe('quarter');
    expect(defaultReviewMode(at('2026-11-30T15:00:00Z'))).toBe('year'); // 日本時間では12月1日
  });

  it('層の名前', () => {
    expect(quarterLayer(3)).toBe('q3');
    expect(quarterOfLayer('q4')).toBe(4);
    expect(quarterOfLayer('')).toBeNull();
    expect(quarterOfLayer('review')).toBeNull();
    expect(quarterOfLayer('q5')).toBeNull();
  });
});

describe('四半期：目標と振り返り', () => {
  const rows = () => [
    r({ year: 2026, kind: G, id: 'ny1', op: OP.ADD, text: '作り物の年の目標' }),
    r({ year: 2026, kind: G, id: 'ny1', op: OP.ACHIEVE }),
    r({ year: 2026, kind: G, id: 'nq1', op: OP.ADD, layer: 'q3', text: '作り物の3Qの目標A' }),
    r({ year: 2026, kind: G, id: 'nq2', op: OP.ADD, layer: 'q3', text: '作り物の3Qの目標B' }),
    r({ year: 2026, kind: G, id: 'nq3', op: OP.ADD, layer: 'q3', text: '作り物の3Qの目標0', extra: { after: '' } }),
    r({ year: 2025, kind: G, id: 'nq4', op: OP.ADD, layer: 'q3', text: '作り物の去年の3Qの目標' }),
    r({ year: 2026, kind: G, id: 'nq5', op: OP.ADD, layer: 'q4', text: '作り物の4Qの目標' }),
    r({ year: 2026, kind: G, id: 'nq1', op: OP.ACHIEVE, layer: 'q3' }),
    r({ year: 2026, kind: G, id: 'nq2', op: OP.MISS, layer: 'q3' }),
  ];

  it('四半期の目標は年の目標・成果・年表に混ざらない。四半期ごとに年と層で分かれる', () => {
    const m = buildModel(rows(), [], { currentYear: 2026 });
    expect(ids(goalsOf(m, 2026))).toEqual(['ny1']);
    expect(ids(goalsOf(m, 2026, 'q3'))).toEqual(['nq3', 'nq1', 'nq2']);
    expect(ids(goalsOf(m, 2025, 'q3'))).toEqual(['nq4']);
    expect(ids(goalsOf(m, 2026, 'q4'))).toEqual(['nq5']);
    expect(goalsOf(m, 2026, 'q1')).toEqual([]);
    expect(goalCounts(goalsOf(m, 2026, 'q3'))).toEqual({ achieved: 1, missed: 1, open: 1 });
    // 達成した四半期の目標は成果に載らない（成果は年の目標だけ）
    expect(ids(icebergYear(m, 2026).achieved)).toEqual(['ny1']);
    expect(growthYears(m).find((y) => y.year === 2026).achieved.map((g) => g.id)).toEqual(['ny1']);
  });

  it('未達を写す先：削除していない未達のうち、写す先にまだ同じ文言がないもの（削除した写しは数えない）', () => {
    const list = rows().concat([
      r({ year: 2026, kind: G, id: 'nq6', op: OP.ADD, layer: 'q3', text: '作り物の3Qの目標C' }),
      r({ year: 2026, kind: G, id: 'nq6', op: OP.MISS, layer: 'q3' }),
      r({ year: 2026, kind: G, id: 'nq7', op: OP.ADD, layer: 'q3', text: '作り物の消した目標' }),
      r({ year: 2026, kind: G, id: 'nq7', op: OP.MISS, layer: 'q3' }),
      r({ year: 2026, kind: G, id: 'nq7', op: OP.DELETE, layer: 'q3' }),
      // 4Q に B は写し済み、C は写したが削除した
      r({ year: 2026, kind: G, id: 'nq8', op: OP.ADD, layer: 'q4', text: ' 作り物の3Qの目標B ', extra: { source: 'quarter' } }),
      r({ year: 2026, kind: G, id: 'nq9', op: OP.ADD, layer: 'q4', text: '作り物の3Qの目標C', extra: { source: 'quarter' } }),
      r({ year: 2026, kind: G, id: 'nq9', op: OP.DELETE, layer: 'q4' }),
    ]);
    const m = buildModel(list, [], { currentYear: 2026 });
    expect(ids(missedToCarry(goalsOf(m, 2026, 'q3'), goalsOf(m, 2026, 'q4')))).toEqual(['nq6']);
    expect(ids(missedToCarry(goalsOf(m, 2026, 'q3'), []))).toEqual(['nq2', 'nq6']);
    // 写す元に同じ文言が2つあっても、写すのは最初の1つだけ
    const twin = [{ id: 'a', text: '作り物', result: OP.MISS }, { id: 'b', text: ' 作り物 ', result: OP.MISS }];
    expect(ids(missedToCarry(twin, []))).toEqual(['a']);
    expect(historyText(m.historyOf(G, 'nq8')[0], G)).toBe('前の四半期から追加「 作り物の3Qの目標B 」');
  });

  it('四半期の振り返りの文章は決まった番号 rv-年-q◯ で、年の②④と分かれる', () => {
    const id = reviewId(2026, 'q3');
    expect(id).toBe('rv-2026-q3');
    const list = [
      r({ year: 2026, kind: KIND.REVIEW, id, op: OP.EDIT, layer: 'q3', text: '作り物の3Qの振り返り' }),
      r({ year: 2026, kind: KIND.REVIEW, id: reviewId(2026, LAYER.REVIEW), op: OP.EDIT, layer: LAYER.REVIEW, text: '作り物の年の振り返り' }),
    ];
    const m = buildModel(list, [], { currentYear: 2026 });
    expect(reviewEntry(m, 2026, 'q3').text).toBe('作り物の3Qの振り返り');
    expect(reviewEntry(m, 2026, 'q4')).toBeNull();
    expect(reviewEntry(m, 2026, LAYER.REVIEW).text).toBe('作り物の年の振り返り');
  });
});

describe('長期プラン：ありたい姿・必要なスキル・並べ替え', () => {
  it('ロードマップは面ごとに並び、時期は付記に入る。編集で時期を空にできる', () => {
    const rows = [
      r({ kind: L, id: 'nr1', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿1', extra: { when: '2035年' } }),
      r({ kind: L, id: 'nr2', op: OP.ADD, layer: LAYER.ROADMAP_PRIVATE, text: '作り物の姿2' }),
      r({ kind: L, id: 'nr3', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿3', extra: { when: '2030年', after: 'nr1' } }),
      r({ kind: L, id: 'nr4', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿0', extra: { when: '2040年', after: '' } }),
      r({ kind: L, id: 'nr1', op: OP.EDIT, text: '作り物の姿1・改', extra: { when: '' } }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const work = roadmapItems(m, LAYER.ROADMAP_WORK);
    expect(ids(work)).toEqual(['nr4', 'nr1', 'nr3']);
    expect(work[1]).toMatchObject({ text: '作り物の姿1・改', attrs: { when: '' } });
    expect(ids(roadmapItems(m, LAYER.ROADMAP_PRIVATE))).toEqual(['nr2']);
    expect(historyText(m.historyOf(L, 'nr3')[0], L)).toBe('追加「作り物の姿3」（時期：2030年）');
  });

  it('必要なスキルは姿の下に並ぶ。姿を削除するとスキルも灰色（削除日は姿の日）', () => {
    const rows = [
      r({ kind: L, id: 'nr1', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿1' }),
      r({ kind: L, id: 'nr2', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿2' }),
      r({ kind: L, id: 'ns1', op: OP.ADD, layer: LAYER.ROADMAP_SKILL, parent: 'nr1', text: '作り物のスキル1' }),
      r({ kind: L, id: 'ns2', op: OP.ADD, layer: LAYER.ROADMAP_SKILL, parent: 'nr1', text: '作り物のスキル0', extra: { after: '' } }),
      r({ kind: L, id: 'ns3', op: OP.ADD, layer: LAYER.ROADMAP_SKILL, parent: 'nr2', text: '作り物のスキル3' }),
      r({ kind: L, id: 'nr1', op: OP.DELETE }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const work = roadmapItems(m, LAYER.ROADMAP_WORK);
    // スキルは面の並びに混ざらない
    expect(ids(work)).toEqual(['nr1', 'nr2']);
    const s1 = roadmapSkills(m, work[0]);
    expect(s1.map((x) => x.e.id)).toEqual(['ns2', 'ns1']);
    expect(s1.every((x) => x.deleted && x.deleted.inherited)).toBe(true);
    expect(roadmapSkills(m, work[1]).map((x) => [x.e.id, x.deleted])).toEqual([['ns3', null]]);
  });

  it('並べ替えの記録：動いた項目の分だけ。並べ替えた通りに組み上がる', () => {
    expect(orderMoves(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
    expect(orderMoves(['a', 'b', 'c'], ['b', 'a', 'c'])).toHaveLength(1);
    expect(orderMoves(['a', 'b', 'c'], ['b', 'c', 'a'])).toEqual([{ id: 'a', after: 'c' }]);
    expect(orderMoves(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([{ id: 'c', after: '' }]);
    expect(orderMoves(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])).toHaveLength(3);
    // どの並びでも、組み上げた結果が下書きと同じになる（灰色の項目は元の場所のまま）
    const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const live = ['n1', 'n2', 'n3', 'n4'];
    for (const want of perms(live)) {
      const rows = [
        r({ kind: L, id: 'n1', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '1' }),
        r({ kind: L, id: 'nx', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: 'x' }),
        r({ kind: L, id: 'n2', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '2' }),
        r({ kind: L, id: 'n3', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '3' }),
        r({ kind: L, id: 'n4', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '4' }),
        r({ kind: L, id: 'nx', op: OP.DELETE }),
        ...orderMoves(live, want).map(({ id, after }) => r({ kind: L, id, op: OP.MOVE, extra: { after } })),
      ];
      const got = ids(roadmapItems(buildModel(rows, [], { currentYear: 2026 }), LAYER.ROADMAP_WORK)).filter((id) => id !== 'nx');
      expect(got).toEqual(want);
    }
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ log, currentYear = 2026, initial = [], children }) {
  const [rows, setRows] = useState(initial);
  const model = useMemo(() => buildModel(rows, [], { currentYear }), [rows, currentYear]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-28T10:00:${String((rows.length + i) % 60).padStart(2, '0')}.000+09:00`, no: `rrev${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((x) => x.concat(add));
    return add;
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly: false, year: currentYear }}>
      <span id="bar-actions" />
      {children}
    </AppContext.Provider>
  );
}

const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (label) => fireEvent.click(screen.getByRole('menuitem', { name: label }));
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));

describe('振り返りの画面', () => {
  it('③で来年の目標を足す → 翌年の分の①に出て、達成を押すともう一度で戻る', async () => {
    const log = [];
    render(
      <Harness log={log} currentYear={2026}>
        <ReviewScreen />
      </Harness>,
    );
    tab('年の振り返り');
    const pick = await screen.findByRole('combobox', { name: 'どの年の分か' });
    fireEvent.change(pick, { target: { value: '2026' } });

    openMenu('2027年の目標の操作');
    choose('目標を追加');
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の来年の目標' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '目標', op: '追加', year: 2027, text: '作り物の来年の目標' });

    openMenu('2026年の目標の答え合わせの操作');
    choose('目標を追加');
    dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の今年の目標' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));

    const group = screen.getByRole('group', { name: '「作り物の今年の目標」の答え合わせ' });
    fireEvent.click(within(group).getByRole('button', { name: '達成' }));
    expect(log.at(-1)).toMatchObject({ op: '達成', year: 2026 });
    expect(within(group).getByRole('button', { name: '達成' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('達成 1件・未達 0件・まだ 0件')).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: '達成' }));
    expect(log.at(-1)).toMatchObject({ op: '状態変更', value: '' });
    expect(within(group).getByRole('button', { name: '達成' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(group).getByRole('button', { name: '未達' }));
    expect(log.at(-1)).toMatchObject({ op: '未達' });
  });

  it('②を書く・直す・空にする（決まった番号で修正の行を足す）', async () => {
    const log = [];
    render(
      <Harness log={log} currentYear={2026}>
        <ReviewScreen />
      </Harness>,
    );
    tab('年の振り返り');
    fireEvent.change(await screen.findByRole('combobox', { name: 'どの年の分か' }), { target: { value: '2026' } });
    fireEvent.click(screen.getAllByRole('button', { name: '＋ 書く' })[0]);
    let dialog = screen.getByRole('dialog', { name: '今年の振り返り' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の1行目\n作り物の2行目' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ kind: '振り返り', id: 'rv-2026-review', op: '修正', layer: 'review', year: 2026, text: '作り物の1行目\n作り物の2行目' });
    expect(screen.getByText(/書いた日：26年9月28日/)).toBeTruthy();

    openMenu('今年の振り返りの操作');
    choose('編集する');
    dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ id: 'rv-2026-review', text: '' });
    expect(screen.getAllByRole('button', { name: '＋ 書く' })).toHaveLength(2);
  });

  it('2年前の分は見るだけ（答え合わせのボタン・追加・書くを出さない）', async () => {
    const initial = [
      r({ year: 2025, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の古い目標' }),
      r({ year: 2025, kind: G, id: 'ng1', op: OP.ACHIEVE }),
    ];
    render(
      <Harness log={[]} currentYear={2027} initial={initial}>
        <ReviewScreen />
      </Harness>,
    );
    tab('年の振り返り');
    fireEvent.change(await screen.findByRole('combobox', { name: 'どの年の分か' }), { target: { value: '2025' } });
    expect(screen.getByText('2025年の分は見るだけです（書けるのは今年と前の年の分）')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /答え合わせ/ })).toBeNull();
    expect(screen.getByText('達成', { selector: '.judge-tag' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '＋ 書く' })).toBeNull();
    expect(screen.queryByRole('button', { name: '2025年の目標の答え合わせの操作' })).toBeNull();
    openMenu('「作り物の古い目標」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);

    // 前の年（2026）は書ける
    fireEvent.change(screen.getByRole('combobox', { name: 'どの年の分か' }), { target: { value: '2026' } });
    expect(screen.getAllByRole('button', { name: '＋ 書く' })).toHaveLength(2);
  });
});

describe('四半期の振り返りの画面', () => {
  const menuItems = () => screen.getAllByRole('menuitem').map((b) => [b.textContent, b.disabled]);

  it('①に足して未達にする → 「…」から次の四半期へ写す。②を書く。行にはすべて層を書く', async () => {
    const log = [];
    render(
      <Harness log={log} currentYear={2026}>
        <ReviewScreen />
      </Harness>,
    );
    tab('四半期');
    fireEvent.change(await screen.findByRole('combobox', { name: 'どの年の分か' }), { target: { value: '2026' } });
    tab('3Q（7〜9月）');
    expect(screen.getByRole('tab', { name: '3Q（7〜9月）', selected: true })).toBeTruthy();
    expect(screen.getByText('四半期の終わりに上から順に進めます')).toBeTruthy();
    expect(screen.getByText('3Qの目標はありません（前の四半期の③で決めます）')).toBeTruthy();

    openMenu('2026年3Qの目標の答え合わせの操作');
    choose('目標を追加');
    let dialog = screen.getByRole('dialog', { name: '目標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の3Qの目標' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '目標', op: '追加', year: 2026, layer: 'q3', text: '作り物の3Qの目標' });

    const group = screen.getByRole('group', { name: '「作り物の3Qの目標」の答え合わせ' });
    fireEvent.click(within(group).getByRole('button', { name: '未達' }));
    expect(log.at(-1)).toMatchObject({ op: '未達', year: 2026, layer: 'q3' });
    expect(screen.getByText('達成 0件・未達 1件・まだ 0件')).toBeTruthy();
    expect(screen.getByText('未達の目標は「…」から4Qの目標へ写せます')).toBeTruthy();

    // 写す：次の四半期（4Q）の目標に、同じ文言を「前の四半期から」で足す
    openMenu('「作り物の3Qの目標」の操作');
    expect(menuItems().map(([t]) => t)).toEqual(['編集する', 'この下に追加', '4Qの目標へ写す', '削除する（灰色で残る）', '履歴を見る', '完全に削除する']);
    choose('4Qの目標へ写す');
    expect(log.at(-1)).toMatchObject({ kind: '目標', op: '追加', year: 2026, layer: 'q4', text: '作り物の3Qの目標', extra: { source: 'quarter' } });
    expect(screen.getAllByText('作り物の3Qの目標')).toHaveLength(2);
    expect(screen.queryByText('未達の目標は「…」から4Qの目標へ写せます')).toBeNull();
    openMenu('2026年3Qの目標の答え合わせの操作');
    expect(menuItems()).toEqual([['目標を追加', false]]);
    fireEvent.keyDown(document, { key: 'Escape' });
    // 写し済みは押せない（①の方の「…」）
    fireEvent.click(screen.getAllByRole('button', { name: '「作り物の3Qの目標」の操作' })[0]);
    expect(menuItems()).toContainEqual(['4Qの目標へ写し済み', true]);
    fireEvent.keyDown(document, { key: 'Escape' });

    // 削除・判定を戻すにも層を書く
    fireEvent.click(within(group).getByRole('button', { name: '未達' }));
    expect(log.at(-1)).toMatchObject({ op: '状態変更', value: '', year: 2026, layer: 'q3' });

    // ②：四半期の振り返り
    fireEvent.click(screen.getByRole('button', { name: '＋ 書く' }));
    dialog = screen.getByRole('dialog', { name: '3Qの振り返り' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の3Qの振り返り' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ kind: '振り返り', id: 'rv-2026-q3', op: '修正', layer: 'q3', year: 2026, text: '作り物の3Qの振り返り' });

    // 履歴は「2026年3Q分」
    openMenu('3Qの振り返りの操作');
    choose('履歴を見る');
    dialog = screen.getByRole('dialog', { name: '履歴：2026年の3Qの振り返り' });
    expect(within(dialog).getByText(/2026年3Q分/)).toBeTruthy();
  });

  it('4Q の③は翌年の1Q。未達をまとめて写す（写し済みは除く）。年の振り返りには混ざらない', async () => {
    const log = [];
    const initial = [
      r({ year: 2026, kind: G, id: 'nq1', op: OP.ADD, layer: 'q4', text: '作り物の4Qの目標A' }),
      r({ year: 2026, kind: G, id: 'nq2', op: OP.ADD, layer: 'q4', text: '作り物の4Qの目標B' }),
      r({ year: 2026, kind: G, id: 'nq3', op: OP.ADD, layer: 'q4', text: '作り物の4Qの目標C' }),
      r({ year: 2026, kind: G, id: 'nq1', op: OP.MISS, layer: 'q4' }),
      r({ year: 2026, kind: G, id: 'nq2', op: OP.MISS, layer: 'q4' }),
      r({ year: 2026, kind: G, id: 'nq3', op: OP.ACHIEVE, layer: 'q4' }),
      r({ year: 2027, kind: G, id: 'nq4', op: OP.ADD, layer: 'q1', text: '作り物の4Qの目標B' }),
      r({ year: 2026, kind: G, id: 'ny1', op: OP.ADD, text: '作り物の年の目標' }),
    ];
    render(
      <Harness log={log} currentYear={2026} initial={initial}>
        <ReviewScreen />
      </Harness>,
    );
    tab('四半期');
    fireEvent.change(await screen.findByRole('combobox', { name: 'どの年の分か' }), { target: { value: '2026' } });
    tab('4Q（10〜12月）');
    expect(screen.queryByText('作り物の年の目標')).toBeNull();
    expect(screen.getByText('2027年1Qの目標')).toBeTruthy();
    expect(screen.getByText('1Q（1〜3月）になると、ホームの「今の四半期の目標」に出ます')).toBeTruthy();

    openMenu('2026年4Qの目標の答え合わせの操作');
    choose('未達を2027年1Qの目標へ写す（1件）');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ year: 2027, layer: 'q1', op: '追加', text: '作り物の4Qの目標A', extra: { source: 'quarter' } });

    openMenu('2027年1Qの目標の操作');
    choose('目標を追加');
    const dialog = screen.getByRole('dialog', { name: '目標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の来年1Qの目標' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ year: 2027, layer: 'q1', text: '作り物の来年1Qの目標' });

    // 年の振り返りの①には年の目標だけ
    tab('年の振り返り');
    expect(screen.getByText('作り物の年の目標')).toBeTruthy();
    expect(screen.queryByText('作り物の4Qの目標A')).toBeNull();
    expect(screen.getByText('年末年始は上から順に進めます')).toBeTruthy();
    // 四半期へ戻ると、選んだ四半期のまま
    tab('四半期');
    expect(screen.getByRole('tab', { name: '4Q（10〜12月）', selected: true })).toBeTruthy();
  });

  it('2年前の四半期は見るだけ（判定・追加・書く・写すを出さない）', async () => {
    const initial = [
      r({ year: 2025, kind: G, id: 'nq1', op: OP.ADD, layer: 'q2', text: '作り物の古い2Qの目標' }),
      r({ year: 2025, kind: G, id: 'nq1', op: OP.MISS, layer: 'q2' }),
    ];
    render(
      <Harness log={[]} currentYear={2027} initial={initial}>
        <ReviewScreen />
      </Harness>,
    );
    tab('四半期');
    fireEvent.change(await screen.findByRole('combobox', { name: 'どの年の分か' }), { target: { value: '2025' } });
    tab('2Q（4〜6月）');
    expect(screen.getByText('2025年の分は見るだけです（書けるのは今年と前の年の分）')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /答え合わせ/ })).toBeNull();
    expect(screen.getByText('未達', { selector: '.judge-tag' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '＋ 書く' })).toBeNull();
    expect(screen.queryByRole('button', { name: '2025年2Qの目標の答え合わせの操作' })).toBeNull();
    expect(screen.queryByText(/へ写せます/)).toBeNull();
    openMenu('「作り物の古い2Qの目標」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
  });

  it('四半期の目標の並べ替え：その四半期の中だけ。行には年と層を書く。「やめる」は何も書かない', () => {
    const log = [];
    const initial = [
      r({ year: 2026, kind: G, id: 'nq1', op: OP.ADD, layer: 'q4', text: '作り物の4Q目標1' }),
      r({ year: 2026, kind: G, id: 'nq2', op: OP.ADD, layer: 'q4', text: '作り物の4Q目標2' }),
      r({ year: 2026, kind: G, id: 'nq3', op: OP.ADD, layer: 'q3', text: '作り物の3Q目標' }),
      r({ year: 2026, kind: G, id: 'ny1', op: OP.ADD, text: '作り物の年の目標' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <GoalSection num={3} title="4Qの目標" goalYear={2026} layer="q4" toResult={false} locked={false} emptyText="まだありません" />
      </Harness>,
    );
    openMenu('4Qの目標の操作');
    choose('並べ替える');
    let sort = screen.getByRole('region', { name: '4Qの目標の並べ替え' });
    expect([...sort.querySelectorAll('.tx')].map((x) => x.textContent)).toEqual(['作り物の4Q目標1', '作り物の4Q目標2']);
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の4Q目標2」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: 'やめる' }));
    expect(log).toHaveLength(0);

    openMenu('「作り物の4Q目標2」の操作');
    choose('並べ替える');
    sort = screen.getByRole('region', { name: '4Qの目標の並べ替え' });
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の4Q目標2」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '保存する' }));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ year: 2026, kind: '目標', layer: 'q4', op: '並べ替え' });
    expect([...document.querySelectorAll('.item .tx')].map((x) => x.textContent)).toEqual(['作り物の4Q目標2', '作り物の4Q目標1']);
  });
});

describe('長期プランの画面', () => {
  it('時期＋ありたい姿を足し、時期が前に出る', () => {
    const log = [];
    render(
      <Harness log={log}>
        <LongtermScreen />
      </Harness>,
    );
    openMenu('仕事面の操作');
    choose('追加する');
    const dialog = screen.getByRole('dialog', { name: 'ありたい姿を追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /時期/ }), { target: { value: '2030年' } });
    const save = within(dialog).getByRole('button', { name: '追加する' });
    expect(save.disabled).toBe(true); // ありたい姿が空
    fireEvent.change(within(dialog).getByRole('textbox', { name: /ありたい姿/ }), { target: { value: '作り物のありたい姿' } });
    fireEvent.click(save);
    expect(log.at(-1)).toMatchObject({ kind: '長期', op: '追加', layer: 'roadmapWork', year: '', parent: '', text: '作り物のありたい姿', extra: { when: '2030年' } });
    expect(screen.getByText('2030年', { selector: '.lead' })).toBeTruthy();
  });

  it('必要なスキルや考え方などを姿の下に足す。姿を削除するとスキルも灰色', () => {
    const log = [];
    const initial = [r({ kind: L, id: 'nr1', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿', extra: { when: '2035年' } })];
    render(
      <Harness log={log} initial={initial}>
        <LongtermScreen />
      </Harness>,
    );
    expect(screen.getByText('（「…」→「必要なスキルや考え方などを追加」）')).toBeTruthy();
    openMenu('「作り物の姿」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      '編集する',
      '必要なスキルや考え方などを追加',
      'この下に追加',
      '削除する（灰色で残る）',
      '履歴を見る',
      '完全に削除する',
    ]);
    choose('必要なスキルや考え方などを追加');
    let dialog = screen.getByRole('dialog', { name: '必要なスキルや考え方などを追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '必要なスキルや考え方など' }), { target: { value: '作り物のスキル' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '長期', op: '追加', layer: 'roadmapSkill', parent: 'nr1', year: '', text: '作り物のスキル' });
    expect(screen.getByText('作り物のスキル').closest('.means')).toBeTruthy();
    expect(screen.queryByText('（「…」→「必要なスキルや考え方などを追加」）')).toBeNull();

    openMenu('「作り物のスキル」の操作');
    choose('編集する');
    dialog = screen.getByRole('dialog', { name: '必要なスキルや考え方などを編集' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '必要なスキルや考え方など' }), { target: { value: '作り物のスキル・改' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ op: '修正', text: '作り物のスキル・改' });

    openMenu('「作り物の姿」の操作');
    choose('削除する（灰色で残る）');
    dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('この姿の必要なスキルや考え方なども灰色になります。');
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
    expect(screen.getByText('作り物のスキル・改').closest('.item').className).toContain('del');
    openMenu('「作り物のスキル・改」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
  });

  it('習得すべきスキル：いちばん上の欄。追加・この下に追加・編集・並べ替え・削除（灰色）', () => {
    const log = [];
    const S = LAYER.LONG_SKILL;
    const initial = [
      r({ kind: L, id: 'nk1', op: OP.ADD, layer: S, text: '作り物の習得スキルA' }),
      r({ kind: L, id: 'nr1', op: OP.ADD, layer: LAYER.ROADMAP_WORK, text: '作り物の姿' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <LongtermScreen />
      </Harness>,
    );
    const lists = () => [...document.querySelectorAll('.longterm-screen > .list')];
    expect(lists().map((x) => x.querySelector('.sec span').textContent)).toEqual(['習得すべきスキル', '仕事面', 'プライベート面']);
    const texts = () => [...lists()[0].querySelectorAll('.item .tx')].map((x) => x.textContent);
    // 1つだけの時は並べ替えを出さない
    openMenu('「作り物の習得スキルA」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      '編集する',
      'サブスキルを追加',
      'この下に追加',
      '削除する（灰色で残る）',
      '履歴を見る',
      '完全に削除する',
    ]);
    choose('この下に追加');
    let dialog = screen.getByRole('dialog', { name: '習得すべきスキルを追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '習得すべきスキル' }), { target: { value: '作り物の習得スキルB' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '長期', op: '追加', layer: 'longSkill', parent: '', year: '', text: '作り物の習得スキルB', extra: { after: 'nk1' } });

    openMenu('習得すべきスキルの操作');
    choose('追加する');
    dialog = screen.getByRole('dialog', { name: '習得すべきスキルを追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '習得すべきスキル' }), { target: { value: '作り物の習得スキルC' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(texts()).toEqual(['作り物の習得スキルA', '作り物の習得スキルB', '作り物の習得スキルC']);
    // 仕事面には混ざらない
    expect(lists()[1].textContent).not.toContain('作り物の習得スキル');

    openMenu('「作り物の習得スキルB」の操作');
    choose('編集する');
    dialog = screen.getByRole('dialog', { name: '習得すべきスキルを編集' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '習得すべきスキル' }), { target: { value: '作り物の習得スキルB・改' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ op: '修正', text: '作り物の習得スキルB・改' });

    const before = log.length;
    openMenu('習得すべきスキルの操作');
    choose('並べ替える');
    const sort = screen.getByRole('region', { name: '習得すべきスキルの並べ替え' });
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の習得スキルC」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の習得スキルC」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '保存する' }));
    expect(log.slice(before)).toEqual([{ year: '', kind: '長期', id: expect.any(String), op: '並べ替え', extra: { after: '' } }]);
    expect(texts()).toEqual(['作り物の習得スキルC', '作り物の習得スキルA', '作り物の習得スキルB・改']);

    openMenu('「作り物の習得スキルA」の操作');
    choose('削除する（灰色で残る）');
    dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('このスキルのサブスキルも灰色になります。');
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
    expect(screen.getByText('作り物の習得スキルA').closest('.item').className).toContain('del');
    openMenu('「作り物の習得スキルA」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
  });

  it('サブスキル：習得すべきスキルの下に足し、編集・この下に追加・並べ替え・削除。親を削除するとサブスキルも灰色', () => {
    const log = [];
    const S = LAYER.LONG_SKILL;
    const U = LAYER.LONG_SUB;
    const initial = [
      r({ kind: L, id: 'nk1', op: OP.ADD, layer: S, text: '作り物の習得スキルA' }),
      r({ kind: L, id: 'nk2', op: OP.ADD, layer: S, text: '作り物の習得スキルB' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <LongtermScreen />
      </Harness>,
    );
    const top = () => [...document.querySelectorAll('.longterm-screen > .list')][0];
    const subs = () => [...top().querySelectorAll('.skill .tx')].map((x) => x.textContent);
    expect(top().querySelectorAll('.note')[0].textContent).toBe('（「…」→「サブスキルを追加」）');

    openMenu('「作り物の習得スキルA」の操作');
    choose('サブスキルを追加');
    let dialog = screen.getByRole('dialog', { name: 'サブスキルを追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'サブスキル' }), { target: { value: '作り物のサブ1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '長期', op: '追加', layer: 'longSub', parent: 'nk1', year: '', text: '作り物のサブ1' });

    openMenu('「作り物のサブ1」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      '編集する',
      'この下に追加',
      '並べ替える',
      '削除する（灰色で残る）',
      '履歴を見る',
      '完全に削除する',
    ]);
    choose('この下に追加');
    dialog = screen.getByRole('dialog', { name: 'サブスキルを追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'サブスキル' }), { target: { value: '作り物のサブ2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ layer: 'longSub', parent: 'nk1', extra: { after: log.at(-2).id } });
    expect(subs()).toEqual(['作り物のサブ1', '作り物のサブ2']);
    expect(screen.getByText('作り物のサブ1').closest('.means')).toBeTruthy();

    openMenu('「作り物のサブ2」の操作');
    choose('編集する');
    dialog = screen.getByRole('dialog', { name: 'サブスキルを編集' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'サブスキル' }), { target: { value: '作り物のサブ2・改' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ op: '修正', text: '作り物のサブ2・改' });

    // 並べ替え：サブスキルは同じスキルの下で動かす（2段の ↑↓）
    const before = log.length;
    openMenu('「作り物のサブ1」の操作');
    choose('並べ替える');
    const sort = screen.getByRole('region', { name: '習得すべきスキルの並べ替え' });
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物のサブ2・改」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の習得スキルB」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '保存する' }));
    expect(log.slice(before)).toHaveLength(2);
    expect(log.slice(before).every((d) => d.op === '並べ替え' && d.kind === '長期' && d.year === '')).toBe(true);
    expect([...top().querySelectorAll('.vision > .item .tx')].map((x) => x.textContent)).toEqual(['作り物の習得スキルB', '作り物の習得スキルA']);
    expect(subs()).toEqual(['作り物のサブ2・改', '作り物のサブ1']);

    openMenu('「作り物の習得スキルA」の操作');
    choose('削除する（灰色で残る）');
    dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('このスキルのサブスキルも灰色になります。');
    fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
    expect(screen.getByText('作り物のサブ1').closest('.item').className).toContain('del');
    openMenu('「作り物のサブ1」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
  });

  it('「…」→「並べ替える」：↑↓ で動かし、保存で動いた分だけ記録を足す。やめると何も書かない', () => {
    const log = [];
    const W = LAYER.ROADMAP_WORK;
    const initial = [
      r({ kind: L, id: 'nr1', op: OP.ADD, layer: W, text: '作り物の姿A', extra: { when: '2028年' } }),
      r({ kind: L, id: 'nr2', op: OP.ADD, layer: W, text: '作り物の姿B', extra: { when: '2035年' } }),
      r({ kind: L, id: 'nr3', op: OP.ADD, layer: W, text: '作り物の姿C', extra: { when: '2038年' } }),
      r({ kind: L, id: 'nrx', op: OP.ADD, layer: W, text: '作り物の消した姿' }),
      r({ kind: L, id: 'nrx', op: OP.DELETE }),
      r({ kind: L, id: 'ns1', op: OP.ADD, layer: LAYER.ROADMAP_SKILL, parent: 'nr2', text: '作り物のスキル1' }),
      r({ kind: L, id: 'ns2', op: OP.ADD, layer: LAYER.ROADMAP_SKILL, parent: 'nr2', text: '作り物のスキル2' }),
      r({ kind: L, id: 'np1', op: OP.ADD, layer: LAYER.ROADMAP_PRIVATE, text: '作り物の私の姿' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <LongtermScreen />
      </Harness>,
    );
    const work = () => [...document.querySelectorAll('.longterm-screen > .list')][1];
    const texts = () => [...work().querySelectorAll('.vision > .item .tx')].map((x) => x.textContent);
    // 1つしかない面には出さない
    openMenu('プライベート面の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['追加する']);
    openMenu('プライベート面の操作');

    // やめる：何も書かない
    openMenu('「作り物の姿B」の操作');
    choose('並べ替える');
    const sort = screen.getByRole('region', { name: '仕事面の並べ替え' });
    expect(within(sort).queryByText('作り物の消した姿')).toBeNull();
    expect(within(sort).getByText('灰色（削除した項目）は元の場所のまま動きません')).toBeTruthy();
    expect(within(sort).getByRole('button', { name: '保存する' }).disabled).toBe(true);
    expect(within(sort).getByRole('button', { name: '「作り物の姿A」を上へ' }).disabled).toBe(true);
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の姿C」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: 'やめる' }));
    expect(log).toHaveLength(0);
    expect(texts()).toEqual(['2028年作り物の姿A', '2035年作り物の姿B', '2038年作り物の姿C', '作り物の消した姿']);

    // 遠い順に並べ替え、スキルも入れ替える
    openMenu('仕事面の操作');
    choose('並べ替える');
    const s2 = screen.getByRole('region', { name: '仕事面の並べ替え' });
    fireEvent.click(within(s2).getByRole('button', { name: '「作り物の姿C」を上へ' }));
    fireEvent.click(within(s2).getByRole('button', { name: '「作り物の姿C」を上へ' }));
    fireEvent.click(within(s2).getByRole('button', { name: '「作り物の姿B」を上へ' }));
    fireEvent.click(within(s2).getByRole('button', { name: '「作り物のスキル2」を上へ' }));
    fireEvent.click(within(s2).getByRole('button', { name: '保存する' }));
    // 姿は2つ、スキルは1つ動かせば足りる（年は空欄、親・層は書かない）
    expect(log).toHaveLength(3);
    expect(log.every((d) => d.op === '並べ替え' && d.kind === '長期' && d.year === '' && d.parent === undefined && d.layer === undefined)).toBe(true);
    expect(log.filter((d) => d.id.startsWith('ns'))).toHaveLength(1);
    expect(screen.queryByRole('region', { name: '仕事面の並べ替え' })).toBeNull();
    expect(texts()).toEqual(['2038年作り物の姿C', '2035年作り物の姿B', '2028年作り物の姿A', '作り物の消した姿']);
    const skills = [...work().querySelectorAll('.skill .tx')].map((x) => x.textContent);
    expect(skills).toEqual(['作り物のスキル2', '作り物のスキル1']);
  });
});
