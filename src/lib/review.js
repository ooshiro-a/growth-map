// 振り返り・長期：model（fold.js の buildModel）から取り出す
import { jstParts } from './dates.js';
import { KIND, LAYER, OP, reviewId } from './schema.js';

// 最初に選ぶ年：1月は前の年（年明けに前の年の分を書く）、2月からは今年
export function defaultReviewYear(nowMs) {
  const p = jstParts(nowMs);
  if (!p) return null;
  return p.month === 1 ? p.year - 1 : p.year;
}

// 書けるのは今年と前の年の分だけ。それより前は見るだけ
export const canWriteReview = (year, currentYear) => currentYear != null && year >= currentYear - 1 && year <= currentYear;

// 選べる年（新しい順）：記録のある最初の年〜今年
export function reviewYears(model, currentYear, extra = null) {
  let min = currentYear;
  const see = (y) => {
    if (y != null && y <= currentYear && y < min) min = y;
  };
  see(model.minYear);
  see(extra);
  for (const r of model.records) if ((r.kind === KIND.GOAL || r.kind === KIND.REVIEW) && r.year != null) see(r.year);
  const out = [];
  for (let y = currentYear; y >= min; y--) out.push(y);
  return out;
}

// その年の目標（削除した目標も元の位置に灰色で残る）
export function goalsOf(model, year) {
  return model.list(model.flat(KIND.GOAL), 'L:').filter((g) => g.year === year);
}

// 答え合わせの件数（削除した目標は数えない）
export function goalCounts(goals) {
  const live = goals.filter((g) => !g.deletedRec);
  const achieved = live.filter((g) => g.result === OP.ACHIEVE).length;
  const missed = live.filter((g) => g.result === OP.MISS).length;
  return { achieved, missed, open: live.length - achieved - missed };
}

// 振り返り②（review）・④（resolution）。まだ書いていなければ null
export function reviewEntry(model, year, layer) {
  return model.flat(KIND.REVIEW).entities.get(reviewId(year, layer)) || null;
}

// ---------------------------------------------------------------- 長期（年をまたぐ）
export const ROADMAP_PARTS = [
  { layer: LAYER.ROADMAP_WORK, label: '仕事面' },
  { layer: LAYER.ROADMAP_PRIVATE, label: 'プライベート面' },
];

// 逆算ロードマップの1つの面
export function roadmapItems(model, layer) {
  return model.list(model.flat(KIND.LONGTERM), `L:${layer}`);
}

// アクションプラン：目標ごとに手段を並べる。手段の削除は親の目標の削除も含める
export function actionPlan(model) {
  const v = model.flat(KIND.LONGTERM);
  return model.list(v, `L:${LAYER.PLAN_GOAL}`).map((goal) => ({
    goal,
    means: model
      .list(v, `P:${goal.id}`)
      .filter((m) => m.layer === LAYER.PLAN_MEANS)
      .map((m) => ({ e: m, deleted: model.deletedInfo(v, m) })),
  }));
}
