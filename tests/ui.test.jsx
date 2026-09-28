// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext, useStoreState } from '../src/app-context.js';
import { ItemList } from '../src/components/ItemList.jsx';
import { IcebergScreen } from '../src/screens/IcebergScreen.jsx';
import { SeedImport } from '../src/screens/SeedImport.jsx';
import { createStore } from '../src/lib/store.js';
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
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
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

// アイスバーグの画面：＋追加（層・採点）、編集（採点だけ／文言と採点）、削除
function IcebergHarness({ log }) {
  const [rows, setRows] = useState([]);
  const model = useMemo(() => buildModel(rows, [], { currentYear: 2026 }), [rows]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-27T11:00:0${(rows.length + i) % 10}.000+09:00`, no: `rice${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((r) => r.concat(add));
    return add;
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly: false }}>
      <span id="bar-actions" />
      <IcebergScreen year={2026} />
    </AppContext.Provider>
  );
}

describe('アイスバーグの画面', () => {
  it('＋追加で層と採点を選んで足す。採点だけ直すと「採点」の行だけ足す', async () => {
    const log = [];
    render(<IcebergHarness log={log} />);
    const addBtn = await screen.findByRole('button', { name: '＋追加' });
    fireEvent.click(addBtn);
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: '意識・想い・人生哲学' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: '言葉' }), { target: { value: '作り物の考え方' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /実践中/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ kind: 'アイスバーグ', op: '追加', layer: 'mind', text: '作り物の考え方', value: '2', year: 2026 });
    expect(screen.getByText('2点')).toBeTruthy();

    // 言葉を押して「…」→ 編集：採点だけ変える
    fireEvent.click(screen.getByRole('button', { name: '作り物の考え方（実践中）' }));
    fireEvent.click(screen.getByRole('button', { name: '「作り物の考え方」の操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '編集する' }));
    dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: '保存する' });
    expect(save.disabled).toBe(true); // 何も変えていない
    fireEvent.click(within(dialog).getByRole('radio', { name: /定着/ }));
    fireEvent.click(save);
    expect(log.slice(1).map((d) => d.op)).toEqual(['採点']);
    expect(screen.getByText('3点')).toBeTruthy();

    // 文言と採点を両方変える → 修正と採点の2行
    fireEvent.click(screen.getByRole('button', { name: '「作り物の考え方」の操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '編集する' }));
    dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: '言葉' }), { target: { value: '作り物の考え方・改' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /目指す/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(log.slice(2).map((d) => d.op)).toEqual(['修正', '採点']);

    // 削除：灰色で残り、点数に入らない
    fireEvent.click(screen.getByRole('button', { name: '「作り物の考え方・改」の操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '削除する（灰色で残る）' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(screen.getByText('0点')).toBeTruthy();
    expect(screen.getByRole('button', { name: /作り物の考え方・改.*削除済み/ }).closest('.w').className).toContain('del');
  });

  it('«マイナス»は採点を出さない', async () => {
    const log = [];
    render(<IcebergHarness log={log} />);
    fireEvent.click(await screen.findByRole('button', { name: '＋追加' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: '«マイナス»のふるまい' }));
    expect(within(dialog).queryByRole('radiogroup', { name: '採点' })).toBeNull();
    fireEvent.change(within(dialog).getByRole('textbox', { name: '言葉' }), { target: { value: '作り物の癖' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加する' }));
    expect(log.at(-1)).toMatchObject({ layer: 'minus', value: '' });
  });
});

// 初期データの取り込み：「確かめる」の後にシートを読み直し、その結果でだけ登録できる
function SeedHarness({ store }) {
  const st = useStoreState(store);
  const pendingRows = useMemo(() => st.pending.map((p) => p.row), [st.pending]);
  const model = useMemo(() => buildModel(st.rows, pendingRows, { currentYear: 2026 }), [st.rows, pendingRows]);
  return (
    <AppContext.Provider value={{ store, st, model, year: 2026, env: 'test', readOnly: false, write: (d) => store.add(d) }}>
      <SeedImport />
    </AppContext.Provider>
  );
}

describe('初期データの取り込み（画面）', () => {
  const SEED = JSON.stringify({ format: 'growth-map-seed/1', year: 2026, goals: ['作り物の目標'] });
  const seedRow = toRow({ at: '2026-09-27T09:00:00.000+09:00', ver: 1, no: 'rseedother1', year: 2026, kind: '目標', id: 'nseedo1', op: '追加', text: '作り物の目標', extra: { source: 'seed' } });

  function setup() {
    const sheet = [];
    let wait = null;
    const api = {
      readAll: async () => {
        if (wait) await wait;
        return { ok: true, rows: sheet.map((r) => r.slice()), count: sheet.length, serverYear: 2026 };
      },
      append: async (url, pass, rows, known) => {
        const have = new Set(sheet.map((r) => r[2]));
        for (const r of rows) if (!have.has(r[2])) sheet.push(r.slice());
        return { ok: true, rows: sheet.slice(known), from: known, count: sheet.length, serverYear: 2026 };
      },
    };
    const store = createStore({ env: 'test', url: 'u', storage: null, api, win: null });
    store.setPass('ok');
    // 次の読み込みを止めておき、返した関数で進める
    const hold = () => {
      let go;
      wait = new Promise((r) => {
        go = r;
      });
      return () => {
        wait = null;
        go();
      };
    };
    return { store, sheet, hold };
  }
  const check = () => {
    fireEvent.change(screen.getByRole('textbox', { name: '初期データの JSON' }), { target: { value: SEED } });
    fireEvent.click(screen.getByRole('button', { name: '確かめる' }));
  };

  it('前に読んだままの画面では、別の端末の取り込みに気づいて登録させない', async () => {
    const { store, sheet, hold } = setup();
    await act(() => store.reload()); // この端末が読んだ後に…
    sheet.push(seedRow); // …別の端末が取り込んだ
    render(<SeedHarness store={store} />);
    const release = hold();
    check();
    // 読み直している間は登録できない
    expect(screen.getByRole('button', { name: /登録する/ }).disabled).toBe(true);
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByText(/初期データは取り込み済みです/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /登録する/ })).toBeNull();
  });

  it('読み直して入っていなければ登録できる（1回だけ）', async () => {
    const { store, sheet } = setup();
    await act(() => store.reload());
    render(<SeedHarness store={store} />);
    await act(async () => {
      check();
      await new Promise((r) => setTimeout(r, 0));
    });
    const reg = screen.getByRole('button', { name: /登録する（1行・テスト用）/ });
    expect(reg.disabled).toBe(false);
    fireEvent.click(reg);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '登録する' }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(sheet).toHaveLength(1);
    expect(screen.getByText(/1行を足しました/)).toBeTruthy();
  });
});
