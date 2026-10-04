// @vitest-environment happy-dom
// ホーム（試験データは作り物だけ）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { setClockOffset } from '../src/lib/clock.js';
import { buildModel } from '../src/lib/fold.js';
import { historyText } from '../src/lib/labels.js';
import { KIND, LAYER, OP, toRow } from '../src/lib/schema.js';
import { reviewSteps } from '../src/lib/review.js';
import { HOME_LIMIT, HomeScreen, MAX_STEPS, principlesOf } from '../src/screens/HomeScreen.jsx';
import { ids, r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const G = KIND.GOAL;
const P = KIND.PRINCIPLE;
const I = KIND.ICEBERG;

describe('指標の組み立て', () => {
  it('年をまたいで続く。並び・削除・アイスバーグから足した履歴', () => {
    const rows = [
      r({ kind: P, id: 'np1', op: OP.ADD, text: '作り物の指標1' }),
      r({ kind: P, id: 'np2', op: OP.ADD, text: '作り物の指標2', extra: { source: 'iceberg' } }),
      r({ kind: P, id: 'np3', op: OP.ADD, text: '作り物の指標0', extra: { after: '' } }),
      r({ kind: P, id: 'np1', op: OP.DELETE }),
    ];
    const m = buildModel(rows, [], { currentYear: 2028 });
    const list = principlesOf(m);
    expect(ids(list)).toEqual(['np3', 'np1', 'np2']);
    expect(list[1].deletedRec).toBeTruthy();
    expect(historyText(m.historyOf(P, 'np2')[0], P)).toBe('アイスバーグから追加「作り物の指標2」');
    expect(historyText(m.historyOf(P, 'np1')[0], P)).toBe('追加「作り物の指標1」');
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ log, currentYear = 2026, initial = [], readOnly = false, children }) {
  const [rows, setRows] = useState(initial);
  const model = useMemo(() => buildModel(rows, [], { currentYear }), [rows, currentYear]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-28T10:00:${String((rows.length + i) % 60).padStart(2, '0')}.000+09:00`, no: `rhome${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((x) => x.concat(add));
    return add;
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly, year: currentYear }}>
      <span id="bar-actions" />
      {children}
    </AppContext.Provider>
  );
}

const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (label) => fireEvent.click(screen.getByRole('menuitem', { name: label }));

describe('ホームの画面', () => {
  it('今年の目標：今年の分だけ出す。答え合わせは札だけ（ボタンは出さない）。ここからも足せる', () => {
    const log = [];
    const initial = [
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の今年の目標' }),
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ACHIEVE }),
      r({ year: 2026, kind: G, id: 'ng2', op: OP.ADD, text: '作り物のまだの目標' }),
      r({ year: 2025, kind: G, id: 'ng3', op: OP.ADD, text: '作り物の去年の目標' }),
      r({ year: 2027, kind: G, id: 'ng4', op: OP.ADD, text: '作り物の来年の目標' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <HomeScreen />
      </Harness>,
    );
    expect(screen.getByText('作り物の今年の目標')).toBeTruthy();
    expect(screen.getByText('作り物のまだの目標')).toBeTruthy();
    expect(screen.queryByText('作り物の去年の目標')).toBeNull();
    expect(screen.queryByText('作り物の来年の目標')).toBeNull();
    expect(screen.getByText('達成', { selector: '.judge-tag' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /答え合わせ/ })).toBeNull();

    openMenu('今年の目標の操作');
    choose('目標を追加');
    const dialog = screen.getByRole('dialog', { name: '目標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の足した目標' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '目標', op: '追加', year: 2026, text: '作り物の足した目標' });
    expect(screen.getByText('作り物の足した目標')).toBeTruthy();
  });

  it('今の四半期の目標：今の四半期の分だけ札つきで出す。年の目標には混ざらない。ここからも足せる', () => {
    setClockOffset(Date.parse('2026-11-10T12:00:00+09:00') - Date.now());
    try {
      const log = [];
      const initial = [
        r({ year: 2026, kind: G, id: 'ny1', op: OP.ADD, text: '作り物の今年の目標' }),
        r({ year: 2026, kind: G, id: 'nq1', op: OP.ADD, layer: 'q4', text: '作り物の4Qの目標' }),
        r({ year: 2026, kind: G, id: 'nq1', op: OP.MISS, layer: 'q4' }),
        r({ year: 2026, kind: G, id: 'nq2', op: OP.ADD, layer: 'q3', text: '作り物の3Qの目標' }),
        r({ year: 2025, kind: G, id: 'nq3', op: OP.ADD, layer: 'q4', text: '作り物の去年の4Qの目標' }),
      ];
      render(
        <Harness log={log} initial={initial}>
          <HomeScreen />
        </Harness>,
      );
      const sections = [...document.querySelectorAll('.home-screen section')];
      expect(sections[1].textContent).toContain('作り物の今年の目標');
      expect(sections[1].textContent).not.toContain('作り物の4Qの目標');
      expect(sections[2].querySelector('.sec').textContent).toBe('4Qの目標（10〜12月）…');
      expect([...sections[2].querySelectorAll('.item .tx')].map((x) => x.textContent)).toEqual(['作り物の4Qの目標']);
      expect(within(sections[2]).getByText('未達', { selector: '.judge-tag' })).toBeTruthy();
      expect(screen.queryByText('作り物の3Qの目標')).toBeNull();
      expect(screen.queryByText('作り物の去年の4Qの目標')).toBeNull();

      openMenu('4Qの目標（10〜12月）の操作');
      choose('目標を追加');
      const dialog = screen.getByRole('dialog', { name: '目標を追加' });
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の足した4Qの目標' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
      expect(log.at(-1)).toMatchObject({ kind: '目標', op: '追加', year: 2026, layer: 'q4', text: '作り物の足した4Qの目標' });
    } finally {
      setClockOffset(0);
    }
  });

  it('年が変わった直後（年を確かめ直す前）は、前の年の4Q のまま', () => {
    setClockOffset(Date.parse('2027-01-01T00:00:30+09:00') - Date.now());
    try {
      render(
        <Harness log={[]} currentYear={2026}>
          <HomeScreen />
        </Harness>,
      );
      expect(screen.getByText('4Qの目標（10〜12月）')).toBeTruthy();
      expect(screen.getByText('まだありません。振り返りの「四半期」で決めます')).toBeTruthy();
    } finally {
      setClockOffset(0);
    }
  });

  it('開いたまま四半期をまたぐと、App が知らせる今の四半期で描き直す', () => {
    const model = buildModel([r({ year: 2026, kind: G, id: 'nq1', op: OP.ADD, layer: 'q4', text: '作り物の4Qの目標' })], [], { currentYear: 2026 });
    const ctx = (quarter) => ({ model, write: () => null, readOnly: false, year: 2026, quarter });
    const { rerender } = render(
      <AppContext.Provider value={ctx({ year: 2026, q: 3 })}>
        <HomeScreen />
      </AppContext.Provider>,
    );
    expect(screen.getByText('3Qの目標（7〜9月）')).toBeTruthy();
    expect(screen.queryByText('作り物の4Qの目標')).toBeNull();
    rerender(
      <AppContext.Provider value={ctx({ year: 2026, q: 4 })}>
        <HomeScreen />
      </AppContext.Provider>,
    );
    expect(screen.getByText('4Qの目標（10〜12月）')).toBeTruthy();
    expect(screen.getByText('作り物の4Qの目標')).toBeTruthy();
  });

  it('目標・指標がない時の案内。指標の説明は、まだ無い時だけ出す', () => {
    const { unmount } = render(
      <Harness log={[]}>
        <HomeScreen />
      </Harness>,
    );
    expect(screen.getByText('まだありません。年末年始に振り返りの③で決めます')).toBeTruthy();
    expect(document.querySelector('.principles .note').textContent).toMatch(/^まだありません。見たい言葉だけを/);
    unmount();
    render(
      <Harness log={[]} initial={[r({ kind: P, id: 'np1', op: OP.ADD, text: '作り物の指標' })]}>
        <HomeScreen />
      </Harness>,
    );
    expect(document.querySelector('.principles .note')).toBeNull();
  });

  it(`スマホで各欄に出すのは${HOME_LIMIT}件まで。超えた分は .over（CSS で隠す）、見出しの「ほか○件」で開く・閉じる`, () => {
    const initial = [];
    for (let i = 1; i <= 5; i++) initial.push(r({ year: 2026, kind: G, id: `ng${i}`, op: OP.ADD, text: `作り物の目標${i}` }));
    for (let i = 1; i <= 3; i++) initial.push(r({ kind: P, id: `np${i}`, op: OP.ADD, text: `作り物の指標${i}` }));
    render(
      <Harness log={[]} initial={initial}>
        <HomeScreen />
      </Harness>,
    );
    const [pr, goals] = document.querySelectorAll('.home-screen section');
    // ちょうど3件の欄は絞らない
    expect(pr.classList.contains('capped')).toBe(false);
    expect(pr.querySelector('.cap-more')).toBeNull();
    expect(pr.querySelectorAll('.item.over')).toHaveLength(0);

    expect(goals.classList.contains('capped')).toBe(true);
    expect([...goals.querySelectorAll('.item.over .tx')].map((x) => x.textContent)).toEqual(['作り物の目標4', '作り物の目標5']);
    const more = within(goals).getByRole('button', { name: 'ほか2件' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(goals.classList.contains('open')).toBe(true);
    fireEvent.click(within(goals).getByRole('button', { name: '閉じる' }));
    expect(goals.classList.contains('open')).toBe(false);
    expect(within(goals).getByRole('button', { name: 'ほか2件' })).toBeTruthy();
  });

  it('指標：手で打って足す・この下に足す・編集・削除（灰色）', () => {
    const log = [];
    render(
      <Harness log={log}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指標の操作');
    choose('手で打って追加');
    let dialog = screen.getByRole('dialog', { name: '指標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の指標A' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: '指標', op: '追加', year: '', text: '作り物の指標A' });
    expect(log.at(-1).extra).toBeUndefined();
    const idA = log.at(-1).id;

    openMenu('指標の操作');
    choose('手で打って追加');
    dialog = screen.getByRole('dialog', { name: '指標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の指標C' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));

    openMenu('「作り物の指標A」の操作');
    choose('この下に追加');
    dialog = screen.getByRole('dialog', { name: '指標を追加' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の指標B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ text: '作り物の指標B', extra: { after: idA } });
    const texts = () => [...document.querySelectorAll('.home-screen section.principles .item .tx')].map((x) => x.textContent);
    expect(texts()).toEqual(['作り物の指標A', '作り物の指標B', '作り物の指標C']);

    openMenu('「作り物の指標B」の操作');
    choose('編集する');
    dialog = screen.getByRole('dialog', { name: '指標を編集' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '作り物の指標B・改' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ kind: '指標', op: '修正', year: '', text: '作り物の指標B・改' });

    openMenu('「作り物の指標C」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(log.at(-1)).toMatchObject({ kind: '指標', op: '削除' });
    expect(screen.getByText('作り物の指標C').closest('.item').className).toContain('del');
    openMenu('「作り物の指標C」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
  });

  it('指標：アイスバーグの「意識・想い・人生哲学」からまとめて選ぶ。入れ済み・削除した言葉・ほかの層は選べない', () => {
    const log = [];
    const initial = [
      r({ year: 2026, kind: I, id: 'ni1', op: OP.ADD, layer: LAYER.MIND, text: '作り物の考え1', value: '2' }),
      r({ year: 2026, kind: I, id: 'ni2', op: OP.ADD, layer: LAYER.MIND, text: '作り物の考え2', value: '1' }),
      r({ year: 2026, kind: I, id: 'ni3', op: OP.ADD, layer: LAYER.MIND, text: '作り物の考え3', value: '3' }),
      r({ year: 2026, kind: I, id: 'ni4', op: OP.ADD, layer: LAYER.MIND, text: '作り物の消した考え', value: '1' }),
      r({ year: 2026, kind: I, id: 'ni4', op: OP.DELETE }),
      r({ year: 2026, kind: I, id: 'ni5', op: OP.ADD, layer: LAYER.SKILL, text: '作り物のスキル', value: '1' }),
      r({ kind: P, id: 'np1', op: OP.ADD, text: '作り物の考え2' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指標の操作');
    choose('アイスバーグから選ぶ');
    const dialog = screen.getByRole('dialog', { name: 'アイスバーグから選ぶ' });
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label').querySelector('.tx').textContent)).toEqual(['作り物の考え1', '作り物の考え2', '作り物の考え3']);
    expect(boxes[1].disabled).toBe(true);
    expect(within(dialog).getByText('入れ済み')).toBeTruthy();

    const save = within(dialog).getByRole('button', { name: '追加する' });
    expect(save.disabled).toBe(true);
    // 選んだ順ではなく、アイスバーグの順で足す
    fireEvent.click(boxes[2]);
    fireEvent.click(boxes[0]);
    fireEvent.click(within(dialog).getByRole('button', { name: '2つ追加する' }));
    expect(log.slice(-2)).toMatchObject([
      { kind: '指標', op: '追加', year: '', text: '作り物の考え1', extra: { source: 'iceberg' } },
      { kind: '指標', op: '追加', year: '', text: '作り物の考え3', extra: { source: 'iceberg' } },
    ]);
    expect(log.at(-1).extra.after).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    const texts = [...document.querySelectorAll('.home-screen section.principles .item .tx')].map((x) => x.textContent);
    expect(texts).toEqual(['作り物の考え2', '作り物の考え1', '作り物の考え3']);

    // もう一度開くと、足した言葉も入れ済み
    openMenu('指標の操作');
    choose('アイスバーグから選ぶ');
    expect(within(screen.getByRole('dialog')).getAllByText('入れ済み')).toHaveLength(3);
  });

  it('アイスバーグに言葉がない時の案内', () => {
    render(
      <Harness log={[]}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指標の操作');
    choose('アイスバーグから選ぶ');
    expect(screen.getByText('この年のアイスバーグに「意識・想い・人生哲学」の言葉がありません')).toBeTruthy();
  });

  it('見るだけの時は「…」に履歴だけ・追加を出さない', () => {
    const initial = [
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の目標' }),
      r({ kind: P, id: 'np1', op: OP.ADD, text: '作り物の指標' }),
    ];
    render(
      <Harness log={[]} initial={initial} readOnly>
        <HomeScreen />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: '今年の目標の操作' })).toBeNull();
    expect(screen.queryByRole('button', { name: '指標の操作' })).toBeNull();
    openMenu('「作り物の指標」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
  });
});

// ---------------------------------------------------------------- 上部の道のり
const RV = KIND.REVIEW;
const rv = (year, layer, text) => r({ year, kind: RV, id: `rv-${year}-${layer}`, op: OP.EDIT, layer, text });

describe('ホームの道のり', () => {
  it('書いた振り返りを古い順に1期1点。同じ年は 1Q→4Q→年の振り返り。空にした・ほかの振り返り（④）は数えない', () => {
    const rows = [
      rv(2026, 'q3', '作り物の3Q'),
      rv(2025, 'review', '作り物の年の振り返り'),
      rv(2026, 'q1', '作り物の1Q'),
      rv(2026, 'q1', '作り物の1Q（直した）'),
      rv(2025, 'q4', '作り物の4Q'),
      rv(2026, 'q2', '作り物の2Q'),
      rv(2026, 'q2', '  '),
      rv(2025, 'resolution', '作り物の抱負'),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(reviewSteps(m).map((x) => x.label)).toEqual(['25年4Qの振り返り', '25年の振り返り', '26年1Qの振り返り', '26年3Qの振り返り']);
  });

  it('点の数と、いちばん新しい一歩（金）。図は読み上げない', () => {
    render(
      <Harness log={[]} initial={[rv(2026, 'q1', '作り物の1Q'), rv(2026, 'q2', '作り物の2Q'), rv(2026, 'q3', '作り物の3Q')]}>
        <HomeScreen />
      </Harness>,
    );
    const hero = document.querySelector('.home-hero');
    expect(hero.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(hero.querySelectorAll('circle.step')).toHaveLength(3);
    expect(hero.querySelectorAll('circle.step.new')).toHaveLength(1);
    expect(hero.querySelector('circle.step.new')).toBe(hero.querySelectorAll('circle.step')[2]);
    expect(hero.querySelector('.hero-cap').textContent).toBe('道のりいちばん新しい一歩：26年3Qの振り返り');
  });

  it(`点は最大${MAX_STEPS}。古いものから出さない。まだない時の案内`, () => {
    const rows = [];
    for (let y = 2022; y <= 2025; y++) for (const l of ['q1', 'q2', 'q3', 'q4', 'review']) rows.push(rv(y, l, `作り物${y}${l}`));
    const { unmount } = render(
      <Harness log={[]} initial={rows}>
        <HomeScreen />
      </Harness>,
    );
    expect(document.querySelectorAll('.home-hero circle.step')).toHaveLength(MAX_STEPS);
    expect(document.querySelector('.hero-cap b').textContent).toBe('いちばん新しい一歩：25年の振り返り');
    unmount();
    render(
      <Harness log={[]}>
        <HomeScreen />
      </Harness>,
    );
    expect(document.querySelectorAll('.home-hero circle.step')).toHaveLength(0);
    expect(document.querySelector('.hero-cap').textContent).toBe('道のり最初の一歩は振り返りで書きます');
  });

  it('指標と目標2つは3列の枠に並ぶ（指標が先。.principles）', () => {
    render(
      <Harness log={[]}>
        <HomeScreen />
      </Harness>,
    );
    const cols = document.querySelector('.home-cols');
    expect([...cols.children].map((x) => x.querySelector('.sec span').textContent)).toEqual(['指標', '今年の目標', '4Qの目標（10〜12月）']);
    expect(cols.firstElementChild.classList.contains('principles')).toBe(true);
  });
});
