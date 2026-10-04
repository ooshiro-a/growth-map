// @vitest-environment happy-dom
// アクセル（試験データは作り物だけ）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { axisOf, motiveYear, scoreLine } from '../src/lib/accel.js';
import { buildModel } from '../src/lib/fold.js';
import { historyText } from '../src/lib/labels.js';
import { KIND, LAYER, OP, motiveQuadrantId, toRow } from '../src/lib/schema.js';
import { AccelScreen } from '../src/screens/AccelScreen.jsx';
import { ids, r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const AX = KIND.AXIS;
const MV = KIND.MOTIVE;
const SV = LAYER.SELF_VISIBLE;
const OV = LAYER.OTHER_VISIBLE;
const SI = LAYER.SELF_INVISIBLE;
const score = (year, q, value, at) => r({ year, kind: MV, id: motiveQuadrantId(q), op: OP.SCORE, layer: q, value: String(value), ...(at ? { at } : {}) });

describe('アクセルの組み立て', () => {
  it('自分軸・理念：前の年から引き継ぎ、削除したものは引き継がない。修正前の文言は履歴に残る', () => {
    const rows = [
      r({ year: 2025, kind: AX, id: 'na1', op: OP.ADD, text: '作り物の理念1' }),
      r({ year: 2025, kind: AX, id: 'na2', op: OP.ADD, text: '作り物の理念2' }),
      r({ year: 2025, kind: AX, id: 'na2', op: OP.DELETE }),
      r({ year: 2026, kind: AX, id: 'na1', op: OP.EDIT, text: '作り物の理念1・改' }),
      r({ year: 2026, kind: AX, id: 'na3', op: OP.ADD, text: '作り物の理念0', extra: { after: '' } }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(ids(axisOf(m, 2025))).toEqual(['na1', 'na2']);
    const now = axisOf(m, 2026);
    expect(ids(now)).toEqual(['na3', 'na1']);
    expect(now[1].text).toBe('作り物の理念1・改');
    expect(axisOf(m, 2025)[0].text).toBe('作り物の理念1');
    expect(m.historyOf(AX, 'na1').map((x) => historyText(x, AX))).toEqual(['追加「作り物の理念1」', '修正「作り物の理念1・改」']);
  });

  it('動機：区分ごとの点数と中身。前の年の点数を出し、点数の日付は最後の変化', () => {
    const rows = [
      score(2025, SV, 6, '2025-12-20T10:00:00.000+09:00'),
      score(2025, OV, 2, '2025-12-21T10:00:00.000+09:00'),
      r({ year: 2025, kind: MV, id: 'nm1', op: OP.ADD, layer: SV, text: '作り物の動機1' }),
      score(2026, SV, 7, '2026-12-20T10:00:00.000+09:00'),
      r({ year: 2026, kind: MV, id: 'nm2', op: OP.ADD, layer: SI, text: '作り物の動機2' }),
      r({ year: 2026, kind: MV, id: 'nm3', op: OP.ADD, layer: SI, text: '作り物の動機3' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const { quads, prev } = motiveYear(m, 2026);
    expect(quads.map((x) => x.q)).toEqual([SV, OV, SI, LAYER.OTHER_INVISIBLE]);
    expect(quads.map((x) => x.score)).toEqual([7, 2, null, null]);
    expect(prev).toEqual({ [SV]: 6, [OV]: 2, [SI]: null, [LAYER.OTHER_INVISIBLE]: null });
    expect(ids(quads[0].items)).toEqual(['nm1']);
    expect(ids(quads[2].items)).toEqual(['nm2', 'nm3']);
    expect(scoreLine(quads[0].scoreEntity)).toBe('26年12月20日に更新（6→7）');
    // 今年は変えていない区分：前の年に変えた日
    expect(scoreLine(quads[1].scoreEntity)).toBe('25年12月21日に更新（—→2）');
    expect(scoreLine(quads[2].scoreEntity)).toBe('点数はまだありません');
    // 最初の年は前の年がない
    expect(motiveYear(m, 2025).prev).toBeNull();
  });

  it('前の年に点数が1つもなければ、灰色の矢印は出さない', () => {
    const rows = [r({ year: 2025, kind: AX, id: 'na1', op: OP.ADD, text: '作り物の理念' }), score(2026, SV, 3)];
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(motiveYear(m, 2026).prev).toBeNull();
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ log, currentYear = 2026, initial = [], readOnly = false, children }) {
  const [rows, setRows] = useState(initial);
  const model = useMemo(() => buildModel(rows, [], { currentYear }), [rows, currentYear]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-28T10:00:${String((rows.length + i) % 60).padStart(2, '0')}.000+09:00`, no: `raccel${rows.length + i}xxxx` }));
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
const typeAndSave = (dialogName, value, button = '追加する') => {
  const dialog = screen.getByRole('dialog', { name: dialogName });
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
};
const axisTexts = () => [...document.querySelectorAll('.accel-screen section:nth-of-type(1) .item .tx')].map((x) => x.textContent);

describe('アクセルの画面', () => {
  it('自分軸・理念：追加・この下に追加・編集・削除（灰色）', () => {
    const log = [];
    render(
      <Harness log={log}>
        <AccelScreen year={2026} />
      </Harness>,
    );
    expect(screen.getByText('まだありません')).toBeTruthy();
    openMenu('自分理念・自分軸アクセルの操作');
    choose('追加する');
    typeAndSave('自分理念・自分軸アクセルに追加', '作り物の理念A');
    expect(log.at(-1)).toMatchObject({ year: 2026, kind: '自分軸', op: '追加', text: '作り物の理念A' });
    expect(log.at(-1).extra).toBeUndefined();
    const idA = log.at(-1).id;

    openMenu('自分理念・自分軸アクセルの操作');
    choose('追加する');
    typeAndSave('自分理念・自分軸アクセルに追加', '作り物の理念C');
    openMenu('「作り物の理念A」の操作');
    choose('この下に追加');
    typeAndSave('自分理念・自分軸アクセルに追加', '作り物の理念B');
    expect(log.at(-1)).toMatchObject({ kind: '自分軸', extra: { after: idA } });
    expect(axisTexts()).toEqual(['作り物の理念A', '作り物の理念B', '作り物の理念C']);

    openMenu('「作り物の理念B」の操作');
    choose('編集する');
    typeAndSave('編集する', '作り物の理念B・改', '保存する');
    expect(log.at(-1)).toMatchObject({ year: 2026, kind: '自分軸', op: '修正', text: '作り物の理念B・改' });

    openMenu('「作り物の理念C」の操作');
    choose('削除する（灰色で残る）');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' }));
    expect(log.at(-1)).toMatchObject({ kind: '自分軸', op: '削除' });
    expect(screen.getByText('作り物の理念C').closest('.item').className).toContain('del');
    openMenu('「作り物の理念C」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る', '完全に削除する']);
  });

  it('動機：点数を変える（0〜10）・中身を足す。図の矢印は点数のある区分だけ', () => {
    const log = [];
    const initial = [score(2026, SV, 7), score(2026, OV, 0)];
    render(
      <Harness log={log} initial={initial}>
        <AccelScreen year={2026} />
      </Harness>,
    );
    const chart = screen.getByRole('img', { name: /動機アクセル/ });
    expect(chart.getAttribute('aria-label')).toBe('動機アクセル。2026年は自分×見える7、他者×見える0、自分×見えない—、他者×見えない—');
    // 0点と点数なしには矢印を描かない
    expect(chart.querySelectorAll('.arrow-now')).toHaveLength(1);
    expect(chart.querySelectorAll('.arrow-prev')).toHaveLength(0);
    const arrow = chart.querySelector('.arrow-now');
    expect([arrow.getAttribute('x2'), arrow.getAttribute('y2')]).toEqual(['179.5', '62.5']);
    expect(document.querySelector('.lgd').textContent).toBe('緑＝2026年');

    openMenu('「自分×見えない」の操作');
    choose('点数を変える');
    const dialog = screen.getByRole('dialog', { name: '自分×見えないの点数' });
    const save = within(dialog).getByRole('button', { name: '保存する' });
    expect(save.disabled).toBe(true);
    expect(within(dialog).getAllByRole('radio')).toHaveLength(11);
    fireEvent.click(within(dialog).getByRole('radio', { name: '8' }));
    fireEvent.click(save);
    expect(log.at(-1)).toEqual({ year: 2026, kind: '動機', id: 'mv-selfInvisible', op: '採点', layer: SI, value: '8' });
    expect(chart.querySelectorAll('.arrow-now')).toHaveLength(2);
    expect(screen.getByText('8点')).toBeTruthy();

    // 同じ点数では保存できない
    openMenu('「自分×見える」の操作');
    choose('点数を変える');
    const d2 = screen.getByRole('dialog', { name: '自分×見えるの点数' });
    fireEvent.click(within(d2).getByRole('radio', { name: '7' }));
    expect(within(d2).getByRole('button', { name: '保存する' }).disabled).toBe(true);
    fireEvent.click(within(d2).getByRole('button', { name: 'やめる' }));

    openMenu('「自分×見えない」の操作');
    choose('中身を追加');
    typeAndSave('自分×見えないに追加', '作り物の動機');
    expect(log.at(-1)).toMatchObject({ year: 2026, kind: '動機', op: '追加', layer: SI, text: '作り物の動機' });
    const quad = screen.getByText('作り物の動機').closest('.quad');
    expect(within(quad).getByText('自分×見えない')).toBeTruthy();

    // 点数の履歴
    openMenu('「自分×見えない」の操作');
    choose('点数の履歴');
    expect(within(screen.getByRole('dialog', { name: '履歴：自分×見えないの点数' })).getByText(/点数「8」/)).toBeTruthy();
  });

  it('右上の「＋追加」：足す先を選んで足す', () => {
    const log = [];
    render(
      <Harness log={log}>
        <AccelScreen year={2026} />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: '＋追加' }));
    let dialog = screen.getByRole('dialog', { name: '追加する' });
    expect(within(dialog).getByRole('radio', { name: '自分理念・自分軸アクセル' }).getAttribute('aria-checked')).toBe('true');
    typeAndSave('追加する', '作り物の理念');
    expect(log.at(-1)).toMatchObject({ kind: '自分軸', op: '追加', text: '作り物の理念' });

    fireEvent.click(screen.getByRole('button', { name: '＋追加' }));
    dialog = screen.getByRole('dialog', { name: '追加する' });
    fireEvent.click(within(dialog).getByRole('radio', { name: '動機：他者×見える' }));
    typeAndSave('追加する', '作り物の他者の動機');
    expect(log.at(-1)).toMatchObject({ kind: '動機', op: '追加', layer: OV, text: '作り物の他者の動機' });
  });

  it('前の年の点数を灰色で重ねる。前の年は見るだけ', () => {
    const initial = [
      score(2025, SV, 6),
      r({ year: 2025, kind: AX, id: 'na1', op: OP.ADD, text: '作り物の理念' }),
      r({ year: 2025, kind: MV, id: 'nm1', op: OP.ADD, layer: SV, text: '作り物の動機' }),
      score(2026, SV, 7),
    ];
    render(
      <Harness log={[]} initial={initial}>
        <AccelScreen year={2026} />
      </Harness>,
    );
    expect(document.querySelectorAll('.arrow-prev')).toHaveLength(1);
    expect(document.querySelector('.lgd').textContent).toBe('緑＝2026年　灰＝2025年');
    cleanup();

    render(
      <Harness log={[]} initial={initial}>
        <AccelScreen year={2025} />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: '＋追加' })).toBeNull();
    expect(screen.queryByRole('button', { name: '自分理念・自分軸アクセルの操作' })).toBeNull();
    openMenu('「作り物の理念」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
    fireEvent.keyDown(document, { key: 'Escape' });
    openMenu('「自分×見える」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['点数の履歴']);
    fireEvent.keyDown(document, { key: 'Escape' });
    // 点数のない区分は、見るだけの時は「…」を出さない
    expect(screen.queryByRole('button', { name: '「他者×見える」の操作' })).toBeNull();
  });
});
