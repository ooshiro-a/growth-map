// @vitest-environment happy-dom
// 振り返り・長期（試験データは作り物だけ）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { buildModel } from '../src/lib/fold.js';
import { icebergYear } from '../src/lib/iceberg.js';
import { historyText, writtenLine } from '../src/lib/labels.js';
import { actionPlan, canWriteReview, defaultReviewYear, goalCounts, goalsOf, reviewEntry, reviewYears, roadmapItems } from '../src/lib/review.js';
import { KIND, LAYER, OP, reviewId, toRow } from '../src/lib/schema.js';
import { LongtermScreen } from '../src/screens/LongtermScreen.jsx';
import { ReviewScreen } from '../src/screens/ReviewScreen.jsx';
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

describe('長期：逆算ロードマップ・アクションプラン', () => {
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

  it('アクションプラン：目標の下に手段。目標を削除すると手段も灰色（削除日は目標の日）', () => {
    const rows = [
      r({ kind: L, id: 'np1', op: OP.ADD, layer: LAYER.PLAN_GOAL, text: '作り物の目標1' }),
      r({ kind: L, id: 'np2', op: OP.ADD, layer: LAYER.PLAN_GOAL, text: '作り物の目標2' }),
      r({ kind: L, id: 'nm1', op: OP.ADD, layer: LAYER.PLAN_MEANS, parent: 'np1', text: '作り物の手段1', extra: { freq: '週2回', tactic: '作り物の打ち手' } }),
      r({ kind: L, id: 'nm2', op: OP.ADD, layer: LAYER.PLAN_MEANS, parent: 'np1', text: '作り物の手段0', extra: { after: '' } }),
      r({ kind: L, id: 'nm3', op: OP.ADD, layer: LAYER.PLAN_MEANS, parent: 'np2', text: '作り物の手段3' }),
      r({ kind: L, id: 'np1', op: OP.DELETE }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const plan = actionPlan(m);
    expect(plan.map((p) => p.goal.id)).toEqual(['np1', 'np2']);
    expect(plan[0].goal.deletedRec).toBeTruthy();
    expect(plan[0].means.map((x) => x.e.id)).toEqual(['nm2', 'nm1']);
    expect(plan[0].means.every((x) => x.deleted && x.deleted.inherited)).toBe(true);
    expect(plan[0].means[1].e.attrs).toEqual({ freq: '週2回', tactic: '作り物の打ち手' });
    expect(plan[1].means.map((x) => [x.e.id, x.deleted])).toEqual([['nm3', null]]);
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

describe('振り返りの画面', () => {
  it('③で来年の目標を足す → 翌年の分の①に出て、達成を押すともう一度で戻る', async () => {
    const log = [];
    render(
      <Harness log={log} currentYear={2026}>
        <ReviewScreen />
      </Harness>,
    );
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

describe('長期の画面', () => {
  it('ロードマップ：時期＋ありたい姿を足し、時期が前に出る', () => {
    const log = [];
    render(
      <Harness log={log}>
        <LongtermScreen part="roadmap" />
      </Harness>,
    );
    openMenu('仕事面の操作');
    choose('追加する');
    const dialog = screen.getByRole('dialog', { name: '項目を追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /時期/ }), { target: { value: '2030年' } });
    const save = within(dialog).getByRole('button', { name: '追加する' });
    expect(save.disabled).toBe(true); // ありたい姿が空
    fireEvent.change(within(dialog).getByRole('textbox', { name: /ありたい姿/ }), { target: { value: '作り物のありたい姿' } });
    fireEvent.click(save);
    expect(log.at(-1)).toMatchObject({ kind: '長期', op: '追加', layer: 'roadmapWork', year: '', parent: '', text: '作り物のありたい姿', extra: { when: '2030年' } });
    expect(screen.getByText('2030年', { selector: '.lead' })).toBeTruthy();
  });

  it('アクションプラン：目標→手段（実行すること・頻度・打ち手）。編集で頻度を空にする', async () => {
    const log = [];
    render(
      <Harness log={log}>
        <LongtermScreen part="plan" />
      </Harness>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '＋目標' }));
    let dialog = screen.getByRole('dialog', { name: '目標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '目標' }), { target: { value: '作り物のプラン目標' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    const goalId = log.at(-1).id;
    expect(log.at(-1)).toMatchObject({ layer: 'planGoal', text: '作り物のプラン目標' });

    openMenu('「作り物のプラン目標」の操作');
    choose('手段を追加');
    dialog = screen.getByRole('dialog', { name: '手段を追加' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '実行すること' }), { target: { value: '作り物の手段' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /頻度/ }), { target: { value: '週2回' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /打ち手/ }), { target: { value: '作り物の打ち手' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ layer: 'planMeans', parent: goalId, text: '作り物の手段', extra: { freq: '週2回', tactic: '作り物の打ち手' } });
    expect(screen.getByText('頻度：週2回／打ち手：作り物の打ち手')).toBeTruthy();

    openMenu('「作り物の手段」の操作');
    choose('編集する');
    dialog = screen.getByRole('dialog', { name: '手段を編集' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /頻度/ }), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ op: '修正', text: '作り物の手段', extra: { freq: '', tactic: '作り物の打ち手' } });
    expect(screen.getByText('打ち手：作り物の打ち手')).toBeTruthy();

    // 目標を削除すると、手段も灰色で残る
    openMenu('「作り物のプラン目標」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(screen.getByText('作り物の手段').closest('.item').className).toContain('del');
    openMenu('「作り物の手段」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
  });
});
