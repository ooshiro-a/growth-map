// gas/Code.gs を Google のサービスの作り物の上で動かして確かめる
import { describe, expect, it } from 'vitest';
import { makeGasSim } from '../tools/gas-sim.js';

const makeEnv = (o = {}) => makeGasSim({ nowMs: Date.UTC(2026, 8, 27, 3, 0, 0), ...o });

const row = (no, o = {}) => [
  '',
  '1',
  no,
  o.year ?? '',
  o.kind ?? '指標',
  o.id ?? 'nx',
  '',
  o.op ?? '追加',
  o.layer ?? '',
  o.text ?? '言葉',
  o.value ?? '',
  o.extra ?? '',
];

describe('GAS：合言葉', () => {
  it('違えば auth。10回続けて違えば30分止める', () => {
    const env = makeEnv();
    for (let i = 0; i < 9; i++) expect(env.post({ action: 'readAll', pass: 'ちがう' }).error).toBe('auth');
    expect(env.post({ action: 'readAll', pass: 'ちがう' }).error).toBe('auth');
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).error).toBe('locked');
  });

  it('合っていれば数え直す（9回違えた後に合えば、また9回まで違えても止まらない）', () => {
    const env = makeEnv();
    for (let i = 0; i < 9; i++) env.post({ action: 'readAll', pass: 'ちがう' });
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).ok).toBe(true);
    for (let i = 0; i < 9; i++) expect(env.post({ action: 'readAll', pass: 'ちがう' }).error).toBe('auth');
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).ok).toBe(true);
  });

  it('止まった時はエディタの unlock で解ける', () => {
    const env = makeEnv();
    for (let i = 0; i < 10; i++) env.post({ action: 'readAll', pass: 'ちがう' });
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).error).toBe('locked');
    env.ctx.unlock();
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).ok).toBe(true);
  });

  it('合言葉が未設定なら setup。合っていれば読める', () => {
    expect(makeEnv({ pass: '' }).post({ action: 'readAll', pass: 'x' }).error).toBe('setup');
    const res = makeEnv().post({ action: 'readAll', pass: 'ひみつの合言葉' });
    expect(res).toMatchObject({ ok: true, rows: [], count: 0, serverYear: 2026 });
  });

  it('GET ではデータを返さない', () => {
    const env = makeEnv();
    expect(env.ctx.doGet().body).toEqual({ ok: true, app: 'growth-map' });
  });
});

describe('GAS：行を足す', () => {
  const P = 'ひみつの合言葉';

  it('鍵の中で最後の行を読み、書いて flush してから鍵を外す', () => {
    const env = makeEnv();
    const res = env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 });
    expect(res.ok).toBe(true);
    const i = (s) => env.log.indexOf(s);
    expect(i('lock')).toBeLessThan(i('getLastRow'));
    expect(i('setValues')).toBeLessThan(i('flush'));
    expect(i('flush')).toBeLessThan(i('unlock'));
  });

  it('記録日時をサーバーが付け、前の行より必ず後になる', () => {
    const env = makeEnv();
    env.post({ action: 'append', pass: P, rows: [row('rtest0001'), row('rtest0002')], known: 0 });
    env.post({ action: 'append', pass: P, rows: [row('rtest0003')], known: 2 });
    const times = env.data.slice(1).map((r) => Date.parse(r[0]));
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    expect(env.data[1][0]).toMatch(/\+09:00$/);
  });

  it('同じ記録番号は足さない（送り直し）。返事には known より後の行が全部入る', () => {
    const env = makeEnv();
    env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 });
    const res = env.post({ action: 'append', pass: P, rows: [row('rtest0001'), row('rtest0002'), row('rtest0002')], known: 0 });
    expect(res).toMatchObject({ ok: true, appended: 1, skipped: 2, from: 0, count: 2 });
    expect(res.rows.map((r) => r[2])).toEqual(['rtest0001', 'rtest0002']);
    expect(env.data).toHaveLength(3);
  });

  it('数式や数に化けない（往復して同じ文字）', () => {
    for (const keepApostrophe of [true, false]) {
      const env = makeEnv({ keepApostrophe });
      const tricky = ['=1+1', '+5', '-3', '@x', "'x", "'=x", '1/2', '12月6日', '001', 'TRUE', '1e3', '2026-12-06', '{"a":1}'];
      env.post({ action: 'append', pass: P, rows: tricky.map((t, i) => row(`rtrick${String(i).padStart(3, '0')}`, { text: t })), known: 0 });
      const back = env.post({ action: 'readAll', pass: P }).rows.map((r) => r[9]);
      expect(back).not.toContain('#数式になった');
      if (keepApostrophe) expect(back).toEqual(tricky);
      // シートが先頭の ' を外す場合、「'」＋記号で始まる文字だけは ' が消える（実物の往復テストで確かめる）
      else expect(back.filter((t, i) => t !== tricky[i])).toEqual(['=x']);
    }
  });

  it('シートの行が足りなければ増やしてから書く', () => {
    const env = makeEnv({ maxRows: 2 });
    const res = env.post({ action: 'append', pass: P, rows: [row('rtest0001'), row('rtest0002'), row('rtest0003')], known: 0 });
    expect(res.ok).toBe(true);
    expect(env.log.some((l) => l.startsWith('insertRowsAfter'))).toBe(true);
    expect(env.data).toHaveLength(4);
  });

  it('年ごとの種類で前の年の行は断る（初期データは除く）', () => {
    const env = makeEnv(); // サーバーの年＝2026
    const past = env.post({ action: 'append', pass: P, rows: [row('rtest0001'), row('rtest0002', { kind: 'アイスバーグ', year: '2025' })], known: 0 });
    expect(past).toMatchObject({ ok: false, error: 'year', serverYear: 2026 });
    expect(env.data).toHaveLength(1); // 1行も書かない
    const seed = env.post({ action: 'append', pass: P, rows: [row('rtest0003', { kind: 'アイスバーグ', year: '2025', extra: '{"source":"seed"}' })], known: 0 });
    expect(seed.ok).toBe(true);
    const goal = env.post({ action: 'append', pass: P, rows: [row('rtest0004', { kind: '目標', year: '2025' })], known: 1 });
    expect(goal.ok).toBe(true);
  });

  it('年明け（1月7日まで）は、前の年に書いた行を受け取る。書いた時刻が今年なら断る', () => {
    const env = makeEnv({ nowMs: Date.UTC(2027, 0, 3, 0, 0, 0) }); // 27年1月3日 9:00
    const dec = row('rtest0001', { kind: 'アイスバーグ', year: '2026' });
    dec[0] = '2026-12-30T21:00:00.000+09:00';
    expect(env.post({ action: 'append', pass: P, rows: [dec], known: 0 }).ok).toBe(true);
    const jan = row('rtest0002', { kind: 'アイスバーグ', year: '2026' });
    jan[0] = '2027-01-03T09:00:00.000+09:00';
    const ok = row('rtest0003');
    expect(env.post({ action: 'append', pass: P, rows: [ok, jan], known: 1 })).toMatchObject({ ok: false, error: 'year', rowsIndex: [1] });
    env.setClock(Date.UTC(2027, 0, 8, 0, 0, 0)); // 1月8日
    const late = row('rtest0004', { kind: 'アイスバーグ', year: '2026' });
    late[0] = '2026-12-31T10:00:00.000+09:00';
    expect(env.post({ action: 'append', pass: P, rows: [late], known: 1 }).error).toBe('year');
  });

  it('形のおかしい行は何行目かを返す', () => {
    const env = makeEnv();
    const res = env.post({ action: 'append', pass: P, rows: [row('rtest0001'), row('x')], known: 0 });
    expect(res).toMatchObject({ ok: false, error: 'bad', row: 1 });
    expect(env.data).toHaveLength(1);
  });

  it('形のおかしい行は bad（記録番号なし・13列・版が数でない）', () => {
    const env = makeEnv();
    expect(env.post({ action: 'append', pass: P, rows: [row('')], known: 0 }).error).toBe('bad');
    expect(env.post({ action: 'append', pass: P, rows: [[...row('rtest0001'), 'x']], known: 0 }).error).toBe('bad');
    const r2 = row('rtest0002');
    r2[1] = 'v1';
    expect(env.post({ action: 'append', pass: P, rows: [r2], known: 0 }).error).toBe('bad');
    expect(env.post({ action: 'append', pass: P, rows: [], known: 0 }).error).toBe('bad');
    expect(env.data).toHaveLength(1);
  });

  it('シートがなければ setup。書く途中で失敗しても鍵を外す', () => {
    const env = makeEnv({ maxRows: 1 });
    env.ctx.SpreadsheetApp.getActiveSpreadsheet = () => ({ getSheetByName: () => null });
    expect(env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 }).error).toBe('setup');
    expect(env.log.at(-1)).toBe('unlock');
  });

  it('known がおかしければ全部の行を返す', () => {
    const env = makeEnv();
    env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 });
    const res = env.post({ action: 'append', pass: P, rows: [row('rtest0002')], known: 99 });
    expect(res.from).toBe(0);
    expect(res.rows).toHaveLength(2);
  });

  it('古い画面は MIN_CLIENT_VERSION で断る', () => {
    const env = makeEnv();
    env.props.set('MIN_CLIENT_VERSION', '2');
    expect(env.post({ action: 'readAll', pass: P, clientVersion: 1 }).error).toBe('upgrade');
  });
});
