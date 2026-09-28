// 人生マップ：なりたい姿／なりたくない姿の木（年をまたいで続く）
// 取り込み：旧マインドマップの「番号つきで書き出す」の JSON、または「文章として書き出す」の形
import { toJstIso } from './dates.js';
import { decodeIdTime, newId } from './ids.js';
import { KIND, OP } from './schema.js';

export const ROOT_ID = 'root';
const MAX_TEXT = 300;
const MAX_NODES = 3000;
const MAX_DEPTH = 40;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ---------------------------------------------------------------- 木の組み立て
// 真ん中（親のない項目。root があれば root）から、並び順どおりにたどる
// 削除した項目も灰色で残す。親が見つからない項目（打ち消した追加の下など）は出さない
export function lifeTree(model) {
  const v = model.flat(KIND.MAP);
  const tops = model.list(v, 'L:');
  const top = tops.find((e) => e.id === ROOT_ID && !e.deletedRec) || tops.find((e) => !e.deletedRec) || tops[0] || null;
  if (!top) return null;
  const build = (e, depth, seen) => {
    if (seen.has(e.id) || depth > MAX_DEPTH) return null;
    seen.add(e.id);
    const del = model.deletedInfo(v, e);
    const children = model
      .list(v, `P:${e.id}`)
      .map((c) => build(c, depth + 1, seen))
      .filter(Boolean);
    return { e, depth, deleted: del, children };
  };
  return build(top, 0, new Set());
}

// 深さ2以上で枝を持つ項目（「深い枝をたたむ」）
export function deepIds(node, out = []) {
  if (!node) return out;
  if (node.depth >= 2 && node.children.length) out.push(node.e.id);
  node.children.forEach((c) => deepIds(c, out));
  return out;
}

// 文章として書き出す（旧アプリと同じ形。削除した項目は入れない）
export function toOutline(node, depth = 0) {
  if (!node || node.deleted) return '';
  let s = `${'  '.repeat(depth)}- ${node.e.text}\n`;
  for (const c of node.children) s += toOutline(c, depth + 1);
  return s;
}

// ---------------------------------------------------------------- 取り込み
// 貼られた文字を読む。JSON（番号つき）ならそのまま、そうでなければ文章（行頭「- 」、字下げ2文字ずつ）
// 返り値：{ ok, kind: 'numbered'|'outline', tree: {id, text, children}, count, errors }
export function parseMapImport(input) {
  const text = String(input || '').replace(/^﻿/, '');
  if (!text.trim()) return { ok: false, errors: ['何も貼られていません'] };
  if (/^\s*[{[]/.test(text)) return parseNumbered(text);
  return parseOutline(text);
}

function parseNumbered(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON として読めません（途中で切れていないか確かめてください）'] };
  }
  const errors = [];
  const ids = new Set();
  let count = 0;
  const walk = (n, where, depth) => {
    if (count >= MAX_NODES) return null;
    if (!n || typeof n !== 'object' || Array.isArray(n)) {
      errors.push(`${where}：形が正しくありません`);
      return null;
    }
    count++;
    if (typeof n.id !== 'string' || !ID_RE.test(n.id)) errors.push(`${where}：番号（id）が正しくありません`);
    else if (ids.has(n.id)) errors.push(`${where}：番号「${n.id}」が重なっています`);
    else ids.add(n.id);
    const t = typeof n.text === 'string' ? n.text.trim() : '';
    if (!t) errors.push(`${where}：文言がありません`);
    else if (t.length > MAX_TEXT) errors.push(`${where}：文言が長すぎます（${MAX_TEXT}字まで）`);
    if (n.children !== undefined && !Array.isArray(n.children)) errors.push(`${where}：children が並びではありません`);
    if (depth > MAX_DEPTH) {
      errors.push(`${where}：枝が深すぎます`);
      return null;
    }
    const kids = Array.isArray(n.children) ? n.children : [];
    return {
      id: n.id,
      text: t,
      children: kids.map((c, i) => walk(c, `${where}の${i + 1}番目`, depth + 1)).filter(Boolean),
    };
  };
  const tree = walk(data, '真ん中', 0);
  if (count >= MAX_NODES) errors.push(`項目が多すぎます（${MAX_NODES}個まで）`);
  if (errors.length || !tree) return { ok: false, errors: errors.length ? errors : ['形が正しくありません'] };
  return { ok: true, kind: 'numbered', tree, count, errors: [] };
}

function parseOutline(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  let root = null;
  const stack = []; // stack[depth] = その深さの最後の項目
  let count = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^( *)- (.*)$/.exec(line);
    const where = `${i + 1}行目`;
    if (!m) return errors.push(`${where}：「- 」で始まっていません`);
    if (m[1].length % 2) return errors.push(`${where}：字下げが2文字ずつではありません`);
    const depth = m[1].length / 2;
    const t = m[2].trim();
    if (!t) return errors.push(`${where}：文言がありません`);
    if (t.length > MAX_TEXT) return errors.push(`${where}：文言が長すぎます（${MAX_TEXT}字まで）`);
    if (depth > MAX_DEPTH) return errors.push(`${where}：枝が深すぎます`);
    if (++count > MAX_NODES) return errors.push(`項目が多すぎます（${MAX_NODES}個まで）`);
    const node = { id: null, text: t, children: [] };
    if (depth === 0) {
      if (root) return errors.push(`${where}：真ん中（字下げなしの行）は1つだけです`);
      root = node;
    } else {
      const parent = stack[depth - 1];
      if (!parent) return errors.push(`${where}：字下げが深すぎます（上の行より2文字だけ深くできます）`);
      parent.children.push(node);
    }
    stack[depth] = node;
    stack.length = depth + 1;
    return undefined;
  });
  if (!root && !errors.length) errors.push('真ん中（字下げなしの行）がありません');
  if (errors.length) return { ok: false, errors };
  return { ok: true, kind: 'outline', tree: root, count, errors: [] };
}

// 項目の数（真ん中を含む）と深さ
export function treeStats(tree) {
  let count = 0;
  let depth = 0;
  const walk = (n, d) => {
    count++;
    depth = Math.max(depth, d);
    n.children.forEach((c) => walk(c, d + 1));
  };
  walk(tree, 0);
  return { count, depth };
}

// 読んだ木 → 下書き（上から順に。兄弟は書いた順に後ろへ並ぶので after は付けない）
// 番号つき：旧アプリの番号をそのまま使い、番号から戻した日時を追加日にする（読めない番号は取り込んだ日）
// 文章：番号を新しく作り（真ん中は root）、追加日は取り込んだ日
export function mapImportDrafts(parsed, { nowMs = Date.now(), makeId = newId } = {}) {
  const out = [];
  const numbered = parsed.kind === 'numbered';
  const walk = (n, parent) => {
    const id = numbered ? n.id : parent ? makeId() : ROOT_ID;
    const extra = { source: 'mindmap' };
    if (numbered) {
      const ms = decodeIdTime(n.id, nowMs);
      if (ms != null) extra.at = toJstIso(ms);
    }
    out.push({ year: '', kind: KIND.MAP, id, parent: parent || '', op: OP.ADD, text: n.text, extra });
    n.children.forEach((c) => walk(c, id));
  };
  walk(parsed.tree, null);
  return out;
}

// 人生マップにもう記録があるか（取り込みは1回だけ。未保存の行も含めて見る）
export const mapAlreadyStarted = (records) => records.some((r) => r.kind === KIND.MAP);

// 見せる例：真ん中と最初の枝
export function mapSamples(tree, n = 3) {
  return [tree.text, ...tree.children.slice(0, n).map((c) => c.text)];
}
