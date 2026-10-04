// シート records の列（後から変えない。変える時は版を上げ、古い版も読めるようにする）
export const COLUMNS = [
  '記録日時', // A: GAS が書き込み時に付ける日本時間（ミリ秒まで・前の行より必ず後）
  '版', //       B
  '記録番号', // C: 1行ごとの番号（画面側で付ける。二重送信の除外・打ち消しの対象）
  '年', //       D: その記録が属する地図の年（年をまたぐ種類は空欄）
  '種類', //     E
  '項目番号', // F
  '親番号', //   G
  '操作', //     H
  '層・区分', // I
  '文言', //     J
  '状態・点数', // K
  '付記', //     L: JSON（after / undo / at / source / place / control / plan / when / freq / tactic）
];
export const NCOL = COLUMNS.length;

// この画面が読める版
export const SCHEMA_VERSION = 1;

export const KIND = {
  GOAL: '目標',
  PRINCIPLE: '指標',
  ICEBERG: 'アイスバーグ',
  BRAKE: 'ブレーキ',
  AXIS: '自分軸',
  MOTIVE: '動機',
  REVIEW: '振り返り',
  LONGTERM: '長期',
  MAP: 'マップ',
  SYSTEM: '仕組み',
};
export const KINDS = new Set(Object.values(KIND));

// 年ごとに1つ持ち、前の年の最後の姿を引き継ぐ種類
export const PER_YEAR_KINDS = new Set([KIND.ICEBERG, KIND.BRAKE, KIND.AXIS, KIND.MOTIVE]);

export const OP = {
  ADD: '追加',
  EDIT: '修正',
  SCORE: '採点',
  STATUS: '状態変更',
  DELETE: '削除',
  ACHIEVE: '達成',
  MISS: '未達',
  UNDO: '打ち消し',
  MOVE: '並べ替え',
  YEAR_START: '年開始',
};
export const OPS = new Set(Object.values(OP));

export const LAYER = {
  // アイスバーグ
  SKILL: 'skill',
  PLUS: 'plus',
  MINUS: 'minus',
  MIND: 'mind',
  // ブレーキ
  WORRY: 'worry',
  CHILD: 'child',
  // 動機の四象限
  SELF_VISIBLE: 'selfVisible',
  OTHER_VISIBLE: 'otherVisible',
  SELF_INVISIBLE: 'selfInvisible',
  OTHER_INVISIBLE: 'otherInvisible',
  // 振り返り（②と④。①は目標の達成/未達、③は翌年の目標）
  REVIEW: 'review',
  RESOLUTION: 'resolution',
  // 四半期（目標と振り返りの文章。年の目標は層が空）
  Q1: 'q1',
  Q2: 'q2',
  Q3: 'q3',
  Q4: 'q4',
  // 長期
  ROADMAP_WORK: 'roadmapWork',
  ROADMAP_PRIVATE: 'roadmapPrivate',
  PLAN_GOAL: 'planGoal',
  PLAN_MEANS: 'planMeans',
  // 動作確認（テスト用シートだけ）
  TRIAL: 'trial',
  ROUNDTRIP: 'roundtrip',
};

// 採点するアイスバーグの層（«マイナス»は点数に入れない）
export const SCORED_LAYERS = new Set([LAYER.SKILL, LAYER.PLUS, LAYER.MIND]);

export const MOTIVE_QUADRANTS = [
  LAYER.SELF_VISIBLE,
  LAYER.OTHER_VISIBLE,
  LAYER.SELF_INVISIBLE,
  LAYER.OTHER_INVISIBLE,
];
// 四半期の層（1Q＝1〜3月 … 4Q＝10〜12月）
export const quarterLayer = (q) => `q${q}`;
// 層が四半期なら 1〜4、ほかは null
export const quarterOfLayer = (layer) => (/^q[1-4]$/.test(layer || '') ? Number(layer[1]) : null);

// 区分の点数を持つ決まった番号（毎年同じ番号を使う）
export const motiveQuadrantId = (q) => `mv-${q}`;
// 振り返り②④（四半期の振り返りは層 q1〜q4）の決まった番号
export const reviewId = (year, layer) => `rv-${year}-${layer}`;

// 付記に書いてよい鍵
export const EXTRA_KEYS = ['after', 'undo', 'at', 'source', 'place', 'control', 'plan', 'when', 'freq', 'tactic'];
// 修正で書き換える属性（after / undo / at / source は修正では変えない）
export const ATTR_KEYS = ['place', 'control', 'plan', 'when', 'freq', 'tactic'];

export function parseExtra(s) {
  if (s == null || s === '') return {};
  if (typeof s === 'object') return { ...s };
  try {
    const v = JSON.parse(String(s));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function stringifyExtra(extra) {
  if (!extra) return '';
  const out = {};
  for (const k of EXTRA_KEYS) {
    if (extra[k] !== undefined && extra[k] !== null) out[k] = extra[k];
  }
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

const str = (v) => (v === undefined || v === null ? '' : String(v));

// 画面側の下書き → シートの1行（12列の文字列）
export function toRow(draft) {
  const row = new Array(NCOL).fill('');
  row[0] = str(draft.at);
  row[1] = str(draft.ver ?? SCHEMA_VERSION);
  row[2] = str(draft.no);
  row[3] = str(draft.year);
  row[4] = str(draft.kind);
  row[5] = str(draft.id);
  row[6] = str(draft.parent);
  row[7] = str(draft.op);
  row[8] = str(draft.layer);
  row[9] = str(draft.text);
  row[10] = str(draft.value);
  row[11] = typeof draft.extra === 'string' ? draft.extra : stringifyExtra(draft.extra);
  return row;
}

// シートの1行 → 記録
export function fromRow(row, index) {
  const r = Array.isArray(row) ? row : [];
  const cell = (i) => str(r[i]);
  const yearText = cell(3).trim();
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  return {
    index,
    at: cell(0),
    ver: Number(cell(1)) || 0,
    no: cell(2),
    year,
    kind: cell(4),
    id: cell(5),
    parent: cell(6),
    op: cell(7),
    layer: cell(8),
    text: cell(9),
    value: cell(10),
    extra: parseExtra(cell(11)),
  };
}
