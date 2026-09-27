// gas/Code.gs を、Google のサービスの作り物（メモリの中のシート）の上で動かす
// テストと、手元で画面を試す時の「作り物の GAS」（tools/mock-gas.js）で使う
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE_URL = new URL('../gas/Code.gs', import.meta.url);
const HEADER = ['記録日時', '版', '記録番号', '年', '種類', '項目番号', '親番号', '操作', '層・区分', '文言', '状態・点数', '付記'];

function jstIso(d) {
  const t = new Date(d.getTime() + 9 * 3600e3);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}.${p(t.getUTCMilliseconds(), 3)}+09:00`;
}

export function makeGasSim({ pass = 'ひみつの合言葉', maxRows = 1000, nowMs = null, keepApostrophe = true } = {}) {
  const log = [];
  const data = [HEADER.slice()];
  let max = maxRows;
  let clock = nowMs;
  const cache = new Map();
  const props = new Map(pass ? [['PASSPHRASE', pass]] : []);
  const store = (v) => {
    const s = String(v);
    if (s.startsWith('=')) return '#数式になった';
    if (!keepApostrophe && s.startsWith("'")) return s.slice(1);
    return s;
  };
  const range = (row, col, nr, nc) => ({
    getValues: () => {
      log.push(`getValues:${row}`);
      const out = [];
      for (let i = 0; i < nr; i++) {
        const src = data[row - 1 + i] || [];
        out.push(Array.from({ length: nc }, (_, j) => src[col - 1 + j] ?? ''));
      }
      return out;
    },
    getValue: () => (data[row - 1] || [])[col - 1] ?? '',
    setValues: (vals) => {
      log.push('setValues');
      if (row - 1 + vals.length > max) throw new Error('範囲外');
      vals.forEach((v, i) => {
        data[row - 1 + i] = v.map(store);
      });
      return range(row, col, nr, nc);
    },
    setNumberFormat: () => {
      log.push('setNumberFormat');
      return range(row, col, nr, nc);
    },
    setFontWeight: () => range(row, col, nr, nc),
  });
  const sheet = {
    getLastRow: () => {
      log.push('getLastRow');
      return data.length;
    },
    getMaxRows: () => max,
    insertRowsAfter: (after, n) => {
      log.push(`insertRowsAfter:${n}`);
      max += n;
    },
    getRange: range,
  };
  const current = () => (clock == null ? Date.now() : clock);
  class SimDate extends Date {
    constructor(...a) {
      if (a.length === 0) super(current());
      else super(...a);
    }
    static now() {
      return current();
    }
  }
  const ctx = {
    console,
    Date: SimDate,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === 'records' ? sheet : null) }),
      flush: () => log.push('flush'),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          log.push('lock');
          return true;
        },
        releaseLock: () => log.push('unlock'),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
        removeAll: (ks) => ks.forEach((k) => cache.delete(k)),
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null }) },
    Utilities: {
      getUuid: () => randomUUID(),
      computeHmacSha256Signature: (value, key) => [...createHmac('sha256', key).update(value, 'utf8').digest()],
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate: (d, tz, fmt) => {
        if (tz !== 'Asia/Tokyo') throw new Error(`時間帯が違う: ${tz}`);
        const iso = jstIso(d);
        if (fmt === 'yyyy') return iso.slice(0, 4);
        if (fmt === 'MMdd') return iso.slice(5, 7) + iso.slice(8, 10);
        return iso;
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ text: s, body: JSON.parse(s) }) }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(CODE_URL, 'utf8'), ctx, { filename: 'Code.gs' });
  const postRaw = (text) => ctx.doPost({ postData: { contents: text } });
  const post = (body) => postRaw(JSON.stringify(body)).body;
  return { ctx, post, postRaw, data, log, cache, props, setClock: (ms) => (clock = ms) };
}
