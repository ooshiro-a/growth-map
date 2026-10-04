// 振り返り・長期：model（fold.js の buildModel）から取り出す
import { jstParts } from './dates.js';
import { KIND, LAYER, OP, reviewId } from './schema.js';

// 最初に選ぶ年：1月は前の年（年明けに前の年の分を書く）、2月からは今年
export function defaultReviewYear(nowMs) {
  const p = jstParts(nowMs);
  if (!p) return null;
  return p.month === 1 ? p.year - 1 : p.year;
}

// ---------------------------------------------------------------- 四半期（1Q＝1〜3月）
export const QUARTERS = [1, 2, 3, 4];
export const QUARTER_MONTHS = { 1: '1〜3月', 2: '4〜6月', 3: '7〜9月', 4: '10〜12月' };

// 今の四半期（日本時間）
export function currentQuarter(nowMs) {
  const p = jstParts(nowMs);
  if (!p) return null;
  return { year: p.year, q: Math.ceil(p.month / 3) };
}

// 最初に選ぶ四半期：四半期の最初の月（1・4・7・10月）は前の四半期（終わった分を振り返る）、ほかは今の四半期
// 年は defaultReviewYear と同じになる（1月は前の年の4Q）
export function defaultQuarter(nowMs) {
  const p = jstParts(nowMs);
  if (!p) return null;
  const q = Math.ceil(p.month / 3);
  if (p.month % 3 !== 1) return { year: p.year, q };
  return q === 1 ? { year: p.year - 1, q: 4 } : { year: p.year, q: q - 1 };
}

// 次の四半期（4Q の次は翌年の1Q）
export const nextQuarter = (year, q) => (q === 4 ? { year: year + 1, q: 1 } : { year, q: q + 1 });

// 振り返りの画面で最初に出す方：年末年始（12・1月）は年の振り返り、ほかは四半期
export function defaultReviewMode(nowMs) {
  const p = jstParts(nowMs);
  return p && p.month !== 12 && p.month !== 1 ? 'quarter' : 'year';
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
// layer：''＝年の目標、q1〜q4＝その四半期の目標（年の目標とは並びの組が分かれていて混ざらない）
export function goalsOf(model, year, layer = '') {
  return model.list(model.flat(KIND.GOAL), `L:${layer}`).filter((g) => g.year === year);
}

// 答え合わせの件数（削除した目標は数えない）
export function goalCounts(goals) {
  const live = goals.filter((g) => !g.deletedRec);
  const achieved = live.filter((g) => g.result === OP.ACHIEVE).length;
  const missed = live.filter((g) => g.result === OP.MISS).length;
  return { achieved, missed, open: live.length - achieved - missed };
}

// 次の四半期へ写す未達の目標：削除していない未達のうち、写す先に同じ文言がまだないもの
// 写す元に同じ文言が2つあっても、写すのは最初の1つだけ
export function missedToCarry(goals, target) {
  const have = new Set(target.filter((g) => !g.deletedRec).map((g) => g.text.trim()));
  const out = [];
  for (const g of goals) {
    const t = g.text.trim();
    if (g.deletedRec || g.result !== OP.MISS || have.has(t)) continue;
    have.add(t);
    out.push(g);
  }
  return out;
}

// 振り返り②（review）・④（resolution）、四半期の振り返り（q1〜q4）。まだ書いていなければ null
export function reviewEntry(model, year, layer) {
  return model.flat(KIND.REVIEW).entities.get(reviewId(year, layer)) || null;
}

// ホームの道のり：書いた振り返り（四半期 q1〜q4 と年の②）を古い順に。1つの期は1点
// 同じ年は 1Q→4Q→年の振り返り の順。文言が空・削除したものは数えない
const STEP_ID = /^rv-(\d{4})-(q[1-4]|review)$/;
export function reviewSteps(model) {
  const out = [];
  for (const [id, e] of model.flat(KIND.REVIEW).entities) {
    const m = STEP_ID.exec(id);
    if (!m || e.deletedRec || !String(e.text || '').trim()) continue;
    const year = Number(m[1]);
    const q = m[2] === 'review' ? null : Number(m[2][1]);
    out.push({ id, year, q, label: `${String(year).slice(-2)}年${q ? `${q}Q` : ''}の振り返り` });
  }
  return out.sort((a, b) => a.year - b.year || (a.q || 5) - (b.q || 5));
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
