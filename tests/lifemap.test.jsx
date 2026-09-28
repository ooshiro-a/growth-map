// @vitest-environment happy-dom
// 人生マップと旧マップの取り込み（試験データは作り物だけ。旧マップの言葉は写さない）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { buildModel } from '../src/lib/fold.js';
import { historyText } from '../src/lib/labels.js';
import { lifeTree, mapAlreadyStarted, mapImportDrafts, parseMapImport, toOutline, treeStats } from '../src/lib/lifemap.js';
import { KIND, OP, toRow } from '../src/lib/schema.js';
import { LifeMapScreen } from '../src/screens/LifeMapScreen.jsx';
import { r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const M = KIND.MAP;
// 作り物の番号：「n」＋時刻（36進数8桁）＋連番＋乱数
const T1 = Date.parse('2026-07-11T14:53:35.777+09:00');
const oid = (k) => `n${T1.toString(36)}${k}abcd`;
const NUMBERED = {
  id: 'root',
  text: '作り物の真ん中',
  children: [
    { id: oid('1'), text: '作り物の枝A', children: [{ id: oid('2'), text: '作り物の葉A1', children: [] }] },
    { id: oid('3'), text: '作り物の枝B', children: [] },
  ],
};

describe('旧マップの取り込み', () => {
  it('番号つき：番号をそのまま使い、番号から戻した日時を追加日にする（root は取り込んだ日）', () => {
    const p = parseMapImport(JSON.stringify(NUMBERED, ['id', 'text', 'children'], 2));
    expect(p.ok).toBe(true);
    expect(p.kind).toBe('numbered');
    expect(treeStats(p.tree)).toEqual({ count: 4, depth: 2 });
    const drafts = mapImportDrafts(p, { nowMs: Date.parse('2026-10-01T10:00:00+09:00') });
    expect(drafts.map((d) => [d.id, d.parent, d.text])).toEqual([
      ['root', '', '作り物の真ん中'],
      [oid('1'), 'root', '作り物の枝A'],
      [oid('2'), oid('1'), '作り物の葉A1'],
      [oid('3'), 'root', '作り物の枝B'],
    ]);
    expect(drafts[0]).toMatchObject({ year: '', kind: 'マップ', op: '追加', extra: { source: 'mindmap' } });
    expect(drafts[0].extra.at).toBeUndefined();
    expect(drafts[1].extra).toEqual({ source: 'mindmap', at: '2026-07-11T14:53:35.777+09:00' });

    // 行にして組み立てると、元の木と同じ形・同じ番号になる
    const rows = drafts.map((d, i) => toRow({ ...d, at: `2026-10-01T10:00:0${i}.000+09:00`, no: `rimp${i}xxxx` }));
    const m = buildModel(rows, [], { currentYear: 2026 });
    const t = lifeTree(m);
    const back = (n) => ({ id: n.e.id, text: n.e.text, children: n.children.map(back) });
    expect(back(t)).toEqual(NUMBERED);
    expect(toOutline(t)).toBe('- 作り物の真ん中\n  - 作り物の枝A\n    - 作り物の葉A1\n  - 作り物の枝B\n');
    expect(m.historyOf(M, oid('1')).map((x) => historyText(x, M))).toEqual(['旧マップから追加「作り物の枝A」']);
    expect(mapAlreadyStarted(m.records)).toBe(true);
  });

  it('文章の形：字下げ2文字ずつ。番号は新しく作り、真ん中は root', () => {
    const p = parseMapImport('- 作り物の真ん中\n  - 作り物の枝\n    - 作り物の葉\n  - 作り物の枝2\n');
    expect(p.ok).toBe(true);
    expect(p.kind).toBe('outline');
    let k = 0;
    const drafts = mapImportDrafts(p, { makeId: () => `nnew${++k}` });
    expect(drafts.map((d) => [d.id, d.parent, d.text])).toEqual([
      ['root', '', '作り物の真ん中'],
      ['nnew1', 'root', '作り物の枝'],
      ['nnew2', 'nnew1', '作り物の葉'],
      ['nnew3', 'root', '作り物の枝2'],
    ]);
    expect(drafts.every((d) => d.extra.at === undefined)).toBe(true);
  });

  it('形が違う時は理由を出す', () => {
    expect(parseMapImport('').errors[0]).toBe('何も貼られていません');
    expect(parseMapImport('{"id": "root", "text": "a"').errors[0]).toMatch(/JSON として読めません/);
    const dup = parseMapImport(JSON.stringify({ id: 'root', text: 'a', children: [{ id: 'root', text: 'b', children: [] }] }));
    expect(dup.errors).toEqual(['真ん中の1番目：番号「root」が重なっています']);
    expect(parseMapImport(JSON.stringify({ id: 'x y', text: '', children: [] })).errors).toEqual(['真ん中：番号（id）が正しくありません', '真ん中：文言がありません']);
    expect(parseMapImport('- a\n   - b').errors).toEqual(['2行目：字下げが2文字ずつではありません']);
    expect(parseMapImport('- a\n    - b').errors).toEqual(['2行目：字下げが深すぎます（上の行より2文字だけ深くできます）']);
    expect(parseMapImport('- a\n- b').errors).toEqual(['2行目：真ん中（字下げなしの行）は1つだけです']);
    expect(parseMapImport('a').errors).toEqual(['1行目：「- 」で始まっていません']);
  });
});

describe('人生マップの組み立て', () => {
  it('削除した枝はこの先もいっしょに灰色。打ち消した追加の下は出さない。文章には削除を入れない', () => {
    const rows = [
      r({ kind: M, id: 'root', op: OP.ADD, text: '作り物の真ん中' }),
      r({ kind: M, id: 'na', parent: 'root', op: OP.ADD, text: '作り物の枝A' }),
      r({ kind: M, id: 'na1', parent: 'na', op: OP.ADD, text: '作り物の葉A1' }),
      r({ kind: M, id: 'nb', parent: 'root', op: OP.ADD, text: '作り物の枝B' }),
      r({ no: 'rlmadd', kind: M, id: 'nc', parent: 'root', op: OP.ADD, text: '作り物の枝C' }),
      r({ kind: M, id: 'nc1', parent: 'nc', op: OP.ADD, text: '作り物の葉C1' }),
      r({ kind: M, id: 'na', op: OP.DELETE }),
      r({ kind: M, id: 'nc', op: OP.UNDO, extra: { undo: 'rlmadd' } }),
    ];
    const t = lifeTree(buildModel(rows, [], { currentYear: 2026 }));
    expect(t.children.map((c) => c.e.id)).toEqual(['na', 'nb']);
    expect(t.children[0].deleted.inherited).toBe(false);
    expect(t.children[0].children[0].deleted.inherited).toBe(true);
    expect(t.children[1].deleted).toBeNull();
    expect(toOutline(t)).toBe('- 作り物の真ん中\n  - 作り物の枝B\n');
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ log, initial = [], readOnly = false, env = 'test', children }) {
  const [rows, setRows] = useState(initial);
  const model = useMemo(() => buildModel(rows, [], { currentYear: 2026 }), [rows]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-29T10:00:${String((rows.length + i) % 60).padStart(2, '0')}.000+09:00`, no: `rlm${env}${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((x) => x.concat(add));
    return add;
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly, env, year: 2026 }}>
      <span id="bar-actions" />
      {children}
    </AppContext.Provider>
  );
}

const base = () => [
  r({ kind: M, id: 'root', op: OP.ADD, text: '作り物の真ん中' }),
  r({ kind: M, id: 'na', parent: 'root', op: OP.ADD, text: '作り物の枝A' }),
  r({ kind: M, id: 'na1', parent: 'na', op: OP.ADD, text: '作り物の葉A1' }),
  r({ kind: M, id: 'nb', parent: 'root', op: OP.ADD, text: '作り物の枝B' }),
];
const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (label) => fireEvent.click(screen.getByRole('menuitem', { name: label }));
const typeAndSave = (dialogName, value, button = '追加する') => {
  const dialog = screen.getByRole('dialog', { name: dialogName });
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
};
const texts = () => [...document.querySelectorAll('.lm-text')].map((x) => x.textContent);

describe('人生マップの画面', () => {
  it('何もない時は「真ん中を作る」', () => {
    const log = [];
    render(
      <Harness log={log}>
        <LifeMapScreen />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '真ん中を作る' }));
    typeAndSave('真ん中を作る', '作り物の真ん中', '作る');
    expect(log.at(-1)).toEqual({ year: '', kind: 'マップ', id: 'root', parent: '', op: '追加', text: '作り物の真ん中', extra: undefined });
    expect(texts()).toEqual(['作り物の真ん中']);
  });

  it('押すと選ばれて日付と「…」。文字を直す・枝を伸ばす・下に追加・削除（この先も灰色）', () => {
    const log = [];
    render(
      <Harness log={log} initial={base()}>
        <LifeMapScreen />
      </Harness>,
    );
    expect(texts()).toEqual(['作り物の真ん中', '作り物の枝A', '作り物の葉A1', '作り物の枝B']);
    fireEvent.click(screen.getByRole('button', { name: '作り物の枝A' }));
    const node = screen.getByRole('button', { name: '作り物の枝A' }).closest('.lm-node');
    expect(node.className).toContain('sel');
    expect(node.querySelector('.date').textContent).toBe('26年2月1日に追加');

    // 真ん中には「下に追加」「削除」を出さない
    openMenu('「作り物の真ん中」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['文字を直す', '枝を伸ばす', '履歴']);
    fireEvent.keyDown(document, { key: 'Escape' });

    openMenu('「作り物の枝A」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['文字を直す', '枝を伸ばす', '下に追加', '削除', '履歴', '完全に削除する']);
    choose('文字を直す');
    typeAndSave('文字を直す', '作り物の枝A・改', '保存する');
    expect(log.at(-1)).toEqual({ year: '', kind: 'マップ', id: 'na', op: '修正', text: '作り物の枝A・改' });

    openMenu('「作り物の枝A・改」の操作');
    choose('枝を伸ばす');
    typeAndSave('枝を伸ばす', '作り物の葉A2');
    expect(log.at(-1)).toMatchObject({ kind: 'マップ', op: '追加', parent: 'na', text: '作り物の葉A2', extra: undefined });

    openMenu('「作り物の葉A1」の操作');
    choose('下に追加');
    typeAndSave('下に追加', '作り物の葉A1の次');
    expect(log.at(-1)).toMatchObject({ parent: 'na', text: '作り物の葉A1の次', extra: { after: 'na1' } });
    expect(texts()).toEqual(['作り物の真ん中', '作り物の枝A・改', '作り物の葉A1', '作り物の葉A1の次', '作り物の葉A2', '作り物の枝B']);

    openMenu('「作り物の枝A・改」の操作');
    choose('削除');
    const d = screen.getByRole('dialog', { name: '削除する' });
    expect(d.textContent).toContain('この先の枝もいっしょに灰色になります');
    fireEvent.click(within(d).getByRole('button', { name: '削除する' }));
    expect(log.at(-1)).toEqual({ year: '', kind: 'マップ', id: 'na', op: '削除' });
    const branchA = screen.getByRole('button', { name: '作り物の枝A・改' }).closest('.lm-branch');
    expect(branchA.className).toContain('del');
    expect(branchA.querySelectorAll('.lm-branch')).toHaveLength(3);
    // 削除した枝（と、その先）は履歴だけ
    openMenu('「作り物の葉A1」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴', '完全に削除する']);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: '作り物の葉A1' }).closest('.lm-node').querySelector('.date').textContent).toMatch(/に追加／26年9月29日に削除$/);
  });

  it('元に戻す：この画面で書いた記録を新しい順に打ち消す。取り込んだ中身は戻さない', () => {
    const log = [];
    render(
      <Harness log={log} initial={base()} env="undo-a">
        <LifeMapScreen />
      </Harness>,
    );
    const undo = screen.getByRole('button', { name: '元に戻す' });
    expect(undo.disabled).toBe(true);
    openMenu('「作り物の枝B」の操作');
    choose('枝を伸ばす');
    typeAndSave('枝を伸ばす', '作り物の葉B1');
    const addNo = `rlmundo-a4xxxx`;
    openMenu('「作り物の枝A」の操作');
    choose('文字を直す');
    typeAndSave('文字を直す', '作り物の枝A・改', '保存する');
    expect(texts()).toContain('作り物の枝A・改');

    fireEvent.click(undo);
    expect(log.at(-1)).toEqual({ year: '', kind: 'マップ', id: 'na', op: '打ち消し', extra: { undo: 'rlmundo-a5xxxx' } });
    expect(texts()).toContain('作り物の枝A');
    expect(screen.getByRole('status').textContent).toBe('ひとつ前に戻しました（「作り物の枝A・改」への修正を取り消し）');

    fireEvent.click(undo);
    expect(log.at(-1)).toMatchObject({ op: '打ち消し', extra: { undo: addNo } });
    expect(texts()).not.toContain('作り物の葉B1');
    expect(undo.disabled).toBe(true);
    expect(log).toHaveLength(4);
  });

  it('たたむ・開く（たたんだ枝の数）、拡大縮小、文章として書き出す', () => {
    render(
      <Harness log={[]} initial={base()}>
        <LifeMapScreen />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '枝をたたむ：作り物の枝A' }));
    expect(texts()).not.toContain('作り物の葉A1');
    expect(screen.getByRole('button', { name: '枝を開く（1）' }).textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '枝を開く（1）' }));
    expect(texts()).toContain('作り物の葉A1');

    const map = document.querySelector('.lm-map');
    expect(map.style.zoom).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '縮小' }));
    expect(map.style.zoom).toBe('0.85');
    fireEvent.click(screen.getByRole('button', { name: '拡大' }));
    fireEvent.click(screen.getByRole('button', { name: '拡大' }));
    expect(map.style.zoom).toBe('1.15');

    openMenu('人生マップの操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['すべての枝を開く', '深い枝をたたむ', 'PDFで保存', '文章として書き出す']);
    choose('文章として書き出す');
    const d = screen.getByRole('dialog', { name: '文章として書き出す' });
    expect(within(d).getByRole('textbox', { name: '書き出した文章' }).value).toBe('- 作り物の真ん中\n  - 作り物の枝A\n    - 作り物の葉A1\n  - 作り物の枝B\n');
  });

  it('見るだけの時は「…」に履歴だけ。元に戻すも出さない', () => {
    render(
      <Harness log={[]} initial={base()} readOnly>
        <LifeMapScreen />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: '元に戻す' })).toBeNull();
    openMenu('「作り物の枝A」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴']);
  });
});
