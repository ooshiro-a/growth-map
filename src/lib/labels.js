// 日付の小さな表示・履歴の文言
import { formatJpDate } from './dates.js';
import { KIND, OP } from './schema.js';

export const STAGE = { 1: '目指す', 2: '実践中', 3: '定着' };
export const STAGE_HINT = { 1: 'これから取り組む', 2: '取り組んでいる', 3: '意識しなくてもできる' };
export const BRAKE_STATUS = { facing: '向き合い中', released: '外せた' };

const stageName = (v) => STAGE[v] || '—';
const scoreText = (v) => (v == null || v === '' ? '—' : String(v));

// 記録の日付（取り込んだ記録は付記.at を使う）
export const recDate = (rec) => (rec ? formatJpDate(rec.extra.at || rec.at) : '');

// 「修正」「更新（実践中→定着）」「外せた」など
export function opWord(rec, kind, change) {
  switch (rec.op) {
    case OP.ADD:
      return '追加';
    case OP.EDIT:
      return '修正';
    case OP.SCORE:
      if (kind === KIND.ICEBERG && change) return `更新（${stageName(change.before)}→${stageName(change.after)}）`;
      if (kind === KIND.MOTIVE && change) return `更新（${scoreText(change.before)}→${scoreText(change.after)}）`;
      return '更新';
    case OP.STATUS:
      if (kind === KIND.BRAKE) return rec.value === 'released' ? '外せた' : '向き合い中に戻した';
      if (kind === KIND.GOAL) return '判定を戻した';
      return '状態を変更';
    case OP.ACHIEVE:
      return '達成';
    case OP.MISS:
      return '未達';
    case OP.DELETE:
      return '削除';
    case OP.MOVE:
      return '移動';
    case OP.UNDO:
      return '打ち消し';
    case OP.YEAR_START:
      return '年開始';
    default:
      return rec.op || '記録';
  }
}

// 項目の最後の変化の表示
// 年ごとの種類はその年の変化（yearLastRec）、それ以外は最後の変化（lastRec）を出す
export function dateLine(e, { perYear = false, deleted = null } = {}) {
  const added = `${formatJpDate(e.addedAt)}に追加`;
  const del = deleted || (e.deletedRec ? { rec: e.deletedRec } : null);
  if (del) return `${added}／${recDate(del.rec)}に削除`;
  const last = perYear ? e.yearLastRec : e.lastRec;
  if (!last || last === e.createdRec || last.op === OP.ADD) return added;
  const change = e.valueChanges.find((c) => c.rec === last);
  return `${added}／${recDate(last)}に${opWord(last, e.kind, change)}`;
}

// 振り返り②④の日付（いつも出す）：「書いた日：27年12月30日」「…／28年1月3日に修正」
export function writtenLine(e) {
  if (!e) return '';
  const first = `書いた日：${formatJpDate(e.addedAt)}`;
  if (!e.lastRec || e.lastRec === e.createdRec) return first;
  return `${first}／${recDate(e.lastRec)}に修正`;
}

// 長期の属性（時期・頻度・打ち手）
export const LONGTERM_ATTR = { when: '時期', freq: '頻度', tactic: '打ち手' };
export function attrText(attrs, keys = ['when', 'freq', 'tactic']) {
  return keys
    .filter((k) => attrs && attrs[k])
    .map((k) => `${LONGTERM_ATTR[k]}：${attrs[k]}`)
    .join('／');
}

// 履歴の1行の中身
export function historyText(rec, kind) {
  switch (rec.op) {
    case OP.ADD:
    case OP.EDIT: {
      if (kind === KIND.REVIEW) return rec.text ? `書いた「${rec.text}」` : '空にした';
      const attrs = kind === KIND.LONGTERM ? attrText(rec.extra) : '';
      const from = rec.op === OP.ADD && rec.extra.source === 'iceberg' ? 'アイスバーグから' : '';
      return `${from}${opWord(rec, kind)}「${rec.text}」${attrs ? `（${attrs}）` : ''}`;
    }
    case OP.SCORE:
      if (kind === KIND.ICEBERG) return `採点「${stageName(rec.value)}」`;
      return `点数「${scoreText(rec.value)}」`;
    case OP.STATUS:
      if (kind === KIND.BRAKE) return `状態「${BRAKE_STATUS[rec.value] || rec.value}」`;
      return opWord(rec, kind);
    default:
      return opWord(rec, kind);
  }
}
