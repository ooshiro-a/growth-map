// 読み込み・書き込み・未保存の行・前回の内容の控え
// - 起動時に全部を1回読む。前回の控えがあれば先に出す（開いてすぐ見えるように）
// - 書き込みはすぐ画面に出し（未保存）、GAS へ送る。失敗したら同じ記録番号で送り直す
// - 送った返事に「知っている行より後の行」が全部入るので、書くたびに最新になる
// - シートは足すだけなので、手元の行は減らさない（読み込みと送信が重なっても消えない）
// - 送れない行（形がおかしい・前の年）は「送れなかった記録」に移し、残りは送り続ける
import * as defaultApi from './api.js';
import { ERROR_TEXT } from './api.js';
import { toJstIso } from './dates.js';
import { newRecordNo } from './ids.js';
import { SCHEMA_VERSION, toRow } from './schema.js';

const RETRY_MS = [3000, 10000, 30000, 60000];
const LOCKED_RETRY_MS = 5 * 60 * 1000;
const BATCH = 200;
export const MAX_CELL = 20000;

// primary の後ろに、extra のうち primary にない記録番号の行を足す
export function mergeByNo(primary, extra) {
  const have = new Set(primary.map((r) => r[2]));
  return primary.concat(extra.filter((r) => !have.has(r[2])));
}

const noOf = (p) => p.row[2];
const unionPending = (a, b) => {
  const have = new Set(a.map(noOf));
  return a.concat(b.filter((p) => !have.has(noOf(p))));
};

export function createStore({
  env,
  url,
  storage,
  api = defaultApi,
  nowFn = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  win = typeof window !== 'undefined' ? window : null,
}) {
  const key = (name) => `gm.${name}.${env}`;
  const load = (name, fallback) => {
    try {
      const s = storage && storage.getItem(key(name));
      return s ? JSON.parse(s) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (name, v) => {
    try {
      if (!storage) return;
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) storage.removeItem(key(name));
      else storage.setItem(key(name), JSON.stringify(v));
    } catch {
      /* 保存できなくても、この画面では続けて使える */
    }
  };

  const cache = load('cache', null);
  let state = {
    env,
    url,
    pass: load('pass', ''),
    rows: (cache && Array.isArray(cache.rows) && cache.rows) || [],
    cachedAt: (cache && cache.savedAt) || null,
    pending: load('pending', []),
    failed: load('failed', []), // [{ row, reason: 'bad' | 'year', at }]
    phase: 'init', // init | needPass | loading | ready | error
    refreshing: false,
    saving: false,
    error: null,
    notice: null,
    serverYear: null,
    syncedSeq: 0, // シートの全部をそろえられた、いちばん新しい読み込み・送信の番号（store.seq() と比べる）
  };
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };

  let flushing = false;
  let retryTimer = null;
  let retryCount = 0;
  let lockedTimer = null;
  let gen = 0; // 送れた回数（読み込みと送信が重なったかを見分ける）
  let reqSeq = 0; // 読み込み・送信を始めた回数
  let disposed = false;

  const hasData = () => state.rows.length > 0 || !!state.cachedAt;
  const saveCache = () => save('cache', { rows: state.rows, savedAt: nowFn() });

  // 他のタブが書いた未保存と合わせてから保存する（上書きで消さない）
  const persistPending = (pending, removedNos = new Set()) => {
    const stored = load('pending', []).filter((p) => !removedNos.has(noOf(p)));
    const merged = unionPending(pending, stored);
    save('pending', merged);
    return merged;
  };

  const moveToFailed = (entries, reason) => {
    if (!entries.length) return;
    const at = nowFn();
    const failed = state.failed.concat(entries.map((p) => ({ row: p.row, reason, at })));
    const nos = new Set(entries.map(noOf));
    const pending = persistPending(
      state.pending.filter((p) => !nos.has(noOf(p))),
      nos,
    );
    save('failed', failed);
    set({ failed, pending });
  };

  function handleError(e, where, batch) {
    const code = (e && e.code) || 'server';
    const detail = (e && e.detail) || {};
    if (code === 'auth') {
      save('pass', '');
      set({ pass: '', phase: 'needPass', error: code, refreshing: false });
      return;
    }
    if (code === 'locked') {
      // 前回の内容があれば見せたまま、しばらくして読み直す
      if (hasData()) {
        set({ phase: 'ready', error: code, notice: ERROR_TEXT.locked, refreshing: false });
        if (!lockedTimer) {
          lockedTimer = setTimer(() => {
            lockedTimer = null;
            reload();
          }, LOCKED_RETRY_MS);
        }
      } else {
        set({ phase: 'needPass', error: code, refreshing: false });
      }
      return;
    }
    if (code === 'year' && batch) {
      const idx = Array.isArray(detail.rowsIndex) ? detail.rowsIndex : [];
      const rejected = idx.map((i) => batch[i]).filter(Boolean);
      moveToFailed(rejected, 'year');
      set({ notice: `前の年の地図の記録が${rejected.length}件、保存できませんでした（設定の「送れなかった記録」で見られます）`, error: null });
      reload();
      return;
    }
    if (code === 'bad' && batch && Number.isInteger(detail.row) && batch[detail.row]) {
      moveToFailed([batch[detail.row]], 'bad');
      set({ notice: '送れなかった記録が1件あります（設定の「送れなかった記録」で見られます）', error: null });
      return 'again'; // 残りを続けて送る
    }
    if (where === 'load') {
      set({ phase: hasData() ? 'ready' : 'error', error: code, refreshing: false });
      return;
    }
    // 送れなかった：未保存のまま残し、時間をおいて送り直す
    set({ error: code });
    if (code !== 'upgrade' && code !== 'setup' && code !== 'bad') scheduleRetry();
  }

  function scheduleRetry() {
    if (retryTimer || disposed) return;
    const ms = RETRY_MS[Math.min(retryCount, RETRY_MS.length - 1)];
    retryCount++;
    retryTimer = setTimer(() => {
      retryTimer = null;
      flush();
    }, ms);
  }

  async function reload() {
    if (disposed) return;
    if (!state.url) {
      set({ phase: 'error', error: 'nourl' });
      return;
    }
    if (!state.pass) {
      set({ phase: 'needPass' });
      return;
    }
    const startGen = gen;
    const my = ++reqSeq;
    // 一度読めていれば（シートが空でも）画面はそのまま。「読み込み中」は最初の1回だけ
    set({ phase: hasData() || state.phase === 'ready' ? 'ready' : 'loading', refreshing: true, error: null });
    try {
      const res = await api.readAll(state.url, state.pass);
      if (disposed) return;
      const snap = Array.isArray(res.rows) ? res.rows : [];
      // 読んでいる間に送れた行があれば、読んだ内容の後ろに残す
      const rows = gen !== startGen || flushing ? mergeByNo(snap, state.rows) : snap;
      // 止まっていた知らせは、読めたら消す
      const notice = state.notice === ERROR_TEXT.locked ? null : state.notice;
      set({ rows, cachedAt: null, phase: 'ready', refreshing: false, error: null, notice, serverYear: res.serverYear ?? null, syncedSeq: Math.max(state.syncedSeq, my) });
      saveCache();
    } catch (e) {
      if (!disposed) handleError(e, 'load');
      return;
    }
    flush();
  }

  async function flush() {
    if (disposed || flushing || !state.pending.length || !state.pass || !state.url || state.phase === 'needPass') return;
    if (retryTimer) {
      clearTimer(retryTimer);
      retryTimer = null;
    }
    flushing = true;
    set({ saving: true });
    const batch = state.pending.slice(0, BATCH);
    const my = ++reqSeq;
    let again = false;
    try {
      const known = state.rows.length;
      const res = await api.append(state.url, state.pass, batch.map((p) => p.row), known);
      if (disposed) return;
      const tail = Array.isArray(res.rows) ? res.rows : [];
      const from = Number(res.from) || 0;
      let rows;
      let gap = false;
      if (from <= state.rows.length) rows = mergeByNo(state.rows.slice(0, from).concat(tail), state.rows.slice(from));
      else {
        // 手元の行が送信中に減っていた：重ならないように足し、あとで全部読み直す
        rows = mergeByNo(state.rows, tail);
        gap = true;
      }
      const sent = new Set(batch.map(noOf));
      const pending = persistPending(
        state.pending.filter((p) => !sent.has(noOf(p))),
        sent,
      );
      gen++;
      retryCount = 0;
      set({ rows, pending, cachedAt: null, error: null, serverYear: res.serverYear ?? state.serverYear, syncedSeq: gap ? state.syncedSeq : Math.max(state.syncedSeq, my) });
      saveCache();
      again = pending.length > 0;
      if (gap) setTimer(() => reload(), 0);
    } catch (e) {
      if (!disposed && handleError(e, 'flush', batch) === 'again') again = state.pending.length > 0;
    } finally {
      flushing = false;
      if (!disposed) set({ saving: false });
    }
    if (again) flush();
  }

  // 画面から：下書き（年・種類・項目番号…）を行にして未保存に足し、送る
  // 長すぎる文字などは足さずに null を返す
  function add(drafts) {
    const at = toJstIso(nowFn());
    const rows = drafts.map((d) => toRow({ ...d, at, no: newRecordNo(), ver: SCHEMA_VERSION }));
    if (rows.some((r) => r.some((c) => c.length > MAX_CELL))) {
      set({ notice: `文字が長すぎます（1つの欄は${MAX_CELL}字まで）` });
      return null;
    }
    const pending = persistPending(state.pending.concat(rows.map((row) => ({ row }))));
    set({ pending });
    flush();
    return rows;
  }

  function setPass(p) {
    const pass = String(p || '');
    save('pass', pass);
    set({ pass, error: null });
  }

  function forgetPass() {
    save('pass', '');
    set({ pass: '', phase: 'needPass', error: null });
  }

  function discardFailed(no) {
    const failed = state.failed.filter((f) => f.row[2] !== no);
    save('failed', failed);
    set({ failed });
  }

  // 他のタブで未保存が増えた時に取り込む
  const onStorage = (e) => {
    if (e.key !== key('pending')) return;
    const stored = load('pending', []);
    set({ pending: unionPending(state.pending, stored) });
  };
  if (win && win.addEventListener) win.addEventListener('storage', onStorage);

  function dispose() {
    disposed = true;
    if (retryTimer) clearTimer(retryTimer);
    if (lockedTimer) clearTimer(lockedTimer);
    retryTimer = null;
    lockedTimer = null;
    if (win && win.removeEventListener) win.removeEventListener('storage', onStorage);
    listeners.clear();
  }

  return {
    getState: () => state,
    seq: () => reqSeq,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reload,
    flush,
    add,
    setPass,
    forgetPass,
    discardFailed,
    dispose,
    notify: (text) => set({ notice: text }),
    clearNotice: () => set({ notice: null }),
  };
}
