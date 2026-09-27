import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api.js';
import { createStore } from '../src/lib/store.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

// 作り物の GAS（行を持っていて、append は known より後の行を返す）
function fakeApi({ fail } = {}) {
  const sheet = [];
  const calls = [];
  return {
    sheet,
    calls,
    readAll: vi.fn(async (url, pass) => {
      calls.push('readAll');
      if (pass !== 'ok') throw new ApiError('auth');
      return { ok: true, rows: sheet.map((r) => r.slice()), count: sheet.length, serverYear: 2026 };
    }),
    append: vi.fn(async (url, pass, rows, known) => {
      calls.push('append');
      if (fail && fail.length) throw fail.shift();
      const have = new Set(sheet.map((r) => r[2]));
      for (const r of rows) if (!have.has(r[2])) sheet.push(r.slice());
      const from = known >= 0 && known <= sheet.length ? known : 0;
      return { ok: true, rows: sheet.slice(from).map((r) => r.slice()), from, count: sheet.length, serverYear: 2026 };
    }),
  };
}

const draft = (text) => ({ kind: '指標', id: 'nx' + text, op: '追加', text });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('保存の流れ', () => {
  it('合言葉がなければ needPass。入れると読める', async () => {
    const api = fakeApi();
    const s = createStore({ env: 'test', url: 'u', storage: memoryStorage(), api });
    await s.reload();
    expect(s.getState().phase).toBe('needPass');
    s.setPass('ok');
    await s.reload();
    expect(s.getState().phase).toBe('ready');
  });

  it('書くとすぐ未保存に入り、送れたら消える。返事の行で最新になる', async () => {
    const api = fakeApi();
    api.sheet.push(['t', '1', 'rother001', '', '指標', 'no', '', '追加', '', '別の端末', '', '']);
    const storage = memoryStorage();
    const s = createStore({ env: 'test', url: 'u', storage, api });
    s.setPass('ok');
    s.add([draft('一')]);
    expect(s.getState().pending).toHaveLength(1);
    await tick();
    await tick();
    const st = s.getState();
    expect(st.pending).toHaveLength(0);
    expect(st.rows.map((r) => r[9])).toEqual(['別の端末', '一']);
    expect(storage.getItem('gm.pending.test')).toBeNull(); // 空になったら消す
  });

  it('通信に失敗したら未保存のまま残し、同じ記録番号で送り直す', async () => {
    const api = fakeApi({ fail: [new ApiError('timeout')] });
    let retry = null;
    const s = createStore({
      env: 'test',
      url: 'u',
      storage: memoryStorage(),
      api,
      setTimer: (fn) => {
        retry = fn;
        return 1;
      },
      clearTimer: () => {},
    });
    s.setPass('ok');
    const [row] = s.add([draft('一')]);
    await tick();
    expect(s.getState().pending).toHaveLength(1);
    expect(s.getState().error).toBe('timeout');
    expect(retry).toBeTypeOf('function');
    retry();
    await tick();
    await tick();
    expect(s.getState().pending).toHaveLength(0);
    expect(api.append.mock.calls[1][2][0][2]).toBe(row[2]);
    expect(api.sheet).toHaveLength(1);
  });

  it('合言葉が違うと言われたら、記憶を消して needPass（未保存は残す）', async () => {
    const api = fakeApi({ fail: [new ApiError('auth')] });
    const s = createStore({ env: 'test', url: 'u', storage: memoryStorage(), api });
    s.setPass('ok');
    s.add([draft('一')]);
    await tick();
    expect(s.getState().phase).toBe('needPass');
    expect(s.getState().pass).toBe('');
    expect(s.getState().pending).toHaveLength(1);
  });

  it('前の年の行と言われたら、その行を「送れなかった記録」に移して知らせ、残りは送る', async () => {
    const api = fakeApi({ fail: [new ApiError('year', { serverYear: 2027, rowsIndex: [0] })] });
    const s = createStore({ env: 'test', url: 'u', storage: memoryStorage(), api });
    s.setPass('ok');
    s.add([
      { year: 2026, kind: 'アイスバーグ', id: 'na', op: '採点', value: '3' },
      { kind: '指標', id: 'nb', op: '追加', text: '残る' },
    ]);
    for (let i = 0; i < 5; i++) await tick();
    expect(api.calls).toContain('readAll');
    expect(api.sheet.map((r) => r[9])).toEqual(['残る']);
    expect(s.getState().failed.map((f) => [f.reason, f.row[4]])).toEqual([['year', 'アイスバーグ']]);
    expect(s.getState().notice).toMatch(/1件、保存できませんでした/);
  });

  it('前回の内容を控えから先に出す', async () => {
    const storage = memoryStorage();
    storage.setItem('gm.cache.test', JSON.stringify({ rows: [['t', '1', 'rcache01', '', '指標', 'n1', '', '追加', '', '控え', '', '']], savedAt: 1 }));
    storage.setItem('gm.pass.test', JSON.stringify('ok'));
    const api = fakeApi();
    const s = createStore({ env: 'test', url: 'u', storage, api });
    expect(s.getState().rows).toHaveLength(1);
    const p = s.reload();
    expect(s.getState().phase).toBe('ready');
    expect(s.getState().refreshing).toBe(true);
    await p;
    expect(s.getState().rows).toHaveLength(0);
    expect(s.getState().refreshing).toBe(false);
  });

  it('読み込みと送信が重なっても、送れた行が画面から消えない', async () => {
    const api = fakeApi();
    api.sheet.push(['t', '1', 'rbase0001', '', '指標', 'n1', '', '追加', '', '前からある', '', '']);
    let release;
    const stale = api.sheet.map((r) => r.slice());
    api.readAll = vi.fn(() => new Promise((res) => (release = () => res({ ok: true, rows: stale, count: stale.length, serverYear: 2026 }))));
    const storage = memoryStorage();
    storage.setItem('gm.cache.test', JSON.stringify({ rows: stale, savedAt: 1 }));
    storage.setItem('gm.pass.test', JSON.stringify('ok'));
    const s = createStore({ env: 'test', url: 'u', storage, api });
    const loading = s.reload(); // 遅い読み込み（古い内容）
    s.add([draft('送った')]);
    await tick();
    await tick();
    expect(s.getState().rows.map((r) => r[9])).toEqual(['前からある', '送った']);
    release();
    await loading;
    expect(s.getState().rows.map((r) => r[9])).toEqual(['前からある', '送った']);
    s.add([draft('次')]);
    await tick();
    await tick();
    expect(s.getState().rows.map((r) => r[9])).toEqual(['前からある', '送った', '次']);
  });

  it('形のおかしい行は「送れなかった記録」に移し、残りは送る', async () => {
    const api = fakeApi();
    const append = api.append;
    api.append = vi.fn(async (url, pass, rows, known) => {
      const i = rows.findIndex((r) => r[9] === '悪い行');
      if (i >= 0) throw new ApiError('bad', { row: i });
      return append(url, pass, rows, known);
    });
    const storage = memoryStorage();
    const s = createStore({ env: 'test', url: 'u', storage, api });
    s.setPass('ok');
    s.add([draft('悪い行')]);
    s.add([draft('良い行')]);
    for (let i = 0; i < 6; i++) await tick();
    expect(s.getState().failed.map((f) => f.reason)).toEqual(['bad']);
    expect(s.getState().pending).toHaveLength(0);
    expect(api.sheet.map((r) => r[9])).toEqual(['良い行']);
    expect(JSON.parse(storage.getItem('gm.failed.test'))).toHaveLength(1);
    s.discardFailed(s.getState().failed[0].row[2]);
    expect(s.getState().failed).toHaveLength(0);
  });

  it('長すぎる文字は足さない', () => {
    const s = createStore({ env: 'test', url: 'u', storage: memoryStorage(), api: fakeApi() });
    expect(s.add([draft('あ'.repeat(20001))])).toBeNull();
    expect(s.getState().pending).toHaveLength(0);
    expect(s.getState().notice).toMatch(/長すぎます/);
  });

  it('合言葉を続けて違えて止まっても、前回の内容は見せたまま', async () => {
    const storage = memoryStorage();
    storage.setItem('gm.cache.test', JSON.stringify({ rows: [['t', '1', 'rcache01', '', '指標', 'n1', '', '追加', '', '控え', '', '']], savedAt: 1 }));
    storage.setItem('gm.pass.test', JSON.stringify('ok'));
    const api = fakeApi();
    api.readAll = vi.fn(async () => {
      throw new ApiError('locked');
    });
    const timers = [];
    const s = createStore({ env: 'test', url: 'u', storage, api, setTimer: (fn, ms) => timers.push(ms), clearTimer: () => {} });
    await s.reload();
    expect(s.getState().phase).toBe('ready');
    expect(s.getState().rows).toHaveLength(1);
    expect(s.getState().notice).toMatch(/止めています/);
    expect(timers).toContain(5 * 60 * 1000);
    // 解けて読めたら、止まっていた知らせは消える
    api.readAll = vi.fn(async () => ({ ok: true, rows: [], count: 0, serverYear: 2026 }));
    await s.reload();
    expect(s.getState().notice).toBeNull();
    expect(s.getState().error).toBeNull();
  });

  it('合言葉を消すと、前のエラーも消える', async () => {
    const api = fakeApi({ fail: [new ApiError('network')] });
    const s = createStore({ env: 'test', url: 'u', storage: memoryStorage(), api, setTimer: () => 1, clearTimer: () => {} });
    s.setPass('ok');
    s.add([draft('一')]);
    await tick();
    expect(s.getState().error).toBe('network');
    s.forgetPass();
    expect(s.getState()).toMatchObject({ phase: 'needPass', error: null, pass: '' });
  });

  it('空のシートでも、一度読めたら読み直しの間に「読み込み中」へ戻らない。読み直しの番号が進む', async () => {
    const api = fakeApi();
    const s = createStore({ env: 'test', url: 'u', storage: memoryStorage(), api });
    s.setPass('ok');
    await s.reload();
    expect(s.getState()).toMatchObject({ phase: 'ready', rows: [] });
    const mark = s.seq();
    const p = s.reload();
    expect(s.getState()).toMatchObject({ phase: 'ready', refreshing: true });
    expect(s.getState().syncedSeq).toBeLessThanOrEqual(mark);
    await p;
    expect(s.getState().syncedSeq).toBeGreaterThan(mark);
  });

  it('2つのタブ：片方の未保存を、もう片方が上書きで消さない', () => {
    const storage = memoryStorage();
    const offline = { readAll: async () => ({ ok: true, rows: [] }), append: async () => { throw new ApiError('network'); } };
    const noTimer = { setTimer: () => 1, clearTimer: () => {} };
    const a = createStore({ env: 'test', url: 'u', storage, api: offline, ...noTimer });
    const b = createStore({ env: 'test', url: 'u', storage, api: offline, ...noTimer });
    a.add([draft('Aで書いた')]);
    b.add([draft('Bで書いた')]);
    const stored = JSON.parse(storage.getItem('gm.pending.test')).map((p) => p.row[9]);
    expect(stored.sort()).toEqual(['Aで書いた', 'Bで書いた']);
  });

  it('接続先ごとに記憶を分ける', () => {
    const storage = memoryStorage();
    const a = createStore({ env: 'prod', url: 'u', storage, api: fakeApi() });
    a.setPass('本番の合言葉');
    const b = createStore({ env: 'test', url: 'u', storage, api: fakeApi() });
    expect(b.getState().pass).toBe('');
  });
});
