// @vitest-environment happy-dom
// ブレーキ（試験データは作り物だけ）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { brakeYear, sortText } from '../src/lib/brake.js';
import { buildModel } from '../src/lib/fold.js';
import { dateLine, historyText } from '../src/lib/labels.js';
import { KIND, LAYER, OP, toRow } from '../src/lib/schema.js';
import { BrakeScreen } from '../src/screens/BrakeScreen.jsx';
import { ids, r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const B = KIND.BRAKE;
const W = LAYER.WORRY;
const CH = LAYER.CHILD;
const add = (year, id, layer, text, extra) => r({ year, kind: B, id, op: OP.ADD, layer, text, value: 'facing', ...(extra ? { extra } : {}) });
const status = (year, id, value, at) => r({ year, kind: B, id, op: OP.STATUS, value, ...(at ? { at } : {}) });

describe('ブレーキの組み立て', () => {
  it('欄ごとの項目と外せた数。外せたものは翌年に引き継がず、その年には残る', () => {
    const rows = [
      add(2025, 'nb1', W, '作り物の悩み1', { place: 'road', control: 'can' }),
      add(2025, 'nb2', W, '作り物の悩み2', { place: 'fork' }),
      add(2025, 'nb3', CH, '作り物の子ども1'),
      status(2025, 'nb2', 'released', '2025-06-05T10:00:00.000+09:00'),
      add(2025, 'nb4', CH, '作り物の子ども2'),
      r({ year: 2025, kind: B, id: 'nb4', op: OP.DELETE }),
      add(2026, 'nb5', CH, '作り物の子ども3'),
      status(2026, 'nb5', 'released'),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const y25 = brakeYear(m, 2025);
    expect(y25.groups.map((g) => g.name)).toEqual(['悩みブレーキ', '大きな子どもブレーキ']);
    expect(ids(y25.groups[0].items)).toEqual(['nb1', 'nb2']);
    expect(ids(y25.groups[1].items)).toEqual(['nb3', 'nb4']);
    // 削除した項目は数えない
    expect(y25.released).toBe(1);
    expect(dateLine(y25.groups[0].items[1], { perYear: true })).toBe('26年2月1日に追加／25年6月5日に外せた');

    const y26 = brakeYear(m, 2026);
    expect(ids(y26.groups[0].items)).toEqual(['nb1']);
    expect(ids(y26.groups[1].items)).toEqual(['nb3', 'nb5']);
    expect(y26.released).toBe(1);
    expect(y26.groups[0].items[0].attrs).toEqual({ place: 'road', control: 'can' });
  });

  it('仕分けの文言と履歴', () => {
    expect(sortText({ place: 'fork', control: 'cannot' })).toBe('分かれ道／変えられない');
    expect(sortText({ control: 'can' })).toBe('変えられる');
    expect(sortText({ place: '', control: '' })).toBe('');
    const rows = [
      add(2026, 'nb1', W, '作り物の悩み', { place: 'road', control: 'can' }),
      r({ year: 2026, kind: B, id: 'nb1', op: OP.EDIT, text: '作り物の悩み・改', extra: { control: 'cannot' } }),
      status(2026, 'nb1', 'released'),
      status(2026, 'nb1', 'facing'),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(m.historyOf(B, 'nb1').map((x) => historyText(x, B))).toEqual([
      '追加「作り物の悩み」（決めた道の上／変えられる）',
      '修正「作り物の悩み・改」（変えられない）',
      '状態「外せた」',
      '状態「向き合い中」',
    ]);
    const e = brakeYear(m, 2026).groups[0].items[0];
    expect(e.attrs).toEqual({ place: 'road', control: 'cannot' });
    expect(dateLine(e, { perYear: true })).toMatch(/に向き合い中に戻した$/);
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ log, currentYear = 2026, initial = [], readOnly = false, children }) {
  const [rows, setRows] = useState(initial);
  const model = useMemo(() => buildModel(rows, [], { currentYear }), [rows, currentYear]);
  const write = (drafts) => {
    const addRows = drafts.map((d, i) => toRow({ ...d, at: `2026-09-29T10:00:${String((rows.length + i) % 60).padStart(2, '0')}.000+09:00`, no: `rbrake${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((x) => x.concat(addRows));
    return addRows;
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
const dlg = (name) => screen.getByRole('dialog', { name });
const type = (dialog, value) => fireEvent.change(within(dialog).getByRole('textbox', { name: '文言' }), { target: { value } });
const pick = (dialog, name) => fireEvent.click(within(dialog).getByRole('radio', { name }));
const press = (dialog, name) => fireEvent.click(within(dialog).getByRole('button', { name }));
const tagsOf = (text) => [...screen.getByText(text).closest('.item').querySelectorAll('.bchip')].map((x) => x.textContent);
const count = () => document.querySelector('.brake-count').textContent;

describe('ブレーキの画面', () => {
  it('悩み：仕分けを選んで足す。「あとで」も選べる。この下に追加', () => {
    const log = [];
    render(
      <Harness log={log}>
        <BrakeScreen year={2026} />
      </Harness>,
    );
    expect(count()).toBe('この年に外せたブレーキ：0');
    expect(screen.getAllByText('まだありません')).toHaveLength(2);

    openMenu('悩みブレーキの操作');
    choose('追加する');
    let d = dlg('悩みブレーキを追加');
    // 仕分けは「あとで」が選ばれた状態で開く
    expect(within(d).getAllByRole('radio', { checked: true }).map((x) => x.textContent)).toEqual(['あとで', 'あとで']);
    type(d, '作り物の悩みA');
    pick(d, '決めた道の上');
    pick(d, '変えられる');
    press(d, '追加する');
    expect(log.at(-1)).toMatchObject({ year: 2026, kind: 'ブレーキ', op: '追加', layer: W, text: '作り物の悩みA', value: 'facing', extra: { place: 'road', control: 'can' } });
    expect(tagsOf('作り物の悩みA')).toEqual(['決めた道の上', '変えられる', '向き合い中']);
    const idA = log.at(-1).id;

    // 仕分けを「あとで」のまま足す
    openMenu('悩みブレーキの操作');
    choose('追加する');
    d = dlg('悩みブレーキを追加');
    type(d, '作り物の悩みC');
    press(d, '追加する');
    expect(log.at(-1).extra).toBeUndefined();
    expect(tagsOf('作り物の悩みC')).toEqual(['向き合い中']);

    openMenu('「作り物の悩みA」の操作');
    choose('この下に追加');
    d = dlg('悩みブレーキを追加');
    type(d, '作り物の悩みB');
    pick(d, '分かれ道');
    press(d, '追加する');
    expect(log.at(-1)).toMatchObject({ layer: W, extra: { place: 'fork', after: idA } });
    const texts = [...document.querySelectorAll('.brake-screen section:nth-of-type(1) .item .tx')].map((x) => x.textContent);
    expect(texts).toEqual(['作り物の悩みA', '作り物の悩みB', '作り物の悩みC']);
  });

  it('右上の「＋追加」：大きな子どもを選ぶと仕分けは出ない', () => {
    const log = [];
    render(
      <Harness log={log}>
        <BrakeScreen year={2026} />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '＋追加' }));
    const d = dlg('追加する');
    expect(within(d).getByRole('radio', { name: '悩みブレーキ' }).getAttribute('aria-checked')).toBe('true');
    expect(within(d).getByRole('radiogroup', { name: 'どこでの悩み' })).toBeTruthy();
    pick(d, '決めた道の上');
    pick(d, '大きな子どもブレーキ');
    expect(within(d).queryByRole('radiogroup', { name: 'どこでの悩み' })).toBeNull();
    type(d, '作り物の子ども');
    press(d, '追加する');
    // 大きな子どもには仕分けを付けない
    expect(log.at(-1)).toEqual(expect.objectContaining({ kind: 'ブレーキ', op: '追加', layer: CH, text: '作り物の子ども', value: 'facing' }));
    expect(log.at(-1).extra).toBeUndefined();
    expect(tagsOf('作り物の子ども')).toEqual(['向き合い中']);
  });

  it('編集（文言と仕分け）・外せた・向き合い中に戻す・削除', () => {
    const log = [];
    const initial = [add(2026, 'nb1', W, '作り物の悩み', { place: 'road', control: 'can' }), add(2026, 'nb2', CH, '作り物の子ども')];
    render(
      <Harness log={log} initial={initial}>
        <BrakeScreen year={2026} />
      </Harness>,
    );
    openMenu('「作り物の悩み」の操作');
    choose('編集する');
    let d = dlg('編集する');
    expect(within(d).getByRole('radio', { name: '決めた道の上' }).getAttribute('aria-checked')).toBe('true');
    expect(within(d).getByRole('button', { name: '保存する' }).disabled).toBe(true);
    // 仕分けだけ変えても保存できる。変えた仕分けだけ書く
    fireEvent.click(within(d).getAllByRole('radio', { name: 'あとで' })[1]);
    press(d, '保存する');
    expect(log.at(-1)).toEqual({ year: 2026, kind: 'ブレーキ', id: 'nb1', op: '修正', text: '作り物の悩み', extra: { control: '' } });
    expect(tagsOf('作り物の悩み')).toEqual(['決めた道の上', '向き合い中']);

    openMenu('「作り物の悩み」の操作');
    choose('「外せた」にする');
    expect(log.at(-1)).toEqual({ year: 2026, kind: 'ブレーキ', id: 'nb1', op: '状態変更', value: 'released' });
    expect(tagsOf('作り物の悩み')).toEqual(['決めた道の上', '外せた']);
    expect(count()).toBe('この年に外せたブレーキ：1');
    expect(screen.getByText('作り物の悩み').closest('.item').querySelector('.date').textContent).toBe('26年2月1日に追加／26年9月29日に外せた');

    openMenu('「作り物の悩み」の操作');
    choose('「向き合い中」に戻す');
    expect(log.at(-1)).toMatchObject({ op: '状態変更', value: 'facing' });
    expect(count()).toBe('この年に外せたブレーキ：0');

    // 大きな子どもの編集には仕分けが出ない
    openMenu('「作り物の子ども」の操作');
    choose('編集する');
    d = dlg('編集する');
    expect(within(d).queryByRole('radiogroup')).toBeNull();
    type(d, '作り物の子ども・改');
    press(d, '保存する');
    expect(log.at(-1)).toEqual({ year: 2026, kind: 'ブレーキ', id: 'nb2', op: '修正', text: '作り物の子ども・改', extra: undefined });

    openMenu('「作り物の子ども・改」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(log.at(-1)).toMatchObject({ kind: 'ブレーキ', id: 'nb2', op: '削除' });
    expect(screen.getByText('作り物の子ども・改').closest('.item').className).toContain('del');
    openMenu('「作り物の子ども・改」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
    choose('履歴を見る');
    const h = dlg('履歴：作り物の子ども・改');
    expect(within(h).getByText(/修正「作り物の子ども・改」/)).toBeTruthy();
  });

  it('アクションプラン：付けて足す・だけ変える・空にする・「…」から書く', () => {
    const log = [];
    render(
      <Harness log={log}>
        <BrakeScreen year={2026} />
      </Harness>,
    );
    const planBox = (d) => within(d).getByRole('textbox', { name: /^アクションプラン/ });
    const planOf = (text) => screen.getByText(text).closest('.item').querySelector('.bplan')?.textContent ?? null;

    // 悩み：仕分けとアクションプラン（改行もそのまま）
    openMenu('悩みブレーキの操作');
    choose('追加する');
    let d = dlg('悩みブレーキを追加');
    type(d, '作り物の悩みP');
    pick(d, '決めた道の上');
    fireEvent.change(planBox(d), { target: { value: '  作り物の手1\n作り物の手2  ' } });
    press(d, '追加する');
    expect(log.at(-1)).toMatchObject({ op: '追加', layer: W, text: '作り物の悩みP', extra: { place: 'road', plan: '作り物の手1\n作り物の手2' } });
    expect(planOf('作り物の悩みP')).toBe('アクションプラン作り物の手1\n作り物の手2');
    const idP = log.at(-1).id;

    // 大きな子ども：アクションプランだけ
    openMenu('大きな子どもブレーキの操作');
    choose('追加する');
    d = dlg('大きな子どもブレーキを追加');
    type(d, '作り物の子どもP');
    fireEvent.change(planBox(d), { target: { value: '作り物の子どもの手' } });
    press(d, '追加する');
    expect(log.at(-1)).toMatchObject({ layer: CH, extra: { plan: '作り物の子どもの手' } });
    expect(log.at(-1).extra.place).toBeUndefined();
    expect(planOf('作り物の子どもP')).toBe('アクションプラン作り物の子どもの手');

    // 書いていなければ出さない。「…」の並び
    openMenu('悩みブレーキの操作');
    choose('追加する');
    d = dlg('悩みブレーキを追加');
    type(d, '作り物の悩みQ');
    press(d, '追加する');
    expect(log.at(-1).extra).toBeUndefined();
    expect(planOf('作り物の悩みQ')).toBeNull();
    openMenu('「作り物の悩みQ」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      '編集する',
      'アクションプランを書く',
      '「外せた」にする',
      'この下に追加',
      '削除する（灰色で残る）',
      '履歴を見る',
      '完全に削除する',
    ]);
    // 「アクションプランを書く」：アクションプランの欄に入った状態で開く
    choose('アクションプランを書く');
    d = dlg('アクションプラン');
    expect(document.activeElement).toBe(planBox(d));
    expect(within(d).getByRole('button', { name: '保存する' }).disabled).toBe(true);
    fireEvent.change(planBox(d), { target: { value: '作り物の新しい手' } });
    press(d, '保存する');
    // 文言と、変えたアクションプランだけ書く
    expect(log.at(-1)).toEqual({ year: 2026, kind: 'ブレーキ', id: log.at(-1).id, op: '修正', text: '作り物の悩みQ', extra: { plan: '作り物の新しい手' } });
    expect(planOf('作り物の悩みQ')).toBe('アクションプラン作り物の新しい手');
    openMenu('「作り物の悩みQ」の操作');
    expect(screen.getAllByRole('menuitem')[1].textContent).toBe('アクションプランを直す');
    fireEvent.keyDown(document, { key: 'Escape' });

    // 編集で空にする → 空で書き、表示が消える。仕分けは変えていないので書かない
    openMenu('「作り物の悩みP」の操作');
    choose('編集する');
    d = dlg('編集する');
    expect(planBox(d).value).toBe('作り物の手1\n作り物の手2');
    fireEvent.change(planBox(d), { target: { value: '   ' } });
    press(d, '保存する');
    expect(log.at(-1)).toEqual({ year: 2026, kind: 'ブレーキ', id: idP, op: '修正', text: '作り物の悩みP', extra: { plan: '' } });
    expect(planOf('作り物の悩みP')).toBeNull();
    expect(tagsOf('作り物の悩みP')).toEqual(['決めた道の上', '向き合い中']);
  });

  it('アクションプランは翌年に引き継ぎ、履歴に残る。前の年は見るだけで出る', () => {
    const initial = [
      add(2025, 'nb1', W, '作り物の悩み', { place: 'road', control: 'can', plan: '作り物の手' }),
      r({ year: 2025, kind: B, id: 'nb1', op: OP.EDIT, text: '作り物の悩み', extra: { plan: '作り物の手・改' } }),
      add(2025, 'nb2', CH, '作り物の外せた子ども', { plan: '作り物の子どもの手' }),
      status(2025, 'nb2', 'released'),
      add(2025, 'nb3', CH, '作り物の子ども', { plan: '作り物の消す手' }),
      r({ year: 2025, kind: B, id: 'nb3', op: OP.EDIT, text: '作り物の子ども', extra: { plan: '' } }),
    ];
    const m = buildModel(initial, [], { currentYear: 2026 });
    expect(m.historyOf(B, 'nb1').map((x) => historyText(x, B))).toEqual([
      '追加「作り物の悩み」（決めた道の上／変えられる／アクションプラン：作り物の手）',
      '修正「作り物の悩み」（アクションプラン：作り物の手・改）',
    ]);
    expect(m.historyOf(B, 'nb3').map((x) => historyText(x, B))).toEqual([
      '追加「作り物の子ども」（アクションプラン：作り物の消す手）',
      '修正「作り物の子ども」（アクションプランを消した）',
    ]);
    const y26 = brakeYear(m, 2026);
    expect(y26.groups[0].items[0].attrs).toEqual({ place: 'road', control: 'can', plan: '作り物の手・改' });
    // 外せた子どもは引き継がない。消したアクションプランは空のまま
    expect(ids(y26.groups[1].items)).toEqual(['nb3']);
    expect(y26.groups[1].items[0].attrs.plan).toBe('');

    render(
      <Harness log={[]} initial={initial}>
        <BrakeScreen year={2025} />
      </Harness>,
    );
    expect(screen.getByText('作り物の外せた子ども').closest('.item').querySelector('.bplan').textContent).toBe('アクションプラン作り物の子どもの手');
    openMenu('「作り物の悩み」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
  });

  it('前の年は見るだけ。外せたブレーキはその年に残り、今年には出ない', () => {
    const initial = [add(2025, 'nb1', W, '作り物の外せた悩み', { place: 'fork' }), status(2025, 'nb1', 'released'), add(2025, 'nb2', CH, '作り物の続く子ども')];
    render(
      <Harness log={[]} initial={initial}>
        <BrakeScreen year={2026} />
      </Harness>,
    );
    expect(screen.queryByText('作り物の外せた悩み')).toBeNull();
    expect(screen.getByText('作り物の続く子ども')).toBeTruthy();
    expect(count()).toBe('この年に外せたブレーキ：0');
    cleanup();

    render(
      <Harness log={[]} initial={initial}>
        <BrakeScreen year={2025} />
      </Harness>,
    );
    expect(count()).toBe('この年に外せたブレーキ：1');
    expect(tagsOf('作り物の外せた悩み')).toEqual(['分かれ道', '外せた']);
    expect(screen.queryByRole('button', { name: '＋追加' })).toBeNull();
    expect(screen.queryByRole('button', { name: '悩みブレーキの操作' })).toBeNull();
    openMenu('「作り物の外せた悩み」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
  });
});
