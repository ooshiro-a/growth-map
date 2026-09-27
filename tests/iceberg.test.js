// アイスバーグ：言葉の置き場所・大きさ・引き継ぎ（試験の言葉は作り物）
import { beforeEach, describe, expect, it } from 'vitest';
import { buildModel } from '../src/lib/fold.js';
import { FIT, HIDE_RANK, ICEBERG_LAYERS, estimateWidth, icebergYear, layoutIceberg, shortLabel, tryLayout } from '../src/lib/iceberg.js';
import { r, resetNo } from './helpers.js';

beforeEach(resetNo);

const word = (id, label, stage = 1, deleted = false) => ({ id, label, stage: String(stage), deleted });
const specOf = (layers) => ({
  tip: '成果 0件',
  titles: { skill: '能力・スキル 10点', beh: 'ふるまい・習慣・行動 10点', mind: '意識・想い・人生哲学 10点' },
  pm: ['«プラス»', '«マイナス»'],
  layers: { skill: [], plus: [], minus: [], mind: [], ...layers },
});
const many = (prefix, n, stageOf = () => 2) =>
  Array.from({ length: n }, (_, i) => word(`${prefix}${i}`, shortLabel(`${prefix}の言葉その${i}番目`), stageOf(i)));

// 置いた言葉が三角形（と列）の中に収まり、重ならず、層の順に並んでいるか
function checkInside(L) {
  const eps = 0.01;
  const cx = L.W / 2;
  const boxes = [...L.words, ...L.chips];
  for (const b of boxes) {
    const hw = L.hw(b.y);
    expect(b.x).toBeGreaterThanOrEqual(cx - hw - eps);
    expect(b.x + b.w).toBeLessThanOrEqual(cx + hw + eps);
    expect(b.y + b.h).toBeLessThanOrEqual(L.H + eps);
    if (b.layer === 'plus') expect(b.x + b.w).toBeLessThanOrEqual(cx + eps);
    if (b.layer === 'minus') expect(b.x).toBeGreaterThanOrEqual(cx - eps);
    if (b.layer === 'skill') expect(b.y + b.h).toBeLessThanOrEqual(L.div1 + eps);
    if (b.layer === 'plus' || b.layer === 'minus') {
      expect(b.y).toBeGreaterThanOrEqual(L.colTop - eps);
      expect(b.y + b.h).toBeLessThanOrEqual(L.div2 + eps);
    }
    if (b.layer === 'mind') expect(b.y).toBeGreaterThanOrEqual(L.div2 - eps);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = a.x < b.x + b.w - eps && b.x < a.x + a.w - eps;
      const overlapY = a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
      expect(overlapX && overlapY).toBe(false);
    }
  }
}

// 「ほかN語」は、その層の言葉の後ろ（同じ行なら右、でなければ下の行）
function chipsLast(L) {
  for (const c of L.chips) {
    for (const w of L.words.filter((x) => x.layer === c.layer)) {
      expect(c.y > w.y || (c.y === w.y && c.x > w.x)).toBe(true);
    }
  }
}

describe('図に出す短い言葉', () => {
  it('「（」より前だけ。長ければ8文字ぶんで「…」', () => {
    expect(shortLabel('朝に歩く（週3回）')).toBe('朝に歩く');
    expect(shortLabel('朝に歩く(週3回)')).toBe('朝に歩く');
    expect(shortLabel('あいうえおかきくけこ')).toBe('あいうえおかき…');
    expect(shortLabel('ABCDEFGHIJKL')).toBe('ABCDEFGHIJKL'); // 半角は幅が狭い
    expect(shortLabel('（だけ）')).toBe('（だけ）');
  });
});

describe('言葉の置き場所', () => {
  it('ふつうの量はスマホ幅・本の比率・10.5px で全部入る', () => {
    const spec = specOf({ skill: many('能', 4), plus: many('プ', 6), minus: many('マ', 3), mind: many('意', 9) });
    const L = layoutIceberg({ width: 343, spec });
    expect(L.hidden).toEqual([]);
    expect(L.font).toBe(10.5);
    expect(L.H).toBe(Math.round(343 * 1.55));
    expect(L.words).toHaveLength(22);
    checkInside(L);
  });

  it('多いと図を伸ばし、文字を小さくし、最後は「ほかN語」にまとめる（目指すから先に）', () => {
    const spec = specOf({
      skill: many('能', 12, (i) => (i % 3) + 1),
      plus: many('プ', 16, (i) => (i % 3) + 1),
      minus: many('マ', 10),
      mind: many('意', 30, (i) => (i % 3) + 1),
    });
    const L = layoutIceberg({ width: 343, spec });
    expect(L.font).toBe(9.5);
    expect(L.hidden.length).toBeGreaterThan(0);
    expect(L.chips.length).toBeGreaterThan(0);
    checkInside(L);
    // 同じ層で、定着の言葉が隠れている時は、目指すの言葉も隠れている
    const hidden = new Set(L.hidden);
    for (const list of Object.values(spec.layers)) {
      const hidStage3 = list.some((w) => hidden.has(w.id) && w.stage === '3');
      const shownStage1 = list.some((w) => !hidden.has(w.id) && w.stage === '1');
      expect(hidStage3 && shownStage1).toBe(false);
    }
    chipsLast(L);
    // ほかN語の数と隠した数が合う
    expect(L.chips.reduce((n, c) => n + c.count, 0)).toBe(L.hidden.length);
  });

  it('まとめなくても入る言葉は戻す（あふれていない層はまとめない。同じ層では大事な方から）', () => {
    // 意識だけが多い時：能力・スキルと«マイナス»の言葉はまとめない（まとめても意識の言葉が増えないため）
    const one = specOf({ skill: many('能', 3, (i) => i + 1), plus: many('プ', 3, (i) => i + 1), minus: many('マ', 2), mind: many('意', 80, () => 3) });
    const L1 = layoutIceberg({ width: 343, spec: one });
    expect(L1.hidden.filter((id) => id.startsWith('意')).length).toBeGreaterThan(0);
    expect(L1.hidden.some((id) => id.startsWith('能') || id.startsWith('マ'))).toBe(false);
    checkInside(L1);
    chipsLast(L1);
    // «プラス»の列があふれる時に、言葉の多いほかの層の「目指す」を必要以上にまとめない
    for (const width of [288, 343, 382]) {
      const spec = specOf({
        skill: many('能', 16, () => 1),
        plus: many('プ', 18, () => 1),
        minus: many('マ', 5),
        mind: many('意', 30, () => 1),
      });
      const L = layoutIceberg({ width, spec });
      expect(L.hidden.length).toBeGreaterThan(0);
      checkInside(L);
      expect(L.chips.reduce((n, c) => n + c.count, 0)).toBe(L.hidden.length);
      chipsLast(L);
      // 各層で、隠れている中でいちばん大事な言葉は、戻すと入らない
      const H1 = Math.round(width * FIT.phone.r1);
      const font = FIT.phone.fonts[FIT.phone.fonts.length - 1];
      for (const layer of ICEBERG_LAYERS) {
        const hid = spec.layers[layer].filter((w) => L.hidden.includes(w.id));
        if (!hid.length) continue;
        const top = Math.max(...hid.map((w) => HIDE_RANK(w, layer)));
        for (const w of hid.filter((x) => HIDE_RANK(x, layer) === top)) {
          const less = new Set(L.hidden);
          less.delete(w.id);
          expect(tryLayout(width, H1, font, spec, estimateWidth, less)).toBeNull();
        }
      }
    }
  });

  it('削除した言葉は先にまとめる', () => {
    const spec = specOf({ mind: [...many('意', 40, () => 3), word('消', '消した言葉', 3, true)] });
    const L = layoutIceberg({ width: 300, spec });
    expect(L.hidden[0]).toBe('消');
  });

  it('空でも描ける。PC は横長の比率', () => {
    const L = layoutIceberg({ width: 343, spec: specOf({}) });
    expect(L.words).toHaveLength(0);
    const wide = layoutIceberg({ width: 470, spec: { ...specOf({ mind: many('意', 5) }), tip: '成果（結果）' }, fit: FIT.wide });
    expect(wide.H).toBe(Math.round(470 * 0.85));
    checkInside(wide);
  });

  it('同じ中身なら同じ置き方', () => {
    const spec = specOf({ skill: many('能', 5), mind: many('意', 12) });
    const a = layoutIceberg({ width: 343, spec });
    const b = layoutIceberg({ width: 343, spec });
    expect(b.words.map((w) => [w.id, w.x, w.y])).toEqual(a.words.map((w) => [w.id, w.x, w.y]));
  });
});

describe('1年分のアイスバーグ', () => {
  const ice = (o) => r({ kind: 'アイスバーグ', ...o });

  it('層ごとの点数と大きさ（«マイナス»と削除は数えない）・最後の変化', () => {
    const rows = [
      ice({ year: 2026, id: 'n1', op: '追加', layer: 'skill', text: '作り物の技', value: '2' }),
      ice({ year: 2026, id: 'n2', op: '追加', layer: 'minus', text: '作り物の癖' }),
      ice({ year: 2026, id: 'n3', op: '追加', layer: 'mind', text: '作り物の考え', value: '3' }),
      ice({ year: 2026, id: 'n4', op: '追加', layer: 'plus', text: '作り物の習慣', value: '1' }),
      ice({ year: 2026, id: 'n4', op: '削除' }),
      ice({ year: 2026, id: 'n1', op: '採点', value: '3' }),
    ];
    const d = icebergYear(buildModel(rows, [], { currentYear: 2026 }), 2026);
    expect(d.points).toEqual({ skill: 3, plus: 0, minus: 0, mind: 3 });
    expect(d.size).toBe(6);
    expect(d.prevSize).toBeNull();
    expect(d.lastChange).toMatchObject({ before: 5, after: 6 });
    expect(ICEBERG_LAYERS.map((l) => d.layers[l].length)).toEqual([1, 1, 1, 1]);
  });

  it('次の年は前の年の最後の姿を引き継ぎ、昨年末からの増減が出る', () => {
    const rows = [
      ice({ year: 2026, id: 'n1', op: '追加', layer: 'skill', text: '作り物の技', value: '1' }),
      ice({ year: 2026, id: 'n2', op: '追加', layer: 'mind', text: '作り物の考え', value: '2' }),
      ice({ year: 2027, id: 'n1', op: '採点', value: '3' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    const d = icebergYear(m, 2027);
    expect(d.prevSize).toBe(3);
    expect(d.size).toBe(5);
    expect(d.layers.skill[0].carried).toBe(true);
    expect(icebergYear(m, 2026).size).toBe(3);
  });

  it('成果：その年の目標で「達成」にしたものだけ', () => {
    const rows = [
      r({ kind: '目標', year: 2026, id: 'g1', op: '追加', text: '作り物の目標A' }),
      r({ kind: '目標', year: 2026, id: 'g2', op: '追加', text: '作り物の目標B' }),
      r({ kind: '目標', year: 2025, id: 'g0', op: '追加', text: '作り物の前の年の目標' }),
      r({ kind: '目標', year: 2026, id: 'g1', op: '達成' }),
      r({ kind: '目標', year: 2025, id: 'g0', op: '達成' }),
      r({ kind: '目標', year: 2026, id: 'g2', op: '未達' }),
    ];
    const d = icebergYear(buildModel(rows, [], { currentYear: 2026 }), 2026);
    expect(d.achieved.map((g) => g.text)).toEqual(['作り物の目標A']);
  });
});
