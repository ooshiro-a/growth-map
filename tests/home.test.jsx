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
import { GUIDE_LIMIT, HOME_LIMIT, HomeScreen, MAX_STEPS, flatList } from '../src/screens/HomeScreen.jsx';
import { ids, r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const G = KIND.GOAL;
const M = KIND.MIDTERM; // 中期目標（記録の種類は「指標」のまま）
const GD = KIND.GUIDE; // 指針
const I = KIND.ICEBERG;

describe('指針・中期目標の組み立て', () => {
  it('シートの種類：中期目標は「指標」のまま、指針は「指針」', () => {
    expect(M).toBe('指標');
    expect(GD).toBe('指針');
  });

  it('年をまたいで続く。並び・削除・アイスバーグから足した履歴。指針と中期目標は混ざらない', () => {
    const rows = [
      r({ kind: M, id: 'nm1', op: OP.ADD, text: '作り物の中期目標1' }),
      r({ kind: M, id: 'nm2', op: OP.ADD, text: '作り物の中期目標2', extra: { source: 'iceberg' } }),
      r({ kind: M, id: 'nm3', op: OP.ADD, text: '作り物の中期目標0', extra: { after: '' } }),
      r({ kind: M, id: 'nm1', op: OP.DELETE }),
      r({ kind: GD, id: 'ns1', op: OP.ADD, text: '作り物の指針1', extra: { source: 'iceberg' } }),
      r({ kind: GD, id: 'ns2', op: OP.ADD, text: '作り物の指針0', extra: { after: '' } }),
    ];
    const m = buildModel(rows, [], { currentYear: 2028 });
    const list = flatList(m, M);
    expect(ids(list)).toEqual(['nm3', 'nm1', 'nm2']);
    expect(list[1].deletedRec).toBeTruthy();
    expect(historyText(m.historyOf(M, 'nm2')[0], M)).toBe('アイスバーグから追加「作り物の中期目標2」');
    expect(historyText(m.historyOf(M, 'nm1')[0], M)).toBe('追加「作り物の中期目標1」');
    expect(ids(flatList(m, GD))).toEqual(['ns2', 'ns1']);
    expect(historyText(m.historyOf(GD, 'ns1')[0], GD)).toBe('アイスバーグから追加「作り物の指針1」');
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
const menuTexts = () => screen.getAllByRole('menuitem').map((b) => b.textContent);
const typeAndSave = (dialogName, value, button) => {
  const dialog = screen.getByRole('dialog', { name: dialogName });
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
};

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
    typeAndSave('目標を追加', '作り物の足した目標', '追加する');
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
      // 上から 指針・中期目標・今年の目標・今の四半期の目標
      const sections = [...document.querySelectorAll('.home-screen section')];
      expect(sections[2].textContent).toContain('作り物の今年の目標');
      expect(sections[2].textContent).not.toContain('作り物の4Qの目標');
      expect(sections[3].querySelector('.sec').textContent).toBe('4Qの目標（10〜12月）…');
      expect([...sections[3].querySelectorAll('.item .tx')].map((x) => x.textContent)).toEqual(['作り物の4Qの目標']);
      expect(within(sections[3]).getByText('未達', { selector: '.judge-tag' })).toBeTruthy();
      expect(screen.queryByText('作り物の3Qの目標')).toBeNull();
      expect(screen.queryByText('作り物の去年の4Qの目標')).toBeNull();

      openMenu('4Qの目標（10〜12月）の操作');
      choose('目標を追加');
      typeAndSave('目標を追加', '作り物の足した4Qの目標', '追加する');
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

  it('目標・指針・中期目標がない時の案内。指針・中期目標の説明は、まだ無い時だけ出す', () => {
    const { unmount } = render(
      <Harness log={[]}>
        <HomeScreen />
      </Harness>,
    );
    expect(screen.getByText('まだありません。年末年始に振り返りの③で決めます')).toBeTruthy();
    expect(document.querySelector('.guides .note').textContent).toMatch(/^まだありません。人生で指針にしている言葉・考え方を/);
    expect(document.querySelector('.midterms .note').textContent).toMatch(/^まだありません。数年かけて追いかける目標を/);
    unmount();
    render(
      <Harness log={[]} initial={[r({ kind: GD, id: 'ns1', op: OP.ADD, text: '作り物の指針' }), r({ kind: M, id: 'nm1', op: OP.ADD, text: '作り物の中期目標' })]}>
        <HomeScreen />
      </Harness>,
    );
    expect(document.querySelector('.guides .note')).toBeNull();
    expect(document.querySelector('.midterms .note')).toBeNull();
  });

  it(`スマホで出すのは指針${GUIDE_LIMIT}件・ほかの欄${HOME_LIMIT}件まで。超えた分は .over（CSS で隠す）、見出しの「ほか○件」で開く・閉じる`, () => {
    setClockOffset(Date.parse('2026-11-10T12:00:00+09:00') - Date.now());
    try {
      const initial = [];
      for (let i = 1; i <= 4; i++) initial.push(r({ kind: GD, id: `ns${i}`, op: OP.ADD, text: `作り物の指針${i}` }));
      for (let i = 1; i <= 2; i++) initial.push(r({ kind: M, id: `nm${i}`, op: OP.ADD, text: `作り物の中期目標${i}` }));
      for (let i = 1; i <= 5; i++) initial.push(r({ year: 2026, kind: G, id: `ng${i}`, op: OP.ADD, text: `作り物の目標${i}` }));
      for (let i = 1; i <= 3; i++) initial.push(r({ year: 2026, kind: G, id: `nq${i}`, op: OP.ADD, layer: 'q4', text: `作り物の4Qの目標${i}` }));
      render(
        <Harness log={[]} initial={initial}>
          <HomeScreen />
        </Harness>,
      );
      const [guides, mids, goals, quarter] = document.querySelectorAll('.home-screen section');
      const over = (s) => [...s.querySelectorAll('.item.over .tx')].map((x) => x.textContent);
      // 指針は3件まで
      expect(guides.classList.contains('capped')).toBe(true);
      expect(over(guides)).toEqual(['作り物の指針4']);
      expect(within(guides).getByRole('button', { name: 'ほか1件' })).toBeTruthy();
      // ちょうど2件の欄は絞らない
      expect(mids.classList.contains('capped')).toBe(false);
      expect(mids.querySelector('.cap-more')).toBeNull();
      expect(mids.querySelectorAll('.item.over')).toHaveLength(0);
      // 今年の目標・四半期の目標は2件まで
      expect(over(quarter)).toEqual(['作り物の4Qの目標3']);
      expect(goals.classList.contains('capped')).toBe(true);
      expect(over(goals)).toEqual(['作り物の目標3', '作り物の目標4', '作り物の目標5']);
      const more = within(goals).getByRole('button', { name: 'ほか3件' });
      expect(more.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(more);
      expect(goals.classList.contains('open')).toBe(true);
      fireEvent.click(within(goals).getByRole('button', { name: '閉じる' }));
      expect(goals.classList.contains('open')).toBe(false);
      expect(within(goals).getByRole('button', { name: 'ほか3件' })).toBeTruthy();
    } finally {
      setClockOffset(0);
    }
  });

  it('指針：手で打って足す・この下に足す・編集・並べ替え・履歴・削除（灰色）・完全に削除', () => {
    const log = [];
    render(
      <Harness log={log}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指針の操作');
    expect(menuTexts()).toEqual(['手で打って追加', 'アイスバーグから選ぶ']);
    choose('手で打って追加');
    typeAndSave('指針を追加', '作り物の指針A', '追加する');
    expect(log.at(-1)).toMatchObject({ kind: '指針', op: '追加', year: '', text: '作り物の指針A' });
    expect(log.at(-1).extra).toBeUndefined();
    const idA = log.at(-1).id;

    openMenu('「作り物の指針A」の操作');
    choose('この下に追加');
    typeAndSave('指針を追加', '作り物の指針B', '追加する');
    expect(log.at(-1)).toMatchObject({ kind: '指針', text: '作り物の指針B', extra: { after: idA } });
    const texts = () => [...document.querySelectorAll('.home-screen section.guides .item .tx')].map((x) => x.textContent);
    expect(texts()).toEqual(['作り物の指針A', '作り物の指針B']);
    // 中期目標には出ない
    expect(document.querySelector('.home-screen section.midterms .item')).toBeNull();

    openMenu('「作り物の指針A」の操作');
    expect(menuTexts()).toEqual(['編集する', 'この下に追加', '並べ替える', '削除する（灰色で残る）', '履歴を見る', '完全に削除する']);
    choose('編集する');
    typeAndSave('指針を編集', '作り物の指針A・改', '保存する');
    expect(log.at(-1)).toMatchObject({ kind: '指針', op: '修正', year: '', text: '作り物の指針A・改' });

    // 見出しの「…」から並べ替える：Bを上へ
    openMenu('指針の操作');
    expect(menuTexts()).toEqual(['手で打って追加', 'アイスバーグから選ぶ', '並べ替える']);
    choose('並べ替える');
    const sort = screen.getByRole('region', { name: '指針の並べ替え' });
    expect(sort.classList.contains('guides')).toBe(true);
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の指針B」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toMatchObject({ year: '', kind: '指針', op: '並べ替え' });
    expect(texts()).toEqual(['作り物の指針B', '作り物の指針A・改']);

    openMenu('「作り物の指針A・改」の操作');
    choose('履歴を見る');
    const hist = screen.getByRole('dialog', { name: '履歴：作り物の指針A・改' });
    expect([...hist.querySelectorAll('.hist-t')].map((x) => x.textContent)).toEqual(['追加「作り物の指針A」', '修正「作り物の指針A・改」', '移動']);
    fireEvent.click(within(hist).getByRole('button', { name: '閉じる' }));

    openMenu('「作り物の指針B」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(log.at(-1)).toMatchObject({ kind: '指針', op: '削除' });
    expect(screen.getByText('作り物の指針B').closest('.item').className).toContain('del');
    openMenu('「作り物の指針B」の操作');
    expect(menuTexts()).toEqual(['履歴を見る', '完全に削除する']);
    choose('完全に削除する');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '完全に削除する' }));
    expect(log.at(-1)).toMatchObject({ year: '', kind: '指針', op: '打ち消し' });
    expect(screen.queryByText('作り物の指針B')).toBeNull();
    expect(texts()).toEqual(['作り物の指針A・改']);
  });

  it('中期目標：追加する・この下に足す・編集・削除（灰色）・完全に削除。記録の種類は「指標」のまま。アイスバーグからは選ばない', () => {
    const log = [];
    render(
      <Harness log={log}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('中期目標の操作');
    expect(menuTexts()).toEqual(['追加する']);
    choose('追加する');
    typeAndSave('中期目標を追加', '作り物の中期目標A', '追加する');
    expect(log.at(-1)).toMatchObject({ kind: '指標', op: '追加', year: '', text: '作り物の中期目標A' });
    expect(log.at(-1).extra).toBeUndefined();
    const idA = log.at(-1).id;

    openMenu('中期目標の操作');
    choose('追加する');
    typeAndSave('中期目標を追加', '作り物の中期目標C', '追加する');

    openMenu('「作り物の中期目標A」の操作');
    choose('この下に追加');
    typeAndSave('中期目標を追加', '作り物の中期目標B', '追加する');
    expect(log.at(-1)).toMatchObject({ kind: '指標', text: '作り物の中期目標B', extra: { after: idA } });
    const texts = () => [...document.querySelectorAll('.home-screen section.midterms .item .tx')].map((x) => x.textContent);
    expect(texts()).toEqual(['作り物の中期目標A', '作り物の中期目標B', '作り物の中期目標C']);
    // 指針には出ない
    expect(document.querySelector('.home-screen section.guides .item')).toBeNull();

    openMenu('「作り物の中期目標B」の操作');
    expect(menuTexts()).toEqual(['編集する', 'この下に追加', '並べ替える', '削除する（灰色で残る）', '履歴を見る', '完全に削除する']);
    choose('編集する');
    typeAndSave('中期目標を編集', '作り物の中期目標B・改', '保存する');
    expect(log.at(-1)).toMatchObject({ kind: '指標', op: '修正', year: '', text: '作り物の中期目標B・改' });

    openMenu('「作り物の中期目標C」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(log.at(-1)).toMatchObject({ kind: '指標', op: '削除' });
    expect(screen.getByText('作り物の中期目標C').closest('.item').className).toContain('del');
    openMenu('「作り物の中期目標C」の操作');
    expect(menuTexts()).toEqual(['履歴を見る', '完全に削除する']);
    choose('完全に削除する');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '完全に削除する' }));
    expect(log.at(-1)).toMatchObject({ year: '', kind: '指標', op: '打ち消し' });
    expect(texts()).toEqual(['作り物の中期目標A', '作り物の中期目標B・改']);

    openMenu('中期目標の操作');
    expect(menuTexts()).toEqual(['追加する', '並べ替える']);
  });

  it('指針：アイスバーグの「意識・想い・人生哲学」からまとめて選ぶ。入れ済み・削除した言葉・ほかの層は選べない', () => {
    const log = [];
    const initial = [
      r({ year: 2026, kind: I, id: 'ni1', op: OP.ADD, layer: LAYER.MIND, text: '作り物の考え1', value: '2' }),
      r({ year: 2026, kind: I, id: 'ni2', op: OP.ADD, layer: LAYER.MIND, text: '作り物の考え2', value: '1' }),
      r({ year: 2026, kind: I, id: 'ni3', op: OP.ADD, layer: LAYER.MIND, text: '作り物の考え3', value: '3' }),
      r({ year: 2026, kind: I, id: 'ni4', op: OP.ADD, layer: LAYER.MIND, text: '作り物の消した考え', value: '1' }),
      r({ year: 2026, kind: I, id: 'ni4', op: OP.DELETE }),
      r({ year: 2026, kind: I, id: 'ni5', op: OP.ADD, layer: LAYER.SKILL, text: '作り物のスキル', value: '1' }),
      r({ kind: GD, id: 'ns1', op: OP.ADD, text: '作り物の考え2' }),
      // 中期目標に同じ言葉があっても、指針には入れられる
      r({ kind: M, id: 'nm1', op: OP.ADD, text: '作り物の考え3' }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指針の操作');
    choose('アイスバーグから選ぶ');
    const dialog = screen.getByRole('dialog', { name: 'アイスバーグから選ぶ' });
    expect(within(dialog).getByText(/後でアイスバーグ側を直しても指針は変わりません/)).toBeTruthy();
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label').querySelector('.tx').textContent)).toEqual(['作り物の考え1', '作り物の考え2', '作り物の考え3']);
    expect(boxes.map((b) => b.disabled)).toEqual([false, true, false]);
    expect(within(dialog).getAllByText('入れ済み')).toHaveLength(1);

    const save = within(dialog).getByRole('button', { name: '追加する' });
    expect(save.disabled).toBe(true);
    // 選んだ順ではなく、アイスバーグの順で足す
    fireEvent.click(boxes[2]);
    fireEvent.click(boxes[0]);
    fireEvent.click(within(dialog).getByRole('button', { name: '2つ追加する' }));
    expect(log.slice(-2)).toMatchObject([
      { kind: '指針', op: '追加', year: '', text: '作り物の考え1', extra: { source: 'iceberg' } },
      { kind: '指針', op: '追加', year: '', text: '作り物の考え3', extra: { source: 'iceberg' } },
    ]);
    expect(log.at(-1).extra.after).toBeUndefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    const texts = [...document.querySelectorAll('.home-screen section.guides .item .tx')].map((x) => x.textContent);
    expect(texts).toEqual(['作り物の考え2', '作り物の考え1', '作り物の考え3']);

    // もう一度開くと、足した言葉も入れ済み
    openMenu('指針の操作');
    choose('アイスバーグから選ぶ');
    expect(within(screen.getByRole('dialog')).getAllByText('入れ済み')).toHaveLength(3);
  });

  it('アイスバーグに言葉がない時の案内', () => {
    render(
      <Harness log={[]}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指針の操作');
    choose('アイスバーグから選ぶ');
    expect(screen.getByText('この年のアイスバーグに「意識・想い・人生哲学」の言葉がありません')).toBeTruthy();
  });

  it('見るだけの時は「…」に履歴だけ・追加を出さない', () => {
    const initial = [
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の目標' }),
      r({ kind: GD, id: 'ns1', op: OP.ADD, text: '作り物の指針' }),
      r({ kind: M, id: 'nm1', op: OP.ADD, text: '作り物の中期目標' }),
    ];
    render(
      <Harness log={[]} initial={initial} readOnly>
        <HomeScreen />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: '今年の目標の操作' })).toBeNull();
    expect(screen.queryByRole('button', { name: '指針の操作' })).toBeNull();
    expect(screen.queryByRole('button', { name: '中期目標の操作' })).toBeNull();
    openMenu('「作り物の指針」の操作');
    expect(menuTexts()).toEqual(['履歴を見る']);
    openMenu('「作り物の指針」の操作');
    openMenu('「作り物の中期目標」の操作');
    expect(menuTexts()).toEqual(['履歴を見る']);
  });

  it('並べ替え：中期目標と今年の目標。↑↓ で動かし、保存で動いた分だけ記録（目標は年と層つき）。ほかの年の目標は出ない', () => {
    const log = [];
    const initial = [
      r({ kind: M, id: 'nm1', op: OP.ADD, text: '作り物の中期目標1' }),
      r({ kind: M, id: 'nm2', op: OP.ADD, text: '作り物の中期目標2' }),
      r({ year: 2025, kind: G, id: 'ng0', op: OP.ADD, text: '作り物の去年の目標' }),
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の目標1' }),
      r({ year: 2026, kind: G, id: 'ng2', op: OP.ADD, text: '作り物の目標2' }),
      r({ year: 2026, kind: G, id: 'ng3', op: OP.ADD, text: '作り物の目標3' }),
      r({ year: 2026, kind: G, id: 'ng4', op: OP.ADD, text: '作り物の目標4' }),
      r({ year: 2026, kind: G, id: 'ng4', op: OP.DELETE }),
    ];
    render(
      <Harness log={log} initial={initial}>
        <HomeScreen />
      </Harness>,
    );
    const goalTexts = () => [...screen.getByRole('button', { name: '今年の目標の操作' }).closest('section').querySelectorAll('.item .tx')].map((x) => x.textContent);

    // 中期目標：「…」→「並べ替える」→ 2を上へ → 保存
    openMenu('「作り物の中期目標2」の操作');
    choose('並べ替える');
    let sort = screen.getByRole('region', { name: '中期目標の並べ替え' });
    expect(sort.classList.contains('midterms')).toBe(true);
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の中期目標2」を上へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '保存する' }));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ year: '', kind: '指標', op: '並べ替え' });
    expect(flatList(buildModel(initial.concat(log.map((d, i) => toRow({ ...d, at: '2026-09-28T11:00:00.000+09:00', no: `rsort${i}xxxx` }))), [], { currentYear: 2026 }), M).map((e) => e.id)).toEqual(['nm2', 'nm1']);

    // 今年の目標：並べ替えの間は件数の制限を外し、灰色と去年の目標は出さない
    openMenu('今年の目標の操作');
    choose('並べ替える');
    sort = screen.getByRole('region', { name: '今年の目標の並べ替え' });
    expect([...sort.querySelectorAll('.tx')].map((x) => x.textContent)).toEqual(['作り物の目標1', '作り物の目標2', '作り物の目標3']);
    expect(within(sort).getByText('灰色（削除した項目）は元の場所のまま動きません')).toBeTruthy();
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の目標1」を下へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '「作り物の目標1」を下へ' }));
    fireEvent.click(within(sort).getByRole('button', { name: '保存する' }));
    expect(log.at(-1)).toEqual({ year: 2026, kind: '目標', layer: '', id: 'ng1', op: '並べ替え', extra: { after: 'ng3' } });
    expect(goalTexts()).toEqual(['作り物の目標2', '作り物の目標3', '作り物の目標1', '作り物の目標4']);
  });

  it('並べ替え：1つしかない欄・見るだけの時は出さない', () => {
    const initial = [
      r({ kind: GD, id: 'ns1', op: OP.ADD, text: '作り物の指針' }),
      r({ kind: M, id: 'nm1', op: OP.ADD, text: '作り物の中期目標' }),
      r({ year: 2026, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の目標1' }),
      r({ year: 2026, kind: G, id: 'ng2', op: OP.ADD, text: '作り物の目標2' }),
    ];
    render(
      <Harness log={[]} initial={initial}>
        <HomeScreen />
      </Harness>,
    );
    openMenu('指針の操作');
    expect(screen.queryByRole('menuitem', { name: '並べ替える' })).toBeNull();
    openMenu('指針の操作');
    openMenu('中期目標の操作');
    expect(screen.queryByRole('menuitem', { name: '並べ替える' })).toBeNull();
    openMenu('中期目標の操作');
    openMenu('今年の目標の操作');
    expect(screen.getByRole('menuitem', { name: '並べ替える' })).toBeTruthy();
    cleanup();
    render(
      <Harness log={[]} initial={initial} readOnly>
        <HomeScreen />
      </Harness>,
    );
    openMenu('「作り物の目標1」の操作');
    expect(screen.queryByRole('menuitem', { name: '並べ替える' })).toBeNull();
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

  it('階層の順に並ぶ：指針（.guides。PC は横幅いっぱい）→ 中期目標（.midterms）・今年の目標・今の四半期の目標（PC は3列）', () => {
    setClockOffset(Date.parse('2026-11-10T12:00:00+09:00') - Date.now());
    try {
      render(
        <Harness log={[]}>
          <HomeScreen />
        </Harness>,
      );
      const cols = document.querySelector('.home-cols');
      expect([...cols.children].map((x) => x.querySelector('.sec span').textContent)).toEqual(['指針', '中期目標', '今年の目標', '4Qの目標（10〜12月）']);
      expect(cols.children[0].classList.contains('guides')).toBe(true);
      expect(cols.children[1].classList.contains('midterms')).toBe(true);
    } finally {
      setClockOffset(0);
    }
  });
});
