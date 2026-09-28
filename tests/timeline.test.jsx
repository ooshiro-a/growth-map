// @vitest-environment happy-dom
// 年表（試験データは作り物だけ）
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo } from 'react';
import { AppContext } from '../src/app-context.js';
import { buildModel } from '../src/lib/fold.js';
import { KIND, LAYER, OP } from '../src/lib/schema.js';
import { CHART, chartLayout, deltaText, growthYears } from '../src/lib/timeline.js';
import { GrowthTimeline } from '../src/screens/GrowthTimeline.jsx';
import { YearRecord } from '../src/screens/YearRecord.jsx';
import { r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

const I = KIND.ICEBERG;
const G = KIND.GOAL;
const word = (year, id, stage, layer = LAYER.SKILL) => r({ year, kind: I, id, op: OP.ADD, layer, text: `作り物の言葉${id}`, value: String(stage) });

// 2021〜2026年。毎年言葉を1つずつ足す（大きさ 1,3,6,6,9,12）
function sixYears() {
  return [
    word(2021, 'n1', 1),
    word(2022, 'n2', 2),
    word(2023, 'n3', 3),
    word(2025, 'n4', 3, LAYER.MIND),
    word(2026, 'n5', 3, LAYER.PLUS),
    r({ year: 2026, kind: I, id: 'nm', op: OP.ADD, layer: LAYER.MINUS, text: '作り物のマイナス' }),
    r({ year: 2025, kind: G, id: 'ng1', op: OP.ADD, text: '作り物の目標A' }),
    r({ year: 2025, kind: G, id: 'ng2', op: OP.ADD, text: '作り物の目標B' }),
    r({ year: 2025, kind: G, id: 'ng3', op: OP.ADD, text: '作り物の目標C' }),
    r({ year: 2025, kind: G, id: 'ng1', op: OP.ACHIEVE }),
    r({ year: 2025, kind: G, id: 'ng2', op: OP.ACHIEVE }),
    r({ year: 2025, kind: G, id: 'ng2', op: OP.DELETE }),
    r({ year: 2025, kind: G, id: 'ng3', op: OP.MISS }),
  ];
}

describe('成長年表の数字', () => {
  it('直近5年（古い年は外れる）・大きさ・増減・成果', () => {
    const m = buildModel(sixYears(), [], { currentYear: 2026 });
    const ys = growthYears(m);
    expect(ys.map((y) => y.year)).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(ys.map((y) => y.size)).toEqual([3, 6, 6, 9, 12]);
    expect(ys.map((y) => y.delta)).toEqual([2, 3, 0, 3, 3]);
    expect(ys.map((y) => y.achieved.map((g) => g.text))).toEqual([[], [], [], ['作り物の目標A'], []]);
    expect(ys.map((y) => deltaText(y.delta))).toEqual(['＋2', '＋3', '±0', '＋3', '＋3']);
    expect(deltaText(null)).toBe('—');
    expect(deltaText(-4)).toBe('−4');
  });

  it('最初の年の増減は「—」。記録がなければ今年だけ', () => {
    const m = buildModel([word(2025, 'n1', 2)], [], { currentYear: 2026 });
    expect(growthYears(m).map((y) => [y.year, y.size, y.delta])).toEqual([
      [2025, 2, null],
      [2026, 2, 0],
    ]);
    const empty = buildModel([], [], { currentYear: 2026 });
    expect(growthYears(empty).map((y) => [y.year, y.size, y.delta])).toEqual([[2026, 0, null]]);
  });

  it('図：大きさに比例（同じ縮尺）。0点はアイスバーグなしで点だけ', () => {
    const L = chartLayout([
      { year: 2024, size: 0 },
      { year: 2025, size: 5 },
      { year: 2026, size: 10 },
    ]);
    expect(L.map((p) => p.x)).toEqual([CHART.x0, CHART.x0 + CHART.step, CHART.x0 + 2 * CHART.step]);
    expect(L[0].berg).toBeNull();
    expect(L[0].dotY).toBe(CHART.zeroDot);
    const h = (p) => p.dotY - CHART.gap - p.berg.topY;
    expect(h(L[2])).toBeCloseTo(CHART.maxH);
    expect(h(L[1])).toBeCloseTo(CHART.maxH / 2);
    expect(CHART.zeroDot - L[1].dotY).toBeCloseTo((CHART.zeroDot - L[2].dotY) / 2);
    expect(L[2].berg.topY).toBeCloseTo(CHART.top);
    expect(L[2].berg.bands).toHaveLength(4);
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ rows, children }) {
  const model = useMemo(() => buildModel(rows, [], { currentYear: 2026 }), [rows]);
  const write = () => {
    throw new Error('年表では書かない');
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly: false, env: 'test', year: 2026 }}>
      <span id="bar-actions" />
      {children}
    </AppContext.Provider>
  );
}

describe('成長年表の画面', () => {
  it('表と図。年を押すとその年を開く', () => {
    const opened = [];
    render(
      <Harness rows={sixYears()}>
        <GrowthTimeline onOpen={(y) => opened.push(y)} />
      </Harness>,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['2022', '3点', '＋2', '—'],
      ['2023', '6点', '＋3', '—'],
      ['2024', '6点', '±0', '—'],
      ['2025', '9点', '＋3', '作り物の目標A'],
      ['2026', '12点', '＋3', '—'],
    ]);
    expect(document.querySelectorAll('.growth-fig polyline')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '2025年の記録を開く' }));
    fireEvent.click(screen.getByRole('button', { name: '2023年 6点。この年の記録を開く' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '2026年 12点。この年の記録を開く' }), { key: 'Enter' });
    fireEvent.click(rows[0]);
    expect(opened).toEqual([2025, 2023, 2026, 2022]);
  });
});

describe('年ごとの記録', () => {
  const rows = () => [
    ...sixYears(),
    r({ year: 2025, kind: KIND.BRAKE, id: 'nb1', op: OP.ADD, layer: LAYER.CHILD, text: '作り物のブレーキ', value: 'released' }),
    r({ year: 2026, kind: KIND.AXIS, id: 'na1', op: OP.ADD, text: '作り物の理念' }),
  ];

  it('年と中身を選べる。今年でも見るだけ（「＋追加」「完全に削除する」は出ない）', () => {
    const changes = [];
    const { rerender } = render(
      <Harness rows={rows()}>
        <YearRecord onChange={(y, p) => changes.push([y, p])} />
      </Harness>,
    );
    const pick = screen.getByRole('combobox', { name: 'どの年の記録か' });
    expect([...pick.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['2026年', '2025年', '2024年', '2023年', '2022年', '2021年']);
    expect(pick.value).toBe('2026');
    expect(screen.getByRole('tab', { name: 'アイスバーグ', selected: true })).toBeTruthy();
    expect(screen.getByText('2026年の記録（見るだけ）')).toBeTruthy();
    expect(screen.queryByText('＋追加')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^作り物の言葉n5（/ }));
    fireEvent.click(screen.getByRole('button', { name: '「作り物の言葉n5」の操作' }));
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.change(pick, { target: { value: '2025' } });
    fireEvent.click(screen.getByRole('tab', { name: 'ブレーキ' }));
    expect(changes).toEqual([
      [2025, 'iceberg'],
      [2026, 'brake'],
    ]);

    rerender(
      <Harness rows={rows()}>
        <YearRecord year={2025} part="brake" onChange={() => {}} />
      </Harness>,
    );
    expect(screen.getByText('作り物のブレーキ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '「作り物のブレーキ」の操作' }));
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['履歴を見る']);
    fireEvent.keyDown(document, { key: 'Escape' });
  });

  it('アクセル・振り返りも見るだけ。ない年は今年に戻る', () => {
    const { rerender } = render(
      <Harness rows={rows()}>
        <YearRecord year={2026} part="accel" />
      </Harness>,
    );
    expect(screen.getByText('作り物の理念')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '自分軸・理念の操作' })).toBeNull();

    rerender(
      <Harness rows={rows()}>
        <YearRecord year={2025} part="review" />
      </Harness>,
    );
    expect(screen.getByText('2025年の目標の答え合わせ')).toBeTruthy();
    expect(screen.getByText('作り物の目標A')).toBeTruthy();
    expect(screen.queryByText('年末年始は上から順に進めます')).toBeNull();
    expect(screen.queryByText('逆算ロードマップ')).toBeNull();

    rerender(
      <Harness rows={rows()}>
        <YearRecord year={1999} part="nothing" />
      </Harness>,
    );
    expect(screen.getByRole('combobox', { name: 'どの年の記録か' }).value).toBe('2026');
    expect(screen.getByRole('tab', { name: 'アイスバーグ', selected: true })).toBeTruthy();
  });
});
