// アイスバーグの図：言葉の置き場所を計算する（画面の部品はこの結果を描くだけ）
//
// 決まり（フェーズ0で決めた収まり方）
// - 図に出すのは「（」より前の部分で、幅8文字ぶんまで（はみ出す分は「…」。全文は押した時に出す）
// - 三角形のその高さに入る分だけ、1行ずつ詰める（後ろの短い言葉が前の行の空きに入ることがある）
// - 層の高さは中身に合わせて変わる
// - 入らなければ図の高さを伸ばす（スマホ：幅の1.55倍→1.85倍）→ 文字を小さくする → 「ほかN語」にまとめる
//   まとめる順：削除した言葉 → 目指す → «マイナス» → 実践中 → 定着（言葉の多い層から、後ろの言葉から）
//   まとめた後、まとめなくても入る言葉は戻す（あふれていない層の言葉は出す。同じ層の中では上の順を守る）
//   「ほかN語」は、その層の言葉の後ろに置く
import { KIND, LAYER, OP, SCORED_LAYERS } from './schema.js';

export const ICEBERG_LAYERS = [LAYER.SKILL, LAYER.PLUS, LAYER.MINUS, LAYER.MIND];

export const LAYER_NAME = {
  [LAYER.SKILL]: '能力・スキル',
  [LAYER.PLUS]: '«プラス»のふるまい',
  [LAYER.MINUS]: '«マイナス»のふるまい',
  [LAYER.MIND]: '意識・想い・人生哲学',
};

// ---------------------------------------------------------------- 文字の幅（目安）
// 画面では canvas で測る。測れない時（テストなど）はこの目安を使う
export function charEm(ch) {
  const c = ch.codePointAt(0);
  if (c === 0x20) return 0.3;
  if (c === 0xab || c === 0xbb) return 0.55; // « »
  if (c >= 0x30 && c <= 0x39) return 0.55;
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return 0.55;
  if (c < 0x80) return 0.35;
  if (c >= 0xff61 && c <= 0xff9f) return 0.5; // 半角カナ
  return 1;
}
export const textEm = (s) => [...String(s)].reduce((a, ch) => a + charEm(ch), 0);
export const estimateWidth = (text, px, bold = false) => textEm(text) * px * (bold ? 1.04 : 1);

// 図に出す短い言葉：「（」より前・幅8文字ぶんまで
export function shortLabel(text, capEm = 8) {
  const full = String(text || '').trim();
  const base = full.split(/[（(]/)[0].trim() || full;
  if (textEm(base) <= capEm) return base;
  let out = '';
  let w = 0;
  for (const ch of base) {
    if (w + charEm(ch) > capEm - 1) break;
    out += ch;
    w += charEm(ch);
  }
  return `${out}…`;
}

// ---------------------------------------------------------------- 1年分のアイスバーグ
// model（fold.js の buildModel）から、層ごとの言葉・点数・大きさ・成果を取り出す
export function icebergYear(model, year) {
  const v = model.yearView(KIND.ICEBERG, year);
  const layers = {};
  const points = {};
  for (const layer of ICEBERG_LAYERS) {
    layers[layer] = model.list(v, `L:${layer}`);
    points[layer] = SCORED_LAYERS.has(layer)
      ? layers[layer].reduce((s, e) => {
          const n = Number(e.value);
          return s + (!e.deletedRec && n >= 1 && n <= 3 ? n : 0);
        }, 0)
      : 0;
  }
  const size = v.endSize;
  const prevSize = v.hasPrev ? model.yearView(KIND.ICEBERG, year - 1).endSize : null;
  const lastChange = v.sizeChanges.length ? v.sizeChanges[v.sizeChanges.length - 1] : null;
  const goals = model.flat(KIND.GOAL);
  const achieved = model
    .list(goals, 'L:')
    .filter((g) => g.year === year && !g.deletedRec && g.result === OP.ACHIEVE);
  return { view: v, layers, points, size, prevSize, lastChange, achieved };
}

// ---------------------------------------------------------------- 置き場所の計算
const MARK = 11.6; // 採点の印（6px の丸＋線＋すき間）
const WORD_MARGIN = 6; // 言葉の左右のすき間の合計
const SLACK = 2; // 測った幅のずれの余裕
const CHIP_PAD = 10;
const EDGE = 4; // 斜めの辺からの余白
const GUTTER = 4; // 真ん中の縦線からの余白
const GAP = 3; // 横線の上下のすき間
const BOTTOM = 4;
const LINE = 1.45; // 行の高さ（文字の大きさの倍）

export const FIT = {
  phone: { r0: 1.55, r1: 1.85, fonts: [10.5, 10, 9.5] },
  wide: { r0: 0.85, r1: 1.3, fonts: [11.5, 11, 10.5] },
};

function geom(W, H) {
  const padH = EDGE * Math.sqrt(1 + (W / (2 * H)) ** 2); // 斜めの余白を横の長さに直したもの
  const hw = (y) => Math.min(W / 2, (W * Math.max(0, y)) / (2 * H));
  return {
    hw,
    padH,
    full: (y) => 2 * hw(y) - 2 * padH,
    half: (y) => hw(y) - padH - GUTTER,
    fitFull: (need) => ((need + 2 * padH) * H) / W,
    fitHalf: (need) => ((need + padH + GUTTER) * 2 * H) / W,
  };
}

// 1行ずつ詰める。items: [{key, w}]（並び順）。行ごとに [{item}] と y を返す
// 「ほかN語」は言葉を全部置いた後（最後の行の空き、なければ次の行）
function flow(items, y0, widthAt, fitAt, lh, limit) {
  let y = y0;
  let rest = items.slice();
  const lines = [];
  let guard = 0;
  while (rest.length) {
    if (++guard > 500 || y > limit) return { lines, end: Infinity };
    const avail = widthAt(y);
    const words = rest.filter((r) => !r.chip);
    const pool = words.length ? words : rest;
    const minW = Math.min(...pool.map((r) => r.w));
    if (minW > avail) {
      const ny = fitAt(minW);
      y = Math.max(y + 0.5, ny);
      continue;
    }
    const line = [];
    let used = 0;
    const put = (list) => {
      for (const r of list) {
        if (used + r.w <= avail) {
          line.push(r);
          used += r.w;
        }
      }
    };
    put(pool);
    if (pool === words && words.every((r) => line.includes(r))) put(rest.filter((r) => r.chip));
    rest = rest.filter((r) => !line.includes(r));
    lines.push({ y, items: line, used });
    y += lh;
  }
  return { lines, end: y };
}

// 細い列（«プラス»«マイナス»）は、入らずに下げた所にすき間ができる
// 行を下へ詰めて、すき間をなくす（下ほど幅が広いので、下げても入る）
function closeGaps(lines, lh) {
  const n = lines.length;
  if (!n) return lines;
  const end = lines[n - 1].y + lh;
  return lines.map((ln, i) => ({ ...ln, y: end - (n - i) * lh }));
}

// 決まった高さ H・文字の大きさ font で並べてみる（入らなければ null）
export function tryLayout(W, H, font, spec, measure, hidden) {
  const g = geom(W, H);
  const lh = font * LINE;
  const small = font - 1;
  const lhs = small * LINE;
  const limit = H - BOTTOM;
  const words = [];
  const chips = [];
  const labels = [];

  const itemsOf = (layer) => {
    const list = spec.layers[layer] || [];
    const shown = list.filter((w) => !hidden.has(w.id));
    const items = shown.map((w) => ({
      key: w.id,
      word: w,
      w: measure(w.label, font, false) + (layer === LAYER.MINUS ? 0 : MARK) + WORD_MARGIN + SLACK,
    }));
    const n = list.length - shown.length;
    if (n > 0) {
      const text = `ほか${n}語`;
      items.push({ key: `chip-${layer}`, chip: { layer, count: n, text }, w: measure(text, font - 0.5, false) + CHIP_PAD + WORD_MARGIN + SLACK });
    }
    return items;
  };

  // 並んだ行に x を付ける（center：行の中心の x）
  const place = (layer, lines, center) => {
    for (const ln of lines) {
      let x = center(ln.y) - ln.used / 2;
      for (const it of ln.items) {
        const box = { layer, x: x + WORD_MARGIN / 2, y: ln.y, w: it.w - WORD_MARGIN, h: lh };
        if (it.chip) chips.push({ ...box, ...it.chip });
        else words.push({ ...box, id: it.word.id, word: it.word });
        x += it.w;
      }
    }
  };
  const mid = () => W / 2;
  const leftMid = (y) => (W / 2 - g.hw(y) + g.padH + W / 2 - GUTTER) / 2;
  const rightMid = (y) => (W / 2 + GUTTER + W / 2 + g.hw(y) - g.padH) / 2;

  // 成果（水面の上）
  const tipW = measure(spec.tip, font, true);
  const tipY = Math.max(2, g.fitFull(tipW));
  labels.push({ key: 'tip', text: spec.tip, x: W / 2 - tipW / 2, y: tipY, w: tipW, h: lh, tip: true });
  const water = tipY + lh + GAP;

  // 能力・スキル
  let y = water + GAP + 2;
  const skW = measure(spec.titles.skill, font, true);
  y = Math.max(y, g.fitFull(skW));
  labels.push({ key: 'skill', text: spec.titles.skill, x: W / 2 - skW / 2, y, w: skW, h: lh });
  y += lh;
  const sk = flow(itemsOf(LAYER.SKILL), y, g.full, g.fitFull, lh, limit);
  if (!Number.isFinite(sk.end)) return null;
  place(LAYER.SKILL, sk.lines, mid);
  y = sk.lines.length ? sk.end : y + lh * 0.5;
  const div1 = y + GAP;
  y = div1 + GAP;

  // «プラス»｜«マイナス»
  const pl = measure(spec.pm[0], small, false);
  const pr = measure(spec.pm[1], small, false);
  y = Math.max(y, g.fitHalf(pl), g.fitHalf(pr));
  labels.push({ key: 'pmL', text: spec.pm[0], x: leftMid(y) - pl / 2, y, w: pl, h: lhs, small: true });
  labels.push({ key: 'pmR', text: spec.pm[1], x: rightMid(y) - pr / 2, y, w: pr, h: lhs, small: true });
  y += lhs;
  const dashed = y + GAP;
  y = dashed + GAP;

  // ふるまい・習慣・行動
  const bW = measure(spec.titles.beh, font, true);
  y = Math.max(y, g.fitFull(bW));
  labels.push({ key: 'beh', text: spec.titles.beh, x: W / 2 - bW / 2, y, w: bW, h: lh });
  y += lh;
  const colTop = y;
  const L = flow(itemsOf(LAYER.PLUS), y, g.half, g.fitHalf, lh, limit);
  const R = flow(itemsOf(LAYER.MINUS), y, g.half, g.fitHalf, lh, limit);
  if (!Number.isFinite(L.end) || !Number.isFinite(R.end)) return null;
  place(LAYER.PLUS, closeGaps(L.lines, lh), leftMid);
  place(LAYER.MINUS, closeGaps(R.lines, lh), rightMid);
  y = Math.max(L.lines.length ? L.end : 0, R.lines.length ? R.end : 0, colTop + lh * 0.5);
  const div2 = y + GAP;
  y = div2 + GAP;

  // 意識・想い・人生哲学
  const mW = measure(spec.titles.mind, font, true);
  y = Math.max(y, g.fitFull(mW));
  labels.push({ key: 'mind', text: spec.titles.mind, x: W / 2 - mW / 2, y, w: mW, h: lh });
  y += lh;
  const md = flow(itemsOf(LAYER.MIND), y, g.full, g.fitFull, lh, limit);
  if (!Number.isFinite(md.end)) return null;
  place(LAYER.MIND, md.lines, mid);
  const bottom = md.lines.length ? md.end : y;
  if (bottom > limit) return null;

  return {
    W,
    H,
    font,
    lh,
    small,
    hw: g.hw,
    water,
    div1,
    dashed,
    colTop,
    div2,
    words,
    chips,
    labels,
    hidden: [...hidden],
  };
}

// 「ほかN語」にまとめる言葉を1つ選ぶ
export const HIDE_RANK = (w, layer) => {
  if (w.deleted) return 0;
  if (layer === LAYER.MINUS) return 2;
  const s = Number(w.stage);
  if (s === 1) return 1;
  if (s === 2) return 3;
  return 4;
};
function pickToHide(spec, hidden) {
  let best = null;
  for (const layer of ICEBERG_LAYERS) {
    const list = spec.layers[layer] || [];
    const visible = list.filter((w) => !hidden.has(w.id)).length;
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];
      if (hidden.has(w.id)) continue;
      const cand = { id: w.id, rank: HIDE_RANK(w, layer), visible };
      if (!best || cand.rank < best.rank || (cand.rank === best.rank && cand.visible > best.visible)) best = cand;
    }
  }
  return best ? best.id : null;
}
const rankOf = (spec) => {
  const rank = new Map();
  const layerOf = new Map();
  for (const layer of ICEBERG_LAYERS) {
    for (const w of spec.layers[layer] || []) {
      rank.set(w.id, HIDE_RANK(w, layer));
      layerOf.set(w.id, layer);
    }
  }
  return { rank, layerOf };
};

// spec: { tip, titles: {skill, beh, mind}, pm: [左, 右], layers: {skill: [{id, label, stage, deleted}], ...} }
export function layoutIceberg({ width, spec, measure = estimateWidth, fit = FIT.phone }) {
  const W = Math.max(160, Math.round(width));
  const H0 = Math.round(W * fit.r0);
  const H1 = Math.round(W * fit.r1);
  const step = Math.max(2, Math.round(W / 100));
  const none = new Set();

  // 1. 高さを伸ばす → 2. 文字を小さくする
  for (const font of fit.fonts) {
    for (let H = H0; H <= H1; H += step) {
      const L = tryLayout(W, H, font, spec, measure, none);
      if (L) return L;
    }
  }
  // 3. 「ほかN語」にまとめる（いちばん小さい文字・いちばん高い図で入るまで）
  const font = fit.fonts[fit.fonts.length - 1];
  const hidden = new Set();
  const order = [];
  const inOrder = (x) => ({ ...x, hidden: order.filter((id) => hidden.has(id)) }); // まとめた順に並べる
  let L = null;
  for (;;) {
    const id = pickToHide(spec, hidden);
    if (!id) break;
    hidden.add(id);
    order.push(id);
    L = tryLayout(W, H1, font, spec, measure, hidden);
    if (L) break;
  }
  if (L) {
    // まとめなくても入る言葉は戻す（あふれていない層の言葉までまとめたままにしない）
    // 戻す順は大事な方から（まとめた順の逆）。同じ層で戻せない言葉が残ったら、それより大事でない言葉は戻さない
    const { rank, layerOf } = rankOf(spec);
    const blocked = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const layer = layerOf.get(id);
      if (rank.get(id) < (blocked.get(layer) ?? -Infinity)) continue;
      hidden.delete(id);
      const back = tryLayout(W, H1, font, spec, measure, hidden);
      if (back) L = back;
      else {
        hidden.add(id);
        blocked.set(layer, Math.max(blocked.get(layer) ?? -Infinity, rank.get(id)));
      }
    }
    // 入った中でいちばん低い図にする
    for (let H = H0; H < H1; H += step) {
      const lower = tryLayout(W, H, font, spec, measure, hidden);
      if (lower) return inOrder(lower);
    }
    return inOrder(L);
  }
  // 4. それでも入らない時（見出しだけで溢れる細い幅など）：入るまで高さを伸ばす
  for (let H = H1; H <= W * 6; H += step * 4) {
    const last = tryLayout(W, H, font, spec, measure, hidden);
    if (last) return inOrder(last);
  }
  return null;
}
