// 行（積み上げた記録）から「今の姿」と「過去の年の姿」を組み立てる
//
// 決まり
// - 行の順番＝シートの行の順（GAS が鍵をかけて足した順）。端末の時計は使わない
// - 記録番号が同じ行は最初の1行だけ使う（送り直しの重なり）
// - 打ち消し：付記.undo で指した記録を無効にする（打ち消しの打ち消しは元に戻る）
// - 1行は変わった所だけを表す（追加＝全部、修正＝文言と属性、採点・状態変更＝点数/状態だけ）
// - 削除より後の行は履歴にだけ残し、姿は変えない
// - 年ごとの種類：Y年の姿＝前の年の最後の姿（削除・外せたブレーキを除く）＋年＝Y の行
import {
  ATTR_KEYS,
  KIND,
  KINDS,
  OP,
  OPS,
  PER_YEAR_KINDS,
  SCHEMA_VERSION,
  SCORED_LAYERS,
  fromRow,
} from './schema.js';

const FIXED_ID = /^(mv|rv)-/; // 追加の行がなくても作る決まった番号（動機の区分・振り返り②④）
const TREE_KINDS = new Set([KIND.MAP, KIND.LONGTERM]);

export const keyOf = (kind, id) => `${kind}\u0001${id}`;

// ---------------------------------------------------------------- 行の読み込み
export function parseRecords(rows = [], pendingRows = []) {
  const records = [];
  const seen = new Set();
  let unsupported = false;
  const push = (row, pending) => {
    const rec = fromRow(row, records.length);
    if (!rec.no || seen.has(rec.no)) return;
    seen.add(rec.no);
    rec.pending = pending;
    if (rec.ver > SCHEMA_VERSION) unsupported = true;
    records.push(rec);
  };
  rows.forEach((r) => push(r, false));
  pendingRows.forEach((r) => push(r, true));
  return { records, unsupported };
}

// ---------------------------------------------------------------- 打ち消し
function computeEffective(records) {
  const byNo = new Map(records.map((r) => [r.no, r]));
  const undoersOf = new Map();
  for (const r of records) {
    if (r.op !== OP.UNDO) continue;
    const target = typeof r.extra.undo === 'string' ? byNo.get(r.extra.undo) : null;
    if (!target || target.index >= r.index) continue; // 前の記録しか打ち消せない
    if (!undoersOf.has(target.no)) undoersOf.set(target.no, []);
    undoersOf.get(target.no).push(r);
  }
  const memo = new Map();
  const effective = (rec) => {
    if (memo.has(rec.no)) return memo.get(rec.no);
    const v = !(undoersOf.get(rec.no) || []).some((u) => effective(u));
    memo.set(rec.no, v);
    return v;
  };
  return effective;
}

// ---------------------------------------------------------------- 並び順（付記.after）
class Order {
  constructor(src) {
    this.groups = new Map();
    this.where = new Map();
    if (src) {
      for (const [k, v] of src.groups) this.groups.set(k, v.slice());
      for (const [k, v] of src.where) this.where.set(k, v);
    }
  }
  static keyFor(e) {
    return e.parent ? `P:${e.parent}` : `L:${e.layer || ''}`;
  }
  list(key) {
    if (!this.groups.has(key)) this.groups.set(key, []);
    return this.groups.get(key);
  }
  insert(key, id, after) {
    const list = this.list(key);
    if (after === undefined || after === null) list.push(id);
    else if (after === '') list.unshift(id);
    else {
      const i = list.indexOf(after);
      if (i < 0) list.push(id);
      else list.splice(i + 1, 0, id);
    }
    this.where.set(id, key);
  }
  remove(id) {
    const key = this.where.get(id);
    if (key === undefined) return;
    const list = this.list(key);
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    this.where.delete(id);
  }
  keep(ids) {
    for (const [k, list] of this.groups) this.groups.set(k, list.filter((id) => ids.has(id)));
    for (const id of [...this.where.keys()]) if (!ids.has(id)) this.where.delete(id);
  }
  ids(key) {
    return (this.groups.get(key) || []).slice();
  }
}

// ---------------------------------------------------------------- 項目
const pickAttrs = (extra) => {
  const out = {};
  for (const k of ATTR_KEYS) if (extra[k] !== undefined) out[k] = extra[k];
  return out;
};
const valueOf = (v) => (v === '' || v === undefined ? null : v);

function createEntity(rec) {
  return {
    id: rec.id,
    kind: rec.kind,
    layer: rec.layer,
    parent: rec.parent,
    year: rec.year,
    text: rec.op === OP.ADD ? rec.text : '',
    value: rec.op === OP.ADD ? valueOf(rec.value) : null,
    result: null,
    attrs: rec.op === OP.ADD ? pickAttrs(rec.extra) : {},
    createdRec: rec,
    addedAt: rec.extra.at || rec.at,
    lastRec: rec,
    deletedRec: null,
    history: [],
    valueChanges: [], // [{rec, before, after}]
    carried: false,
    yearLastRec: null, // 年ごとの種類：その年の最後の変化
  };
}

function cloneEntity(e) {
  return {
    ...e,
    attrs: { ...e.attrs },
    history: e.history.slice(),
    valueChanges: e.valueChanges.slice(),
  };
}

// 1行を当てはめる。姿が変わったら true
function applyToEntity(e, rec) {
  e.history.push(rec);
  if (e.deletedRec) return false; // 削除より後は履歴だけ
  switch (rec.op) {
    case OP.ADD:
    case OP.EDIT:
      // 2回目の追加は修正として扱う
      if (rec.op === OP.ADD && e.createdRec === rec) break;
      e.text = rec.text;
      Object.assign(e.attrs, pickAttrs(rec.extra));
      break;
    case OP.SCORE:
    case OP.STATUS: {
      if (e.kind === KIND.GOAL && rec.op === OP.STATUS) {
        e.result = valueOf(rec.value);
        break;
      }
      const before = e.value;
      e.value = valueOf(rec.value);
      if (before !== e.value) e.valueChanges.push({ rec, before, after: e.value });
      break;
    }
    case OP.ACHIEVE:
      e.result = OP.ACHIEVE;
      break;
    case OP.MISS:
      e.result = OP.MISS;
      break;
    case OP.DELETE:
      e.deletedRec = rec;
      break;
    case OP.MOVE:
      if (rec.parent) e.parent = rec.parent;
      if (rec.layer) e.layer = rec.layer;
      break;
    default:
      return false;
  }
  e.lastRec = rec;
  e.yearLastRec = rec;
  return true;
}

// 項目の集まり（1つの種類・1つの年）に行を当てはめる
function applyRecord(state, rec) {
  const { entities, order } = state;
  let e = entities.get(rec.id);
  const fixed = FIXED_ID.test(rec.id);
  if (!e) {
    if (rec.op !== OP.ADD && !fixed) return false; // 追加のない項目への行は使わない
    e = createEntity(rec);
    entities.set(rec.id, e);
    // 決まった番号（動機の区分の点数・振り返り②④）は並びに入れない
    if (!fixed) order.insert(Order.keyFor(e), e.id, rec.op === OP.ADD ? rec.extra.after : undefined);
    applyToEntity(e, rec);
    return true;
  }
  if (rec.op === OP.MOVE && !e.deletedRec && !fixed) {
    // 自分の下（子孫）へは移さない（2台で逆向きに移した時など）
    if (rec.parent && wouldCycle(entities, e.id, rec.parent)) {
      e.history.push(rec);
      return false;
    }
    order.remove(e.id);
    applyToEntity(e, rec);
    order.insert(Order.keyFor(e), e.id, rec.extra.after);
    return true;
  }
  return applyToEntity(e, rec);
}

function wouldCycle(entities, id, newParent) {
  let cur = newParent;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    if (cur === id) return true;
    seen.add(cur);
    const p = entities.get(cur);
    cur = p ? p.parent : '';
  }
  return false;
}

// ---------------------------------------------------------------- アイスバーグの大きさ
export function icebergSize(entities) {
  let sum = 0;
  for (const e of entities.values()) {
    if (e.deletedRec || !SCORED_LAYERS.has(e.layer)) continue;
    const n = Number(e.value);
    if (n >= 1 && n <= 3) sum += n;
  }
  return sum;
}

const carryable = (e) => !e.deletedRec && !(e.kind === KIND.BRAKE && e.value === 'released');

// ---------------------------------------------------------------- 組み立て
export function buildModel(rows = [], pendingRows = [], { currentYear } = {}) {
  const { records, unsupported } = parseRecords(rows, pendingRows);
  const effective = computeEffective(records);

  const usable = (r) =>
    r.ver >= 1 &&
    r.ver <= SCHEMA_VERSION &&
    KINDS.has(r.kind) &&
    OPS.has(r.op) &&
    r.op !== OP.UNDO &&
    r.op !== OP.YEAR_START &&
    r.id !== '' &&
    effective(r);

  const unknown = records.filter(
    (r) => r.ver <= SCHEMA_VERSION && (!KINDS.has(r.kind) || !OPS.has(r.op)),
  ).length;

  // 種類ごとに使う行
  const byKind = new Map();
  for (const r of records) {
    if (!usable(r)) continue;
    if (!byKind.has(r.kind)) byKind.set(r.kind, []);
    byKind.get(r.kind).push(r);
  }

  // 履歴（打ち消した行・打ち消しの行も含めて全部）
  const historyIndex = new Map();
  for (const r of records) {
    if (!r.id) continue;
    const k = keyOf(r.kind, r.id);
    if (!historyIndex.has(k)) historyIndex.set(k, []);
    historyIndex.get(k).push(r);
  }

  // 年の範囲（年ごとの種類の最も古い年〜今年）
  let minYear = currentYear ?? null;
  for (const r of records) {
    if (PER_YEAR_KINDS.has(r.kind) && r.year != null && (minYear == null || r.year < minYear)) {
      minYear = r.year;
    }
  }
  const lastYear = currentYear ?? minYear;
  const years = [];
  if (minYear != null && lastYear != null) for (let y = minYear; y <= lastYear; y++) years.push(y);

  // 年をまたぐ種類（目標・指標・振り返り・長期・マップ・仕組み）
  const flatMemo = new Map();
  function flat(kind) {
    if (flatMemo.has(kind)) return flatMemo.get(kind);
    const state = { entities: new Map(), order: new Order() };
    for (const r of byKind.get(kind) || []) applyRecord(state, r);
    flatMemo.set(kind, state);
    return state;
  }

  // 年ごとの種類
  const yearMemo = new Map();
  function yearView(kind, year) {
    const k = `${kind}\u0001${year}`;
    if (yearMemo.has(k)) return yearMemo.get(k);
    let prev = null;
    if (minYear != null && year > minYear) prev = yearView(kind, year - 1);
    const state = { entities: new Map(), order: new Order(prev ? prev.order : null) };
    if (prev) {
      for (const e of prev.entities.values()) {
        if (!carryable(e)) continue;
        const c = cloneEntity(e);
        c.carried = true;
        c.yearLastRec = null;
        state.entities.set(c.id, c);
      }
      state.order.keep(new Set(state.entities.keys()));
    }
    const startSize = icebergSize(state.entities);
    const sizeChanges = [];
    let size = startSize;
    for (const r of byKind.get(kind) || []) {
      if (r.year !== year) continue;
      const changed = applyRecord(state, r);
      if (changed && kind === KIND.ICEBERG) {
        const next = icebergSize(state.entities);
        if (next !== size) sizeChanges.push({ rec: r, before: size, after: next });
        size = next;
      }
    }
    const view = {
      kind,
      year,
      entities: state.entities,
      order: state.order,
      startSize,
      endSize: kind === KIND.ICEBERG ? size : null,
      sizeChanges,
      hasPrev: !!prev,
    };
    yearMemo.set(k, view);
    return view;
  }

  function view(kind, year) {
    return PER_YEAR_KINDS.has(kind) ? yearView(kind, year) : flat(kind);
  }

  // 並んだ項目（削除した項目も元の位置に灰色で残る）
  function list(v, key) {
    return v.order
      .ids(key)
      .map((id) => v.entities.get(id))
      .filter(Boolean);
  }

  // 木（マップ・長期）：親が削除なら子も灰色。親が見つからない項目は出さない
  function deletedInfo(v, e) {
    let cur = e;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.deletedRec) return { rec: cur.deletedRec, inherited: cur !== e };
      if (!cur.parent || !TREE_KINDS.has(cur.kind)) return null;
      cur = v.entities.get(cur.parent);
    }
    return null;
  }

  return {
    records,
    unsupported,
    unknown,
    currentYear,
    years,
    minYear,
    isEffective: effective,
    view,
    yearView,
    flat,
    list,
    deletedInfo,
    historyOf: (kind, id) => historyIndex.get(keyOf(kind, id)) || [],
  };
}
