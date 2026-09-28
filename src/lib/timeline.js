// 年表：アイスバーグ成長年表の数字と図の置き場所（画面の部品はこの結果を描くだけ）
import { icebergYear } from './iceberg.js';

export const TIMELINE_YEARS = 5; // 直近5年。6年目からは古い年が左から外れる

// 年ごとの大きさ・増減・成果（記録のある最初の年〜今年のうち、直近5年）
export function growthYears(model, count = TIMELINE_YEARS) {
  return model.years.slice(-count).map((year) => {
    const d = icebergYear(model, year);
    return {
      year,
      size: d.size,
      delta: d.prevSize == null ? null : d.size - d.prevSize,
      achieved: d.achieved,
      lastChange: d.lastChange,
    };
  });
}

// 増減の書き方（＋5／−3／±0／—）
export function deltaText(delta) {
  if (delta == null) return '—';
  if (delta > 0) return `＋${delta}`;
  if (delta < 0) return `−${-delta}`;
  return '±0';
}

// ---------------------------------------------------------------- 図の置き場所
// 5つの枠を左から埋める。大きさ（点数）に比例させ、全部の年を同じ縮尺にする
// アイスバーグの高さと点の高さは、どちらも 0点で 0 から点数に比例して伸びる
export const CHART = {
  W: 300,
  H: 250,
  base: 224, // 横軸
  left: 14, // 縦軸
  x0: 44, // 1つ目の枠の真ん中
  step: 56, // 枠の間
  zeroDot: 208, // 0点の点の高さ
  top: 12, // 一番大きいアイスバーグの上の端
  gap: 7, // 点とアイスバーグの間
  maxH: 56, // 一番大きいアイスバーグの高さ
  ratio: 1.08, // 幅÷高さ
  tip: 0.24, // 水面の上（紺）の割合
};

export function chartLayout(years, c = CHART) {
  const max = Math.max(0, ...years.map((y) => y.size));
  const dotSpan = c.zeroDot - (c.top + c.maxH + c.gap); // 一番大きい年の点が上がる高さ
  return years.map((y, i) => {
    const t = max > 0 ? Math.max(0, y.size) / max : 0;
    const x = c.x0 + i * c.step;
    const dotY = c.zeroDot - t * dotSpan;
    const h = t * c.maxH;
    const bottom = dotY - c.gap;
    return {
      ...y,
      x,
      dotY,
      berg: h > 0 ? bergShape(x, bottom, h, c) : null,
    };
  });
}

// 1つのアイスバーグ：紺の先＋3層の青（上から順）と水面の線
function bergShape(x, bottom, h, c) {
  const w = h * c.ratio;
  const topY = bottom - h;
  const half = (y) => ((y - topY) / h) * (w / 2);
  const cuts = [topY, topY + h * c.tip];
  const rest = (h * (1 - c.tip)) / 3;
  for (let i = 1; i <= 3; i++) cuts.push(cuts[1] + rest * i);
  const pt = (px, py) => `${round(px)},${round(py)}`;
  const bands = [];
  for (let i = 0; i < 4; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    bands.push([pt(x - half(a), a), pt(x + half(a), a), pt(x + half(b), b), pt(x - half(b), b)].join(' '));
  }
  const water = cuts[1];
  const ext = half(water) + Math.max(2, w * 0.1);
  return {
    bands,
    outline: [pt(x, topY), pt(x + w / 2, bottom), pt(x - w / 2, bottom)].join(' '),
    water: { x1: round(x - ext), x2: round(x + ext), y: round(water) },
    topY,
  };
}

const round = (n) => Math.round(n * 10) / 10;
