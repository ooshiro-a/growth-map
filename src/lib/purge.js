// 完全に削除する（間違えて足した時）：その項目の「追加」の記録を打ち消す行を足す
// 行は消さない（シートには残る）。追加が打ち消された項目は、画面にも履歴にも出なくなる
// 木（人生マップ・アクションプラン）は、この先の枝もいっしょに出なくなる
import { OP } from './schema.js';

export function purgeDrafts(model, e, year = '') {
  return model
    .historyOf(e.kind, e.id)
    .filter((r) => r.op === OP.ADD && model.isEffective(r))
    .map((r) => ({ year, kind: e.kind, id: e.id, op: OP.UNDO, extra: { undo: r.no } }));
}

