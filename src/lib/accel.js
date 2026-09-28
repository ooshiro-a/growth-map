// アクセル：自分軸・理念と動機の四象限（どちらも年ごとの種類。前の年の最後の姿を引き継ぐ）
import { recDate, opWord } from './labels.js';
import { KIND, LAYER, MOTIVE_QUADRANTS, motiveQuadrantId } from './schema.js';

// 図の並び・書く順（自分×見える／他者×見える／自分×見えない／他者×見えない）
export const QUADRANT_NAME = {
  [LAYER.SELF_VISIBLE]: '自分×見える',
  [LAYER.OTHER_VISIBLE]: '他者×見える',
  [LAYER.SELF_INVISIBLE]: '自分×見えない',
  [LAYER.OTHER_INVISIBLE]: '他者×見えない',
};

// 図の中心から見た向き（右＝自分、上＝見える）
export const QUADRANT_DIR = {
  [LAYER.SELF_VISIBLE]: [1, -1],
  [LAYER.OTHER_VISIBLE]: [-1, -1],
  [LAYER.SELF_INVISIBLE]: [1, 1],
  [LAYER.OTHER_INVISIBLE]: [-1, 1],
};

// 点数（0〜10）。ない時は null
export function scoreOf(e) {
  if (!e || e.value == null || e.value === '') return null;
  const n = Number(e.value);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
}

// 自分軸・理念（削除した項目も元の位置に灰色で残る）
export const axisOf = (model, year) => model.list(model.yearView(KIND.AXIS, year), 'L:');

// 動機の1年分：区分ごとの点数・中身と、前の年の点数（前の年に点数が1つもなければ null）
export function motiveYear(model, year) {
  const v = model.yearView(KIND.MOTIVE, year);
  const quads = MOTIVE_QUADRANTS.map((q) => {
    const scoreEntity = v.entities.get(motiveQuadrantId(q)) || null;
    return { q, name: QUADRANT_NAME[q], score: scoreOf(scoreEntity), scoreEntity, items: model.list(v, `L:${q}`) };
  });
  let prev = null;
  if (v.hasPrev) {
    const pv = model.yearView(KIND.MOTIVE, year - 1);
    const scores = {};
    for (const q of MOTIVE_QUADRANTS) scores[q] = scoreOf(pv.entities.get(motiveQuadrantId(q)));
    if (Object.values(scores).some((s) => s != null)) prev = scores;
  }
  return { quads, prev };
}

// 点数の日付：「26年12月20日に更新（6→7）」（前の年から引き継いだ時は、最後に変えた日）
export function scoreLine(e) {
  const c = e && e.valueChanges.length ? e.valueChanges[e.valueChanges.length - 1] : null;
  if (!c) return '点数はまだありません';
  return `${recDate(c.rec)}に${opWord(c.rec, KIND.MOTIVE, c)}`;
}
