// 初期データの取り込み（試験の言葉は作り物）
import { describe, expect, it } from 'vitest';
import { buildModel } from '../src/lib/fold.js';
import { icebergYear } from '../src/lib/iceberg.js';
import { toRow } from '../src/lib/schema.js';
import { parseSeed, seedAlreadyImported, seedDrafts, seedSummary } from '../src/lib/seed.js';

const SEED = {
  format: 'growth-map-seed/1',
  year: 2026,
  goals: ['作り物の目標A', '作り物の目標B'],
  principles: ['作り物の指標'],
  iceberg: [
    { layer: 'skill', text: '作り物の技', stage: 2 },
    { layer: 'plus', text: '作り物の習慣', stage: 1 },
    { layer: 'minus', text: '作り物の癖' },
    { layer: 'mind', text: '作り物の考え（補足）', stage: 3 },
  ],
  axis: ['作り物の軸'],
  motives: {
    selfVisible: { score: 7, items: ['作り物の動機'] },
    otherVisible: { score: null, items: [] },
    selfInvisible: { score: 0, items: ['作り物の動機2', '作り物の動機3'] },
    otherInvisible: { score: null, items: [] },
  },
  brakes: [
    { kind: 'worry', text: '作り物の悩み', place: 'road', control: 'can', status: 'facing' },
    { kind: 'child', text: '作り物の子ども', status: 'released' },
  ],
};

let seq = 0;
const makeId = () => `nseed${++seq}`;
const asRows = (drafts) =>
  drafts.map((d, i) => toRow({ ...d, at: `2026-09-27T10:00:00.${String(i).padStart(3, '0')}+09:00`, no: `rseed${String(i).padStart(4, '0')}`, ver: 1 }));

describe('初期データの取り込み', () => {
  it('確かめて、行にする（件数・形）', () => {
    const p = parseSeed(JSON.stringify(SEED));
    expect(p.ok).toBe(true);
    const drafts = seedDrafts(p.seed, makeId);
    // 目標2＋指標1＋アイスバーグ4＋自分軸1＋動機3＋点数2＋ブレーキ2
    expect(drafts).toHaveLength(15);
    expect(drafts.every((d) => d.extra.source === 'seed')).toBe(true);
    expect(drafts.filter((d) => d.op === '採点').map((d) => [d.id, d.value])).toEqual([
      ['mv-selfVisible', '7'],
      ['mv-selfInvisible', '0'],
    ]);
    const minus = drafts.find((d) => d.layer === 'minus');
    expect(minus.value).toBe('');
    const worry = drafts.find((d) => d.layer === 'worry');
    expect(worry.extra).toMatchObject({ place: 'road', control: 'can' });
    expect(drafts.find((d) => d.kind === '指標').year).toBe('');
    expect(seedSummary(p.seed)[3][1]).toBe('4語（能力・スキル1・プラス1・マイナス1・意識1）');
  });

  it('取り込んだ行から、アイスバーグ・動機・ブレーキ・目標が組み立てられる', () => {
    const rows = asRows(seedDrafts(SEED, makeId));
    const m = buildModel(rows, [], { currentYear: 2026 });
    const d = icebergYear(m, 2026);
    expect(d.size).toBe(6);
    expect(d.layers.mind[0].text).toBe('作り物の考え（補足）');
    const motives = m.yearView('動機', 2026);
    expect(motives.entities.get('mv-selfVisible').value).toBe('7');
    expect(m.list(motives, 'L:selfInvisible').map((e) => e.text)).toEqual(['作り物の動機2', '作り物の動機3']);
    const brakes = m.yearView('ブレーキ', 2026);
    expect(m.list(brakes, 'L:worry')[0].attrs).toEqual({ place: 'road', control: 'can' });
    expect(m.list(brakes, 'L:child')[0].value).toBe('released');
    expect(m.list(m.flat('目標'), 'L:').map((g) => g.text)).toEqual(['作り物の目標A', '作り物の目標B']);
    expect(seedAlreadyImported(m.records, 2026)).toBe(true);
    expect(seedAlreadyImported(buildModel([], [], { currentYear: 2026 }).records, 2026)).toBe(false);
  });

  it('おかしい所はまとめて知らせる', () => {
    expect(parseSeed('{').ok).toBe(false);
    const bad = {
      ...SEED,
      format: 'x',
      extra: 1,
      iceberg: [
        { layer: 'top', text: 'a', stage: 1 },
        { layer: 'skill', text: '', stage: 4 },
        { layer: 'minus', text: 'b', stage: 1 },
      ],
      motives: { selfVisible: { score: 11, items: [] }, other: {} },
      brakes: [{ kind: 'child', text: 'c', place: 'road', status: 'x' }],
    };
    const p = parseSeed(JSON.stringify(bad));
    expect(p.ok).toBe(false);
    const all = p.errors.join('\n');
    for (const s of ['format', '知らない項目', 'layer は', 'stage は', '文言が空', 'stage を付けません', 'score は', 'place／control', 'status は']) {
      expect(all).toContain(s);
    }
  });

  it('先頭の BOM があっても読める', () => {
    expect(parseSeed(`﻿${JSON.stringify(SEED)}`).ok).toBe(true);
  });

  it('文字化け（UTF-8 でないファイル）は断る', () => {
    const p = parseSeed(JSON.stringify({ ...SEED, goals: ['���'] }));
    expect(p.ok).toBe(false);
    expect(p.errors[0]).toMatch(/UTF-8/);
  });

  it('年は去年か今年だけ（先の年への打ち間違いを止める）', () => {
    expect(parseSeed(JSON.stringify(SEED), { currentYear: 2026 }).ok).toBe(true);
    expect(parseSeed(JSON.stringify(SEED), { currentYear: 2027 }).ok).toBe(true);
    expect(parseSeed(JSON.stringify({ ...SEED, year: 2027 }), { currentYear: 2026 }).errors[0]).toMatch(/2025 か 2026/);
    expect(parseSeed(JSON.stringify(SEED), { currentYear: 2028 }).ok).toBe(false);
  });

  it('取り込みは年を問わず1回だけ（別の年の分を足すと引き継ぎと重なるため）', () => {
    const rows = asRows(seedDrafts({ ...SEED, principles: [] }, makeId));
    const m = buildModel(rows, [], { currentYear: 2026 });
    expect(seedAlreadyImported(m.records)).toBe(true);
    // 未保存の行だけでも止める
    const pending = buildModel([], rows.slice(0, 1), { currentYear: 2026 });
    expect(seedAlreadyImported(pending.records)).toBe(true);
  });
});
