// 初期データ（growth-map-seed/1）の取り込み：確かめて、足す行（下書き）にする
// - 追加日は取り込んだ日（記録日時は GAS が付ける）
// - 付記に source: 'seed' を付ける（年明けに前の年の分を入れても断られないように・二重取り込みの確認）
// - 並び順は JSON の順（そのまま末尾に足していく）
import { newId } from './ids.js';
import { KIND, LAYER, MOTIVE_QUADRANTS, OP, motiveQuadrantId } from './schema.js';

export const SEED_FORMAT = 'growth-map-seed/1';
const MAX_TEXT = 300;

const TOP_KEYS = ['format', 'year', 'goals', 'principles', 'iceberg', 'axis', 'motives', 'brakes'];
const ICEBERG_KEYS = ['layer', 'text', 'stage'];
const BRAKE_KEYS = ['kind', 'text', 'place', 'control', 'status'];
const MOTIVE_KEYS = ['score', 'items'];
const ICEBERG_LAYERS = [LAYER.SKILL, LAYER.PLUS, LAYER.MINUS, LAYER.MIND];

// JSON の文字 → { ok, seed, errors[] }
export function parseSeed(text) {
  let data;
  try {
    data = JSON.parse(String(text || '').replace(/^﻿/, ''));
  } catch {
    return { ok: false, errors: ['JSON として読めません（貼り付けが途中で切れていないか確かめてください）'] };
  }
  const errors = validateSeed(data);
  return errors.length ? { ok: false, errors } : { ok: true, seed: data };
}

export function validateSeed(s) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['形が正しくありません（{ } で囲まれた JSON が必要です）'];
  const extraKeys = (obj, keys, where) => {
    const bad = Object.keys(obj).filter((k) => !keys.includes(k));
    if (bad.length) err(`${where}に知らない項目があります：${bad.join('、')}`);
  };
  const text = (v, where) => {
    if (typeof v !== 'string' || !v.trim()) err(`${where}：文言が空です`);
    else if (v.trim().length > MAX_TEXT) err(`${where}：文言が長すぎます（${MAX_TEXT}字まで）`);
  };
  const list = (key, label) => {
    if (s[key] === undefined) return [];
    if (!Array.isArray(s[key])) {
      err(`${label}（${key}）は [ ] の並びにしてください`);
      return [];
    }
    return s[key];
  };

  extraKeys(s, TOP_KEYS, '一番上');
  if (s.format !== SEED_FORMAT) err(`format が "${SEED_FORMAT}" ではありません`);
  if (!Number.isInteger(s.year) || s.year < 2000 || s.year > 2100) err('year は 2026 のような年の数にしてください');

  list('goals', '今年の目標').forEach((t, i) => text(t, `今年の目標 ${i + 1}番目`));
  list('principles', '指標').forEach((t, i) => text(t, `指標 ${i + 1}番目`));
  list('axis', '自分軸・理念').forEach((t, i) => text(t, `自分軸・理念 ${i + 1}番目`));

  list('iceberg', 'アイスバーグ').forEach((w, i) => {
    const where = `アイスバーグ ${i + 1}番目`;
    if (!w || typeof w !== 'object' || Array.isArray(w)) return err(`${where}：形が正しくありません`);
    extraKeys(w, ICEBERG_KEYS, `${where}：`);
    if (!ICEBERG_LAYERS.includes(w.layer)) err(`${where}：layer は skill／plus／minus／mind のどれかです`);
    text(w.text, where);
    if (w.layer === LAYER.MINUS) {
      if (w.stage !== undefined && w.stage !== null) err(`${where}：«マイナス»には stage を付けません`);
    } else if (![1, 2, 3].includes(w.stage)) err(`${where}：stage は 1（目指す）／2（実践中）／3（定着）です`);
  });

  if (s.motives !== undefined) {
    if (!s.motives || typeof s.motives !== 'object' || Array.isArray(s.motives)) err('動機（motives）の形が正しくありません');
    else {
      extraKeys(s.motives, MOTIVE_QUADRANTS, '動機（motives）');
      for (const q of MOTIVE_QUADRANTS) {
        const m = s.motives[q];
        if (m === undefined) continue;
        if (!m || typeof m !== 'object' || Array.isArray(m)) {
          err(`動機 ${q}：形が正しくありません`);
          continue;
        }
        extraKeys(m, MOTIVE_KEYS, `動機 ${q}：`);
        if (m.score !== null && m.score !== undefined && !(Number.isInteger(m.score) && m.score >= 0 && m.score <= 10)) {
          err(`動機 ${q}：score は 0〜10 の数か null です`);
        }
        if (m.items !== undefined && !Array.isArray(m.items)) err(`動機 ${q}：items は [ ] の並びにしてください`);
        else (m.items || []).forEach((t, i) => text(t, `動機 ${q} ${i + 1}番目`));
      }
    }
  }

  list('brakes', 'ブレーキ').forEach((b, i) => {
    const where = `ブレーキ ${i + 1}番目`;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return err(`${where}：形が正しくありません`);
    extraKeys(b, BRAKE_KEYS, `${where}：`);
    if (![LAYER.WORRY, LAYER.CHILD].includes(b.kind)) err(`${where}：kind は worry（悩み）／child（大きな子ども）です`);
    text(b.text, where);
    if (b.place !== undefined && !['fork', 'road'].includes(b.place)) err(`${where}：place は fork／road です`);
    if (b.control !== undefined && !['can', 'cannot'].includes(b.control)) err(`${where}：control は can／cannot です`);
    if (b.kind === LAYER.CHILD && (b.place !== undefined || b.control !== undefined)) err(`${where}：大きな子どもには place／control を付けません`);
    if (b.status !== undefined && !['facing', 'released'].includes(b.status)) err(`${where}：status は facing／released です`);
  });

  return errors;
}

// 確かめた初期データ → 下書きの並び
export function seedDrafts(seed, makeId = newId) {
  const year = seed.year;
  const src = { source: 'seed' };
  const out = [];
  const add = (d) => out.push({ op: OP.ADD, id: makeId(), extra: src, ...d });
  (seed.goals || []).forEach((t) => add({ year, kind: KIND.GOAL, text: t.trim() }));
  (seed.principles || []).forEach((t) => add({ year: '', kind: KIND.PRINCIPLE, text: t.trim() }));
  (seed.iceberg || []).forEach((w) =>
    add({ year, kind: KIND.ICEBERG, layer: w.layer, text: w.text.trim(), value: w.layer === LAYER.MINUS ? '' : String(w.stage) }),
  );
  (seed.axis || []).forEach((t) => add({ year, kind: KIND.AXIS, text: t.trim() }));
  const motives = seed.motives || {};
  for (const q of MOTIVE_QUADRANTS) {
    const m = motives[q];
    if (!m) continue;
    (m.items || []).forEach((t) => add({ year, kind: KIND.MOTIVE, layer: q, text: t.trim() }));
    if (Number.isInteger(m.score)) {
      out.push({ year, kind: KIND.MOTIVE, id: motiveQuadrantId(q), op: OP.SCORE, layer: q, value: String(m.score), extra: src });
    }
  }
  (seed.brakes || []).forEach((b) => {
    const extra = { ...src };
    if (b.place) extra.place = b.place;
    if (b.control) extra.control = b.control;
    add({ year, kind: KIND.BRAKE, layer: b.kind, text: b.text.trim(), value: b.status || 'facing', extra });
  });
  return out;
}

// 件数の一覧（取り込む前に見せる）
export function seedSummary(seed) {
  const ice = seed.iceberg || [];
  const byLayer = (l) => ice.filter((w) => w.layer === l).length;
  const motives = seed.motives || {};
  const motiveItems = MOTIVE_QUADRANTS.reduce((n, q) => n + ((motives[q] && motives[q].items) || []).length, 0);
  const motiveScores = MOTIVE_QUADRANTS.filter((q) => motives[q] && Number.isInteger(motives[q].score)).length;
  return [
    ['年', `${seed.year}年`],
    ['今年の目標', `${(seed.goals || []).length}件`],
    ['指標', `${(seed.principles || []).length}件`],
    [
      'アイスバーグ',
      `${ice.length}語（能力・スキル${byLayer(LAYER.SKILL)}・プラス${byLayer(LAYER.PLUS)}・マイナス${byLayer(LAYER.MINUS)}・意識${byLayer(LAYER.MIND)}）`,
    ],
    ['自分軸・理念', `${(seed.axis || []).length}件`],
    ['動機', `${motiveItems}件（点数 ${motiveScores}区分）`],
    ['ブレーキ', `${(seed.brakes || []).length}件`],
  ];
}

// 同じ年の初期データがもう入っているか（未保存の行も含めて見る）
export function seedAlreadyImported(records, year) {
  return records.some(
    (r) => r.extra && r.extra.source === 'seed' && (r.year === year || (r.kind === KIND.PRINCIPLE && r.year == null)),
  );
}
