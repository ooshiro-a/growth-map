// ブレーキ：悩みブレーキ・大きな子どもブレーキ（年ごとの種類。外せたブレーキは翌年に引き継がない）
import { KIND, LAYER } from './schema.js';

export const BRAKE_KINDS = [LAYER.WORRY, LAYER.CHILD];
export const BRAKE_KIND_NAME = { [LAYER.WORRY]: '悩みブレーキ', [LAYER.CHILD]: '大きな子どもブレーキ' };

// 悩みの仕分け
export const PLACE = { fork: '分かれ道', road: '決めた道の上' };
export const CONTROL = { can: '変えられる', cannot: '変えられない' };

export const RELEASED = 'released';
export const FACING = 'facing';
// 状態がない時は向き合い中
export const isReleased = (e) => !!e && e.value === RELEASED;

// 仕分けの文言：「決めた道の上／変えられる」
export function sortText(attrs) {
  if (!attrs) return '';
  return [PLACE[attrs.place], CONTROL[attrs.control]].filter(Boolean).join('／');
}

// 1年分：欄ごとの項目（削除した項目も元の位置に灰色で残る）と、この年に外せた数
export function brakeYear(model, year) {
  const v = model.yearView(KIND.BRAKE, year);
  const groups = BRAKE_KINDS.map((k) => ({ k, name: BRAKE_KIND_NAME[k], items: model.list(v, `L:${k}`) }));
  const released = groups.reduce((n, g) => n + g.items.filter((e) => !e.deletedRec && isReleased(e)).length, 0);
  return { groups, released };
}
