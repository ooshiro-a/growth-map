// @vitest-environment happy-dom
// 完全に削除する（試験データは作り物だけ）：追加の記録を打ち消す行を足す。行は消さない
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMemo, useState } from 'react';
import { AppContext } from '../src/app-context.js';
import { ItemList } from '../src/components/ItemList.jsx';
import { buildModel } from '../src/lib/fold.js';
import { lifeTree } from '../src/lib/lifemap.js';
import { purgeDrafts } from '../src/lib/purge.js';
import { KIND, LAYER, OP, toRow } from '../src/lib/schema.js';
import { BrakeScreen } from '../src/screens/BrakeScreen.jsx';
import { LifeMapScreen } from '../src/screens/LifeMapScreen.jsx';
import { ids, r, resetNo } from './helpers.js';

afterEach(cleanup);
beforeEach(resetNo);

describe('完全に削除する（組み立て）', () => {
  it('追加を打ち消すと、その項目は並びから消える（修正・削除の行があっても）', () => {
    const P = KIND.PRINCIPLE;
    const rows = [
      r({ no: 'rpadd1', kind: P, id: 'np1', op: OP.ADD, text: '作り物の指標1' }),
      r({ kind: P, id: 'np2', op: OP.ADD, text: '作り物の指標2' }),
      r({ kind: P, id: 'np1', op: OP.EDIT, text: '作り物の指標1・改' }),
      r({ kind: P, id: 'np1', op: OP.DELETE }),
    ];
    let m = buildModel(rows, [], { currentYear: 2026 });
    const e = m.flat(P).entities.get('np1');
    const drafts = purgeDrafts(m, e);
    expect(drafts).toEqual([{ year: '', kind: P, id: 'np1', op: OP.UNDO, extra: { undo: 'rpadd1' } }]);
    m = buildModel([...rows, ...drafts.map((d) => r(d))], [], { currentYear: 2026 });
    expect(ids(m.list(m.flat(P), 'L:'))).toEqual(['np2']);
    // シートの行は残る
    expect(m.records.filter((x) => x.id === 'np1')).toHaveLength(4);
  });

  it('年ごとの種類：前の年から引き継いだ項目は、今年の行で打ち消し、前の年からも消える', () => {
    const I = KIND.ICEBERG;
    const rows = [
      r({ no: 'rpadd2', year: 2025, kind: I, id: 'ni1', op: OP.ADD, layer: LAYER.SKILL, text: '作り物の言葉', value: '2' }),
      r({ year: 2025, kind: I, id: 'ni2', op: OP.ADD, layer: LAYER.SKILL, text: '作り物の言葉2', value: '1' }),
    ];
    let m = buildModel(rows, [], { currentYear: 2026 });
    const e = m.yearView(I, 2026).entities.get('ni1');
    const drafts = purgeDrafts(m, e, 2026);
    expect(drafts).toEqual([{ year: 2026, kind: I, id: 'ni1', op: OP.UNDO, extra: { undo: 'rpadd2' } }]);
    m = buildModel([...rows, ...drafts.map((d) => r(d))], [], { currentYear: 2026 });
    expect(ids(m.list(m.yearView(I, 2025), `L:${LAYER.SKILL}`))).toEqual(['ni2']);
    expect(ids(m.list(m.yearView(I, 2026), `L:${LAYER.SKILL}`))).toEqual(['ni2']);
  });

  it('人生マップ：枝を完全に削除すると、この先の枝も出なくなる', () => {
    const M = KIND.MAP;
    const rows = [
      r({ kind: M, id: 'root', op: OP.ADD, text: '作り物の真ん中' }),
      r({ kind: M, id: 'na', parent: 'root', op: OP.ADD, text: '作り物の枝' }),
      r({ kind: M, id: 'na1', parent: 'na', op: OP.ADD, text: '作り物の葉' }),
      r({ kind: M, id: 'nb', parent: 'root', op: OP.ADD, text: '作り物の枝B' }),
    ];
    let m = buildModel(rows, [], { currentYear: 2026 });
    const drafts = purgeDrafts(m, m.flat(M).entities.get('na'));
    m = buildModel([...rows, ...drafts.map((d) => r(d))], [], { currentYear: 2026 });
    expect(lifeTree(m).children.map((c) => c.e.id)).toEqual(['nb']);
  });
});

// ---------------------------------------------------------------- 画面
function Harness({ log, initial = [], env = 'test', children }) {
  const [rows, setRows] = useState(initial);
  const model = useMemo(() => buildModel(rows, [], { currentYear: 2026 }), [rows]);
  const write = (drafts) => {
    const add = drafts.map((d, i) => toRow({ ...d, at: `2026-09-29T11:00:${String((rows.length + i) % 60).padStart(2, '0')}.000+09:00`, no: `rpg${env}${rows.length + i}xxxx` }));
    log.push(...drafts);
    setRows((x) => x.concat(add));
    return add;
  };
  return (
    <AppContext.Provider value={{ model, write, readOnly: false, env, year: 2026 }}>
      <span id="bar-actions" />
      {children}
    </AppContext.Provider>
  );
}
const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (label) => fireEvent.click(screen.getByRole('menuitem', { name: label }));
const confirmPurge = () => {
  const d = screen.getByRole('dialog', { name: '完全に削除する' });
  const msg = d.textContent;
  fireEvent.click(within(d).getByRole('button', { name: '完全に削除する' }));
  return msg;
};

describe('完全に削除する（画面）', () => {
  it('灰色で残した項目も、「…」から完全に消せる', () => {
    const log = [];
    const initial = [r({ no: 'rpadd3', kind: KIND.PRINCIPLE, id: 'np1', op: OP.ADD, text: '作り物の間違い' }), r({ kind: KIND.PRINCIPLE, id: 'np1', op: OP.DELETE })];
    render(
      <Harness log={log} initial={initial}>
        <ItemList kind={KIND.PRINCIPLE} title="指標" />
      </Harness>,
    );
    openMenu('「作り物の間違い」の操作');
    choose('完全に削除する');
    expect(confirmPurge()).toContain('元に戻せません');
    expect(log).toEqual([{ year: '', kind: KIND.PRINCIPLE, id: 'np1', op: OP.UNDO, extra: { undo: 'rpadd3' } }]);
    expect(screen.queryByText('作り物の間違い')).toBeNull();
    expect(screen.getByText('まだありません')).toBeTruthy();
  });

  it('年ごとの種類（ブレーキ）：今年の年で書く', () => {
    const log = [];
    const initial = [r({ no: 'rpadd4', year: 2025, kind: KIND.BRAKE, id: 'nb1', op: OP.ADD, layer: LAYER.CHILD, text: '作り物の間違い', value: 'facing' })];
    render(
      <Harness log={log} initial={initial}>
        <BrakeScreen year={2026} />
      </Harness>,
    );
    openMenu('「作り物の間違い」の操作');
    choose('完全に削除する');
    expect(confirmPurge()).toContain('前の年からも消えます');
    expect(log).toEqual([{ year: 2026, kind: KIND.BRAKE, id: 'nb1', op: OP.UNDO, extra: { undo: 'rpadd4' } }]);
    expect(screen.queryByText('作り物の間違い')).toBeNull();
  });

  it('人生マップ：この先の枝もいっしょに消え、「元に戻す」で戻せる', () => {
    const log = [];
    const M = KIND.MAP;
    const initial = [
      r({ kind: M, id: 'root', op: OP.ADD, text: '作り物の真ん中' }),
      r({ no: 'rpadd5', kind: M, id: 'na', parent: 'root', op: OP.ADD, text: '作り物の間違い' }),
      r({ kind: M, id: 'na1', parent: 'na', op: OP.ADD, text: '作り物の葉' }),
    ];
    render(
      <Harness log={log} initial={initial} env="purge-map">
        <LifeMapScreen />
      </Harness>,
    );
    openMenu('「作り物の真ん中」の操作');
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).not.toContain('完全に削除する');
    fireEvent.keyDown(document, { key: 'Escape' });
    openMenu('「作り物の間違い」の操作');
    choose('完全に削除する');
    const msg = confirmPurge();
    expect(msg).toContain('この先の枝もいっしょに消えます');
    expect(msg).toContain('直後なら「元に戻す」で戻せます');
    expect(log.at(-1)).toEqual({ year: '', kind: M, id: 'na', op: OP.UNDO, extra: { undo: 'rpadd5' } });
    expect([...document.querySelectorAll('.lm-text')].map((x) => x.textContent)).toEqual(['作り物の真ん中']);

    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(log.at(-1)).toEqual({ year: '', kind: M, id: 'na', op: OP.UNDO, extra: { undo: 'rpgpurge-map3xxxx' } });
    expect([...document.querySelectorAll('.lm-text')].map((x) => x.textContent)).toEqual(['作り物の真ん中', '作り物の間違い', '作り物の葉']);
  });
});
