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

  it('合言葉で通ると端末の鍵を渡す。鍵で通る時は新しい鍵を渡さない', () => {
    const env = makeEnv();
    const first = env.post({ action: 'readAll', pass: 'ひみつの合言葉' });
    expect(first.key).toMatch(/^[0-9a-f-]{36}.[A-Za-z0-9_=-]+$/);
    const byKey = env.post({ action: 'readAll', key: first.key });
    expect(byKey.ok).toBe(true);
    expect(byKey.key).toBeUndefined();
    // 端末ごとに別の鍵
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).key).not.toBe(first.key);
  });

  it('他の人が合言葉をわざと間違えて止めても、鍵のある端末は使える', () => {
    const env = makeEnv();
    const { key } = env.post({ action: 'readAll', pass: 'ひみつの合言葉' });
    for (let i = 0; i < 10; i++) env.post({ action: 'readAll', pass: 'ちがう' });
    expect(env.post({ action: 'readAll', pass: 'ひみつの合言葉' }).error).toBe('locked');
    expect(env.post({ action: 'readAll', key }).ok).toBe(true);
    expect(env.post({ action: 'append', key, rows: [row('rtest0001')], known: 0 }).ok).toBe(true);
  });

  it('作り変えた鍵・合言葉を変えた後の鍵は通らず、間違いとして数える', () => {
    const env = makeEnv();
    const { key } = env.post({ action: 'readAll', pass: 'ひみつの合言葉' });
    const forged = key.slice(0, -2) + (key.at(-2) === 'A' ? 'B' : 'A') + key.slice(-1);
    expect(env.post({ action: 'readAll', key: forged }).error).toBe('auth');
    expect(env.post({ action: 'readAll', key: 'x'.repeat(300) }).error).toBe('auth');
    expect(env.cache.get('gm_fails')).toBe('2');
    env.props.set('PASSPHRASE', '新しい合言葉');
    expect(env.post({ action: 'readAll', key }).error).toBe('auth');
    expect(env.post({ action: 'readAll', pass: '新しい合言葉' }).ok).toBe(true);
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
    // シートは先頭の ' を外して保存する（実物の往復テストで確かめた）
    const env = makeEnv();
    const tricky = ['=1+1', '+5', '-3', '@x', "'x", "'=x", "''", "'", '1/2', '12月6日', '001', 'TRUE', '1e3', '2026-12-06', '{"a":1}'];
    env.post({ action: 'append', pass: P, rows: tricky.map((t, i) => row(`rtrick${String(i).padStart(3, '0')}`, { text: t })), known: 0 });
    const back = env.post({ action: 'readAll', pass: P }).rows.map((r) => r[9]);
    expect(back).not.toContain('#数式になった');
    expect(back).toEqual(tricky);
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

  it('入っている行を年明けの後に送り直しても year にしない（返事が届かなかった送り直し）', () => {
    const env = makeEnv({ nowMs: Date.UTC(2026, 11, 31, 3, 0, 0) }); // 26年12月31日
    const dec = row('rtest0001', { kind: 'アイスバーグ', year: '2026' });
    expect(env.post({ action: 'append', pass: P, rows: [dec], known: 0 }).ok).toBe(true);
    env.setClock(Date.UTC(2027, 0, 10, 0, 0, 0)); // 1月10日：猶予の後
    const again = env.post({ action: 'append', pass: P, rows: [dec, row('rtest0002')], known: 0 });
    expect(again).toMatchObject({ ok: true, appended: 1, skipped: 1 });
    // 新しい前の年の行は、これまでどおり断る（何行目かは送った並びの番号）
    const late = row('rtest0003', { kind: 'アイスバーグ', year: '2026' });
    expect(env.post({ action: 'append', pass: P, rows: [dec, late], known: 2 })).toMatchObject({ ok: false, error: 'year', rowsIndex: [1] });
    expect(env.data).toHaveLength(3);
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

  it('速さ：シートを読むのは getLastRow と最近の行の1回だけ。書いた後に読み直さない', () => {
    const env = makeEnv();
    env.post({ action: 'append', pass: P, rows: [row('rtest0001'), row('rtest0002')], known: 0 });
    env.log.length = 0;
    const res = env.post({ action: 'append', pass: P, rows: [row('rtest0003')], known: 2 });
    expect(res.rows.map((r) => r[2])).toEqual(['rtest0003']);
    expect(env.log.filter((l) => l.startsWith('getValues'))).toHaveLength(1);
    expect(env.log.filter((l) => l === 'getProperties')).toHaveLength(1);
    expect(env.log.indexOf('setValues')).toBeGreaterThan(env.log.findIndex((l) => l.startsWith('getValues')));
    expect(typeof res.serverMs).toBe('number');
  });

  it('返事の行は、読み直した時と同じ文字（数式に化けやすい文字も）', () => {
    const env = makeEnv();
    const tricky = ['=1+1', "'x", '001', '2026-12-06', '{"a":1}'];
    const res = env.post({ action: 'append', pass: P, rows: tricky.map((t, i) => row(`rtrick${String(i).padStart(3, '0')}`, { text: t })), known: 0 });
    expect(res.rows).toEqual(env.post({ action: 'readAll', pass: P }).rows);
  });

  it('重なりは最近の行で確かめる（別の端末の行が間にあっても、送り直しは足さない）', () => {
    const env = makeEnv();
    env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 });
    for (let i = 0; i < 20; i++) env.post({ action: 'append', pass: P, rows: [row(`rother${String(i).padStart(3, '0')}`)], known: i + 1 });
    const again = env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 21 });
    expect(again).toMatchObject({ ok: true, appended: 0, skipped: 1, count: 21 });
    expect(again.rows).toEqual([]);
    // 画面が古い時は、known より後を全部返す
    const old = env.post({ action: 'append', pass: P, rows: [row('rtest0100')], known: 19 });
    expect(old.rows.map((r) => r[2])).toEqual(['rother018', 'rother019', 'rtest0100']);
  });
});

describe('GAS：控えの複製', () => {
  const P = 'ひみつの合言葉';
  const at = (y, m, d, h = 3) => Date.UTC(y, m - 1, d, h - 9, 10, 0); // 日本時間

  it('シートと同じフォルダに「〇〇の控え」を作り、records を写した控えを置く。最後の控えを画面に返す', () => {
    const env = makeEnv({ nowMs: at(2026, 10, 1) });
    env.post({ action: 'append', pass: P, rows: [row('rtest0001', { text: '=1+1' }), row('rtest0002', { text: "'x" })], known: 0 });
    expect(env.post({ action: 'readAll', pass: P }).backup).toBeNull();

    expect(env.ctx.backupNow()).toBe('控えを作りました：成長の地図DB-テスト_控え_2026-10-01（2行）');
    const folder = [...env.drive.folders.values()].find((f) => f.name === '成長の地図DB-テストの控え');
    expect(folder.parent).toBe(env.drive.home);
    expect(env.props.get('BACKUP_FOLDER_ID')).toBe(folder.id);
    const copies = [...env.drive.files.values()].filter((f) => f.ss);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ name: '成長の地図DB-テスト_控え_2026-10-01', parent: folder.id });
    // 控えの中は records だけ。元と同じ文字
    expect(copies[0].ss.sheets.map((s) => s.name)).toEqual(['records']);
    expect(copies[0].ss.sheets[0].rows).toEqual(env.data);
    // 元のシートはそのまま（書き換え・削除なし）。写す間は鍵をかける
    expect(env.data).toHaveLength(3);
    const i = env.log.indexOf('copyTo');
    expect(env.log.lastIndexOf('lock', i)).toBeGreaterThan(env.log.lastIndexOf('unlock', i));

    expect(env.post({ action: 'readAll', pass: P }).backup).toEqual({ at: '2026-10-01T03:10:00.000+09:00', rows: 2 });
  });

  it('同じ日は2回作らない。次の月は同じフォルダに足す（古い控えは消さない）', () => {
    const env = makeEnv({ nowMs: at(2026, 10, 1) });
    env.ctx.backupNow();
    expect(env.ctx.backupNow()).toBe('今日の控えはもうあります：成長の地図DB-テスト_控え_2026-10-01');
    env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 });
    env.setClock(at(2026, 11, 1));
    expect(env.ctx.backupNow()).toBe('控えを作りました：成長の地図DB-テスト_控え_2026-11-01（1行）');
    const copies = [...env.drive.files.values()].filter((f) => f.ss);
    expect(copies.map((c) => c.name)).toEqual(['成長の地図DB-テスト_控え_2026-10-01', '成長の地図DB-テスト_控え_2026-11-01']);
    expect(new Set(copies.map((c) => c.parent)).size).toBe(1);
    expect([...env.drive.folders.values()].filter((f) => f.name.endsWith('の控え'))).toHaveLength(1);
  });

  it('控えフォルダがごみ箱にあれば作り直す', () => {
    const env = makeEnv({ nowMs: at(2026, 10, 1) });
    env.ctx.backupNow();
    env.drive.folders.get(env.props.get('BACKUP_FOLDER_ID')).trashed = true;
    env.setClock(at(2026, 11, 1));
    env.ctx.backupNow();
    const live = [...env.drive.folders.values()].filter((f) => f.name.endsWith('の控え') && !f.trashed);
    expect(live).toHaveLength(1);
    expect(env.props.get('BACKUP_FOLDER_ID')).toBe(live[0].id);
  });

  it('シートがなければ setup（控えは作らない）', () => {
    const env = makeEnv();
    env.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName = () => null;
    expect(() => env.ctx.backupNow()).toThrow('setup');
    expect([...env.drive.files.values()].filter((f) => f.ss)).toHaveLength(0);
  });

  it('画面の読み書きでは控えを作らない（控えは時間指定と手で実行した時だけ）', () => {
    const env = makeEnv();
    env.post({ action: 'append', pass: P, rows: [row('rtest0001')], known: 0 });
    env.post({ action: 'readAll', pass: P });
    expect(env.log).not.toContain('create');
    expect(env.drive.folders.size).toBe(2);
  });
});

describe('GAS：時間指定と12月のお知らせ', () => {
  const P = 'ひみつの合言葉';
  const at = (y, m, d, h = 9) => Date.UTC(y, m - 1, d, h - 9, 5, 0);

  it('setupSchedule：毎月1日3時台の控えと、毎月25日9時台のお知らせを作り、控えを1つ作る。何回実行しても2つだけ', () => {
    const env = makeEnv({ nowMs: at(2026, 9, 29) });
    env.triggers.push({ handler: 'ほかの仕組み' });
    expect(env.ctx.setupSchedule()).toMatch(/^時間指定を作りました.*控えを作りました：成長の地図DB-テスト_控え_2026-09-29/);
    env.ctx.setupSchedule();
    expect(env.triggers).toEqual([
      { handler: 'ほかの仕組み' },
      { handler: 'backupNow', monthDay: 1, hour: 3 },
      { handler: 'decemberNotice', monthDay: 25, hour: 9 },
    ]);
    expect(env.ctx.stopSchedule()).toBe('時間指定を2個消しました');
    expect(env.triggers).toEqual([{ handler: 'ほかの仕組み' }]);
  });

  it('12月だけ送る。同じ年は1回だけ。次の年はまた送る', () => {
    const env = makeEnv({ nowMs: at(2026, 11, 25) });
    expect(env.ctx.decemberNotice()).toBe('12月ではないので送りません');
    expect(env.mails).toHaveLength(0);

    env.setClock(at(2026, 12, 25));
    expect(env.ctx.decemberNotice()).toBe('2026年のお知らせを送りました');
    expect(env.ctx.decemberNotice()).toBe('2026年のお知らせは送ってあります');
    expect(env.mails).toHaveLength(1);
    expect(env.mails[0]).toMatchObject({ to: 'owner@example.com', subject: 'grops：振り返りの時期です', name: 'grops' });
    expect(env.mails[0].body).toContain('https://ooshiro-a.github.io/growth-map/#/review');

    env.setClock(at(2027, 12, 25));
    env.ctx.decemberNotice();
    expect(env.mails).toHaveLength(2);
  });

  it('宛先は NOTIFY_EMAIL があればそちら。本文に記録の中身は入れず、最後の控えを添える。試しは件名に印', () => {
    const env = makeEnv({ nowMs: at(2026, 12, 1, 3) });
    env.post({ action: 'append', pass: P, rows: [row('rtest0001', { text: '作り物の秘密の言葉' })], known: 0 });
    env.ctx.backupNow();
    env.props.set('NOTIFY_EMAIL', 'notice@example.com');
    expect(env.ctx.testNotice()).toBe('試しのお知らせを送りました');
    const m = env.mails[0];
    expect(m).toMatchObject({ to: 'notice@example.com', subject: '（試し）grops：振り返りの時期です' });
    expect(m.body).toContain('最後の控え：2026年12月1日（1行）');
    expect(m.body).not.toContain('作り物の秘密の言葉');
    expect(env.props.get('NOTICE_SENT')).toBeUndefined();
  });
});
