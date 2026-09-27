import { beforeEach, describe, expect, it } from 'vitest';
import { buildModel } from '../src/lib/fold.js';
import { dateLine } from '../src/lib/labels.js';
import { KIND, OP, motiveQuadrantId } from '../src/lib/schema.js';
import { ids, r, resetNo } from './helpers.js';

const I = KIND.ICEBERG;
beforeEach(resetNo);

describe('行の読み込み', () => {
  it('記録番号が同じ行は最初の1行だけ使う', () => {
    const a = r({ no: 'rdup0001', kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一' });
    const b = r({ no: 'rdup0001', kind: KIND.PRINCIPLE, id: 'na', op: OP.EDIT, text: '二' });
    const m = buildModel([a, b], [], { currentYear: 2026 });
    expect(m.records).toHaveLength(1);
    expect(m.flat(KIND.PRINCIPLE).entities.get('na').text).toBe('一');
  });

  it('未保存の行も後ろに足して組み立てる（送った後に同じ番号が来ても1つ）', () => {
    const a = r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一' });
    const p = r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.EDIT, text: '二' });
    const m = buildModel([a], [p], { currentYear: 2026 });
    expect(m.flat(KIND.PRINCIPLE).entities.get('na').text).toBe('二');
    expect(m.records[1].pending).toBe(true);
    const m2 = buildModel([a, p], [p], { currentYear: 2026 });
    expect(m2.records).toHaveLength(2);
  });

  it('知らない版の行があれば unsupported にし、その行は使わない', () => {
    const a = r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一' });
    const b = r({ ver: 2, kind: KIND.PRINCIPLE, id: 'na', op: OP.EDIT, text: '二' });
    const m = buildModel([a, b], [], { currentYear: 2026 });
    expect(m.unsupported).toBe(true);
    expect(m.flat(KIND.PRINCIPLE).entities.get('na').text).toBe('一');
  });

  it('付記が壊れていても落ちない', () => {
    const a = r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一', extra: '{壊れた' });
    const m = buildModel([a], [], { currentYear: 2026 });
    expect(m.flat(KIND.PRINCIPLE).entities.get('na').text).toBe('一');
  });

  it('知らない種類・操作は使わずに数える', () => {
    const a = r({ kind: '謎', id: 'na', op: OP.ADD, text: 'x' });
    const b = r({ kind: KIND.PRINCIPLE, id: 'nb', op: '謎の操作', text: 'y' });
    const m = buildModel([a, b], [], { currentYear: 2026 });
    expect(m.unknown).toBe(2);
    expect(m.flat(KIND.PRINCIPLE).entities.size).toBe(0);
  });
});

describe('1行は変わった所だけ', () => {
  it('修正は文言だけ、採点は点数だけを変える', () => {
    const rows = [
      r({ year: 2026, kind: I, id: 'n1', op: OP.ADD, layer: 'skill', text: '技術', value: '1' }),
      r({ year: 2026, kind: I, id: 'n1', op: OP.EDIT, text: '技術力' }),
      r({ year: 2026, kind: I, id: 'n1', op: OP.SCORE, value: '3' }),
      r({ year: 2026, kind: I, id: 'n1', op: OP.EDIT, text: '技術力を磨く' }),
    ];
    const e = buildModel(rows, [], { currentYear: 2026 }).yearView(I, 2026).entities.get('n1');
    expect(e.text).toBe('技術力を磨く');
    expect(e.value).toBe('3');
    expect(e.layer).toBe('skill');
  });

  it('同じ項目番号の2回目の追加は修正として扱う', () => {
    const rows = [
      r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一' }),
      r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '二' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(m.flat(KIND.PRINCIPLE).entities.size).toBe(1);
    expect(m.flat(KIND.PRINCIPLE).entities.get('na').text).toBe('二');
  });

  it('追加のない項目への行は使わない（決まった番号は除く）', () => {
    const rows = [r({ kind: KIND.PRINCIPLE, id: 'nx', op: OP.EDIT, text: '孤児' })];
    expect(buildModel(rows, [], { currentYear: 2026 }).flat(KIND.PRINCIPLE).entities.size).toBe(0);
  });

  it('削除より後の行は履歴にだけ残す', () => {
    const rows = [
      r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一' }),
      r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.DELETE }),
      r({ kind: KIND.PRINCIPLE, id: 'na', op: OP.EDIT, text: '遅れて来た修正' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const e = m.flat(KIND.PRINCIPLE).entities.get('na');
    expect(e.text).toBe('一');
    expect(e.deletedRec).not.toBeNull();
    expect(e.history).toHaveLength(3);
  });
});

describe('打ち消し', () => {
  it('打ち消した記録は使わず、打ち消しの打ち消しで元に戻る', () => {
    const add = r({ no: 'rundo001', kind: KIND.MAP, id: 'root', op: OP.ADD, text: '人生' });
    const del = r({ no: 'rundo002', kind: KIND.MAP, id: 'root', op: OP.DELETE });
    const u1 = r({ no: 'rundo003', kind: KIND.MAP, id: 'root', op: OP.UNDO, extra: { undo: 'rundo002' } });
    let m = buildModel([add, del, u1], [], { currentYear: 2026 });
    expect(m.flat(KIND.MAP).entities.get('root').deletedRec).toBeNull();
    const u2 = r({ no: 'rundo004', kind: KIND.MAP, id: 'root', op: OP.UNDO, extra: { undo: 'rundo003' } });
    m = buildModel([add, del, u1, u2], [], { currentYear: 2026 });
    expect(m.flat(KIND.MAP).entities.get('root').deletedRec).not.toBeNull();
  });

  it('後の記録は打ち消せない', () => {
    const u = r({ no: 'rundo010', kind: KIND.PRINCIPLE, id: 'na', op: OP.UNDO, extra: { undo: 'rundo011' } });
    const add = r({ no: 'rundo011', kind: KIND.PRINCIPLE, id: 'na', op: OP.ADD, text: '一' });
    const m = buildModel([u, add], [], { currentYear: 2026 });
    expect(m.flat(KIND.PRINCIPLE).entities.get('na')).toBeTruthy();
  });

  it('追加を打ち消すと項目も子も出ない', () => {
    const rows = [
      r({ kind: KIND.MAP, id: 'root', op: OP.ADD, text: '人生' }),
      r({ no: 'rundo020', kind: KIND.MAP, id: 'nb', parent: 'root', op: OP.ADD, text: '枝' }),
      r({ kind: KIND.MAP, id: 'nc', parent: 'nb', op: OP.ADD, text: '葉' }),
      r({ kind: KIND.MAP, id: 'nb', op: OP.UNDO, extra: { undo: 'rundo020' } }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const v = m.flat(KIND.MAP);
    expect(v.entities.has('nb')).toBe(false);
    expect(ids(m.list(v, 'P:root'))).toEqual([]);
  });
});

describe('並び順（付記.after）', () => {
  const P = KIND.PRINCIPLE;
  it('直前の兄弟の後ろに入り、同じ兄弟を指したら後の行が先に来る', () => {
    const rows = [
      r({ kind: P, id: 'na', op: OP.ADD, text: 'A' }),
      r({ kind: P, id: 'nb', op: OP.ADD, text: 'B' }),
      r({ kind: P, id: 'nc', op: OP.ADD, text: 'C' }),
      r({ kind: P, id: 'nx', op: OP.ADD, text: 'X', extra: { after: 'na' } }),
      r({ kind: P, id: 'ny', op: OP.ADD, text: 'Y', extra: { after: 'na' } }),
      r({ kind: P, id: 'nz', op: OP.ADD, text: 'Z', extra: { after: '' } }),
      r({ kind: P, id: 'nw', op: OP.ADD, text: 'W', extra: { after: 'n-none' } }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(ids(m.list(m.flat(P), 'L:'))).toEqual(['nz', 'na', 'ny', 'nx', 'nb', 'nc', 'nw']);
  });

  it('削除した項目は元の位置に残る。並べ替えで親を移せる', () => {
    const M = KIND.MAP;
    const rows = [
      r({ kind: M, id: 'root', op: OP.ADD, text: '人生' }),
      r({ kind: M, id: 'na', parent: 'root', op: OP.ADD, text: 'A' }),
      r({ kind: M, id: 'nb', parent: 'root', op: OP.ADD, text: 'B', extra: { after: 'na' } }),
      r({ kind: M, id: 'nc', parent: 'root', op: OP.ADD, text: 'C', extra: { after: 'nb' } }),
      r({ kind: M, id: 'na', op: OP.DELETE }),
      r({ kind: M, id: 'nc', parent: 'nb', op: OP.MOVE, extra: { after: '' } }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const v = m.flat(M);
    expect(ids(m.list(v, 'P:root'))).toEqual(['na', 'nb']);
    expect(ids(m.list(v, 'P:nb'))).toEqual(['nc']);
  });
});

describe('並べ替えの輪', () => {
  it('自分の子孫の下へ移す行は使わない（2台で逆向きに移した時）', () => {
    const M = KIND.MAP;
    const rows = [
      r({ kind: M, id: 'root', op: OP.ADD, text: '人生' }),
      r({ kind: M, id: 'na', parent: 'root', op: OP.ADD, text: 'A' }),
      r({ kind: M, id: 'nb', parent: 'root', op: OP.ADD, text: 'B' }),
      r({ kind: M, id: 'na', parent: 'nb', op: OP.MOVE }), // PC：A を B の下へ
      r({ kind: M, id: 'nb', parent: 'na', op: OP.MOVE }), // スマホ：B を A の下へ（古い画面から）
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const v = m.flat(M);
    expect(v.entities.get('na').parent).toBe('nb');
    expect(v.entities.get('nb').parent).toBe('root');
    expect(ids(m.list(v, 'P:root'))).toEqual(['nb']);
    expect(v.entities.get('nb').history).toHaveLength(2); // 使わなかった行も履歴には残る
  });
});

describe('決まった番号は並びに入れない', () => {
  it('動機の区分の点数は、区分の項目の並びに出ない', () => {
    const rows = [
      r({ year: 2026, kind: KIND.MOTIVE, id: 'nm1', op: OP.ADD, layer: 'selfVisible', text: '動機の例B' }),
      r({ year: 2026, kind: KIND.MOTIVE, id: motiveQuadrantId('selfVisible'), op: OP.SCORE, layer: 'selfVisible', value: '5' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2026 });
    const v = m.yearView(KIND.MOTIVE, 2026);
    expect(ids(m.list(v, 'L:selfVisible'))).toEqual(['nm1']);
    expect(v.entities.get(motiveQuadrantId('selfVisible')).value).toBe('5');
  });
});

describe('木の削除（マップ・長期）', () => {
  it('親を削除すると子も灰色（日付は親の日付）。親の削除を打ち消すと枝ごと戻る', () => {
    const M = KIND.MAP;
    const base = [
      r({ kind: M, id: 'root', op: OP.ADD, text: '人生' }),
      r({ kind: M, id: 'nb', parent: 'root', op: OP.ADD, text: '枝' }),
      r({ kind: M, id: 'nc', parent: 'nb', op: OP.ADD, text: '葉' }),
      r({ no: 'rdel0001', at: '2027-05-08T10:00:00.000+09:00', kind: M, id: 'nb', op: OP.DELETE }),
    ];
    let m = buildModel(base, [], { currentYear: 2027 });
    let v = m.flat(M);
    const info = m.deletedInfo(v, v.entities.get('nc'));
    expect(info.inherited).toBe(true);
    expect(dateLine(v.entities.get('nc'), { deleted: info })).toMatch(/27年5月8日に削除$/);
    m = buildModel([...base, r({ kind: M, id: 'nb', op: OP.UNDO, extra: { undo: 'rdel0001' } })], [], { currentYear: 2027 });
    v = m.flat(M);
    expect(m.deletedInfo(v, v.entities.get('nc'))).toBeNull();
  });
});

describe('年の切り替えと引き継ぎ', () => {
  const add = (year, id, layer, value, extra) => r({ year, kind: I, id, op: OP.ADD, layer, text: id, value, extra });

  it('前の年の最後の姿を引き継ぎ、削除した言葉は引き継がない', () => {
    const rows = [
      add(2026, 'na', 'skill', '2'),
      add(2026, 'nb', 'mind', '1'),
      r({ year: 2026, kind: I, id: 'nb', op: OP.DELETE }),
      r({ year: 2026, kind: I, id: 'na', op: OP.SCORE, value: '3' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    const v26 = m.yearView(I, 2026);
    const v27 = m.yearView(I, 2027);
    expect(v26.entities.get('nb').deletedRec).not.toBeNull(); // 2026 年には灰色で残る
    expect(v27.entities.has('nb')).toBe(false);
    expect(v27.entities.get('na').value).toBe('3');
    expect(v27.entities.get('na').carried).toBe(true);
    expect(m.years).toEqual([2026, 2027]);
  });

  it('削除を打ち消した言葉は引き継ぐ', () => {
    const rows = [
      add(2026, 'na', 'skill', '2'),
      r({ no: 'rdel0100', year: 2026, kind: I, id: 'na', op: OP.DELETE }),
      r({ year: 2026, kind: I, id: 'na', op: OP.UNDO, extra: { undo: 'rdel0100' } }),
    ];
    expect(buildModel(rows, [], { currentYear: 2027 }).yearView(I, 2027).entities.has('na')).toBe(true);
  });

  it('外せたブレーキは引き継がず、その年には残る。外せた後に戻したものは引き継ぐ', () => {
    const B = KIND.BRAKE;
    const rows = [
      r({ year: 2026, kind: B, id: 'na', op: OP.ADD, layer: 'worry', text: '悩みA', value: 'facing' }),
      r({ year: 2026, kind: B, id: 'nb', op: OP.ADD, layer: 'child', text: '子B', value: 'facing' }),
      r({ year: 2026, kind: B, id: 'na', op: OP.STATUS, value: 'released' }),
      r({ year: 2026, kind: B, id: 'nb', op: OP.STATUS, value: 'released' }),
      r({ year: 2026, kind: B, id: 'nb', op: OP.STATUS, value: 'facing' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    expect(m.yearView(B, 2026).entities.get('na').value).toBe('released');
    expect(m.yearView(B, 2027).entities.has('na')).toBe(false);
    expect(m.yearView(B, 2027).entities.has('nb')).toBe(true);
  });

  it('前の年の行が後から足されても、今年の姿は変わらない', () => {
    const rows = [
      add(2026, 'na', 'skill', '2'),
      r({ year: 2027, kind: I, id: 'na', op: OP.SCORE, value: '3' }),
      r({ year: 2026, kind: I, id: 'na', op: OP.SCORE, value: '1' }), // 古い画面から遅れて来た行
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    expect(m.yearView(I, 2027).entities.get('na').value).toBe('3');
  });

  it('開かなかった年があってもつながる', () => {
    const m = buildModel([add(2026, 'na', 'skill', '2')], [], { currentYear: 2029 });
    expect(m.years).toEqual([2026, 2027, 2028, 2029]);
    expect(m.yearView(I, 2029).entities.get('na').value).toBe('2');
  });

  it('前の年の並び順を引き継ぐ', () => {
    const rows = [
      add(2026, 'na', 'skill', '1'),
      add(2026, 'nb', 'skill', '1', { after: '' }),
      add(2027, 'nc', 'skill', '1', { after: 'nb' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    expect(ids(m.list(m.yearView(I, 2027), 'L:skill'))).toEqual(['nb', 'nc', 'na']);
  });

  it('引き継いだ項目の日付は、最初に足した日とその年の変化', () => {
    const rows = [
      add(2026, 'na', 'skill', '2', { at: '2026-10-15T10:00:00.000+09:00' }),
      r({ at: '2026-11-01T10:00:00.000+09:00', year: 2026, kind: I, id: 'na', op: OP.EDIT, text: '技術力' }),
      r({ at: '2027-02-11T10:00:00.000+09:00', year: 2027, kind: I, id: 'na', op: OP.SCORE, value: '3' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    expect(dateLine(m.yearView(I, 2026).entities.get('na'), { perYear: true })).toBe('26年10月15日に追加／26年11月1日に修正');
    expect(dateLine(m.yearView(I, 2027).entities.get('na'), { perYear: true })).toBe('26年10月15日に追加／27年2月11日に更新（実践中→定着）');
    const m2 = buildModel(rows.slice(0, 2), [], { currentYear: 2027 });
    expect(dateLine(m2.yearView(I, 2027).entities.get('na'), { perYear: true })).toBe('26年10月15日に追加');
  });
});

describe('アイスバーグの大きさ', () => {
  it('能力・スキル、«プラス»、意識の合計。«マイナス»と削除は数えない。変化を記録する', () => {
    const rows = [
      r({ year: 2026, kind: I, id: 'na', op: OP.ADD, layer: 'skill', text: 'a', value: '2' }),
      r({ year: 2026, kind: I, id: 'nb', op: OP.ADD, layer: 'plus', text: 'b', value: '3' }),
      r({ year: 2026, kind: I, id: 'nc', op: OP.ADD, layer: 'minus', text: 'c' }),
      r({ year: 2026, kind: I, id: 'nd', op: OP.ADD, layer: 'mind', text: 'd', value: '1' }),
      r({ year: 2026, kind: I, id: 'nd', op: OP.DELETE }),
      r({ year: 2027, kind: I, id: 'na', op: OP.SCORE, value: '3' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    const v26 = m.yearView(I, 2026);
    const v27 = m.yearView(I, 2027);
    expect(v26.startSize).toBe(0);
    expect(v26.endSize).toBe(5);
    expect(v27.startSize).toBe(5);
    expect(v27.endSize).toBe(6);
    expect(v27.sizeChanges.map((c) => [c.before, c.after])).toEqual([[5, 6]]);
  });
});

describe('動機の区分', () => {
  const M = KIND.MOTIVE;
  it('点数は区分の決まった番号に付き、前の年の点数も読める。空欄は点数なし', () => {
    const q = motiveQuadrantId('selfVisible');
    const rows = [
      r({ year: 2026, kind: M, id: q, op: OP.SCORE, layer: 'selfVisible', value: '7' }),
      r({ year: 2026, kind: M, id: 'nm1', op: OP.ADD, layer: 'selfVisible', text: '動機の例A' }),
      r({ year: 2027, kind: M, id: q, op: OP.SCORE, layer: 'selfVisible', value: '' }),
    ];
    const m = buildModel(rows, [], { currentYear: 2027 });
    expect(m.yearView(M, 2026).entities.get(q).value).toBe('7');
    expect(m.yearView(M, 2027).entities.get(q).value).toBeNull();
    expect(m.yearView(M, 2027).entities.get('nm1').text).toBe('動機の例A');
  });
});

describe('目標', () => {
  const G = KIND.GOAL;
  it('達成・未達と、判定を戻す（空欄の状態変更）', () => {
    const rows = [
      r({ year: 2027, kind: G, id: 'ng1', op: OP.ADD, text: '目標A' }),
      r({ year: 2027, kind: G, id: 'ng1', op: OP.ACHIEVE }),
    ];
    let m = buildModel(rows, [], { currentYear: 2027 });
    expect(m.flat(G).entities.get('ng1').result).toBe(OP.ACHIEVE);
    expect(m.flat(G).entities.get('ng1').year).toBe(2027);
    m = buildModel([...rows, r({ year: 2027, kind: G, id: 'ng1', op: OP.STATUS, value: '' })], [], { currentYear: 2027 });
    expect(m.flat(G).entities.get('ng1').result).toBeNull();
  });
});

describe('取り込んだ記録の日付', () => {
  it('付記.at を追加日にする', () => {
    const rows = [
      r({ at: '2026-10-01T10:00:00.000+09:00', kind: KIND.MAP, id: 'root', op: OP.ADD, text: '人生', extra: { at: '2026-07-11T14:53:35.777+09:00', source: 'mindmap' } }),
    ];
    const e = buildModel(rows, [], { currentYear: 2026 }).flat(KIND.MAP).entities.get('root');
    expect(dateLine(e)).toBe('26年7月11日に追加');
  });
});
