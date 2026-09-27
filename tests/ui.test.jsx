// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { ItemList } from '../src/components/ItemList.jsx';
import { buildModel } from '../src/lib/fold.js';
import { toRow } from '../src/lib/schema.js';

afterEach(cleanup);

// 画面と同じ流れ：書いた下書きを行にして、組み立て直す
function Harness({ log }) {
  const [rows, setRows] = useState([]);
  const model = useMemo(() => buildModel(rows, [], { currentYear: 2026 }), [rows]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-27T10:00:0${rows.length + i}.000+09:00`, no: `rui${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((r) => r.concat(add));
    return add;
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly: false }}>
      <ItemList kind="指標" title="指標" />
    </AppContext.Provider>
  );
}

const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (label) => fireEvent.click(screen.getByRole('menuitem', { name: label }));
const typeAndSave = (text, saveLabel) => {
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: text } });
  fireEvent.click(within(dialog).getByRole('button', { name: saveLabel }));
};

describe('共通の並び（ItemList）', () => {
  it('追加・この下に追加・編集・削除（灰色で残る）・履歴', () => {
    const log = [];
    render(<Harness log={log} />);
    expect(screen.getByText('まだありません')).toBeTruthy();

    openMenu('指標の操作');
    choose('追加する');
    typeAndSave('一番目', '追加する');
    openMenu('指標の操作');
    choose('追加する');
    typeAndSave('三番目', '追加する');
    openMenu('「一番目」の操作');
    choose('この下に追加');
    typeAndSave('二番目', '追加する');
    expect(screen.getAllByText(/一番目|二番目|三番目/).map((e) => e.textContent)).toEqual(['一番目', '二番目', '三番目']);

    openMenu('「二番目」の操作');
    choose('編集する');
    typeAndSave('二番目を直した', '保存する');
    expect(log.at(-1)).toMatchObject({ op: '修正', text: '二番目を直した' });

    openMenu('「三番目」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    const row = screen.getByText('三番目').closest('.item');
    expect(row.className).toContain('del');
    expect(within(row).getByText(/26年9月27日に追加／26年9月27日に削除/)).toBeTruthy();

    openMenu('「三番目」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
    choose('履歴を見る');
    expect(within(screen.getByRole('dialog')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '26年9月27日追加「三番目」',
      '26年9月27日削除',
    ]);
  });

  it('押すと日付が出て、もう一度押すと消える（スマホ）', () => {
    const orig = window.matchMedia;
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
    try {
      render(<Harness log={[]} />);
      openMenu('指標の操作');
      choose('追加する');
      typeAndSave('言葉', '追加する');
      const row = screen.getByText('言葉').closest('.item');
      act(() => fireEvent.click(row));
      expect(row.className).toContain('show');
      act(() => fireEvent.click(row));
      expect(row.className).not.toContain('show');
    } finally {
      window.matchMedia = orig;
    }
  });

  it('空の文言では保存できない', () => {
    render(<Harness log={[]} />);
    openMenu('指標の操作');
    choose('追加する');
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } });
    expect(within(dialog).getByRole('button', { name: '追加する' }).disabled).toBe(true);
  });

  it('Enter：変換の確定では保存しない。変えていない編集は記録を足さない', () => {
    const log = [];
    render(<Harness log={log} />);
    openMenu('指標の操作');
    choose('追加する');
    const box = within(screen.getByRole('dialog')).getByRole('textbox');
    fireEvent.change(box, { target: { value: 'かきかけ' } });
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 }); // Safari の変換確定
    expect(log).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 13 });
    expect(log).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    openMenu('「かきかけ」の操作');
    choose('編集する');
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('textbox'), { key: 'Enter', keyCode: 13 });
    expect(log).toHaveLength(1);
  });

  it('書きかけの時は、外側を押しても閉じない', () => {
    render(<Harness log={[]} />);
    openMenu('指標の操作');
    choose('追加する');
    const overlay = document.querySelector('.overlay');
    fireEvent.pointerDown(overlay);
    expect(screen.queryByRole('dialog')).toBeNull(); // 何も書いていなければ閉じる
    openMenu('指標の操作');
    choose('追加する');
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox'), { target: { value: '消したくない' } });
    fireEvent.pointerDown(document.querySelector('.overlay'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
