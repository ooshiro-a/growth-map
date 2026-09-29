// gas/Code.gs を、Google のサービスの作り物（メモリの中のシート）の上で動かす
// テストと、手元で画面を試す時の「作り物の GAS」（tools/mock-gas.js）で使う
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE_URL = new URL('../gas/Code.gs', import.meta.url);
const SHEET = 'records';
const HEADER = ['記録日時', '版', '記録番号', '年', '種類', '項目番号', '親番号', '操作', '層・区分', '文言', '状態・点数', '付記'];

function jstIso(d) {
  const t = new Date(d.getTime() + 9 * 3600e3);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}.${p(t.getUTCMilliseconds(), 3)}+09:00`;
}

// ドライブの作り物：フォルダとファイル（控えのスプレッドシート）
function makeDrive(ssName) {
  let seq = 0;
  const folders = new Map();
  const files = new Map();
  const iter = (list) => {
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  };
  const folder = (id) => {
    const f = folders.get(id);
    return {
      getId: () => id,
      getName: () => f.name,
      isTrashed: () => f.trashed,
      getFilesByName: (n) => iter([...files.values()].filter((x) => x.parent === id && x.name === n).map((x) => file(x.id))),
      getFoldersByName: (n) => iter([...folders.values()].filter((x) => x.parent === id && x.name === n).map((x) => folder(x.id))),
      createFolder: (n) => folder(addFolder(n, id)),
    };
  };
  const file = (id) => {
    const x = files.get(id);
    return {
      getId: () => id,
      getName: () => x.name,
      isTrashed: () => x.trashed,
      getParents: () => iter(x.parent ? [folder(x.parent)] : []),
      moveTo: (to) => {
        x.parent = to.getId();
        return file(id);
      },
    };
  };
  const addFolder = (name, parent) => {
    const id = `folder-${++seq}`;
    folders.set(id, { id, name, parent, trashed: false });
    return id;
  };
  const addFile = (name, parent, ss = null) => {
    const id = `file-${++seq}`;
    files.set(id, { id, name, parent, trashed: false, ss });
    return id;
  };
  const root = addFolder('マイドライブ', null);
  const home = addFolder('成長の地図', root);
  const mainId = addFile(ssName, home);
  const DriveApp = {
    getRootFolder: () => folder(root),
    getFolderById: (id) => {
      if (!folders.has(id)) throw new Error('フォルダがない');
      return folder(id);
    },
    getFileById: (id) => {
      if (!files.has(id)) throw new Error('ファイルがない');
      return file(id);
    },
  };
  return { DriveApp, folders, files, root, home, mainId, addFile };
}

export function makeGasSim({ pass = 'ひみつの合言葉', maxRows = 1000, nowMs = null, ssName = '成長の地図DB-テスト' } = {}) {
  const log = [];
  const data = [HEADER.slice()];
  let max = maxRows;
  let clock = nowMs;
  const cache = new Map();
  const props = new Map(pass ? [['PASSPHRASE', pass]] : []);
  // 実物のシートと同じ：= で始まれば数式になり、先頭の ' は「文字として入れる印」として外れる
  const store = (v) => {
    const s = String(v);
    if (s.startsWith('=')) return '#数式になった';
    if (s.startsWith("'")) return s.slice(1);
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
    // 控えへ写す（写した時の中身をそのまま持つ）
    copyTo: (dest) => {
      log.push('copyTo');
      return dest.addSheet(`${SHEET}のコピー`, data.map((r) => r.slice()));
    },
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
  const drive = makeDrive(ssName);
  const mails = [];
  const triggers = [];
  let sheetSeq = 0;
  // 控えのスプレッドシート（SpreadsheetApp.create で作る）
  const newSpreadsheet = (name) => {
    const sheets = [];
    const ss = {
      getId: () => id,
      getName: () => name,
      getSheets: () => sheets.map((x) => x.api),
      deleteSheet: (api) => {
        if (sheets.length === 1) throw new Error('最後のシートは消せない');
        sheets.splice(
          sheets.findIndex((x) => x.api === api),
          1,
        );
      },
      addSheet: (sheetName, rows) => {
        const x = { name: sheetName, rows, id: ++sheetSeq };
        x.api = { getSheetId: () => x.id, getName: () => x.name, setName: (n) => ((x.name = n), x.api), getLastRow: () => x.rows.length };
        sheets.push(x);
        return x.api;
      },
      sheets,
    };
    ss.addSheet('シート1', []);
    const id = drive.addFile(name, drive.root, ss);
    return ss;
  };
  const active = { getId: () => drive.mainId, getName: () => ssName, getSheetByName: (n) => (n === SHEET ? sheet : null) };
  const ctx = {
    console,
    Date: SimDate,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => active,
      create: (name) => {
        log.push('create');
        return newSpreadsheet(name);
      },
      flush: () => log.push('flush'),
    },
    DriveApp: drive.DriveApp,
    MailApp: { sendEmail: (o) => mails.push(o) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler, t })),
      deleteTrigger: (x) => triggers.splice(triggers.indexOf(x.t), 1),
      newTrigger: (handler) => {
        const t = { handler };
        const b = {
          timeBased: () => b,
          onMonthDay: (d) => ((t.monthDay = d), b),
          atHour: (h) => ((t.hour = h), b),
          create: () => (triggers.push(t), t),
        };
        return b;
      },
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
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => props.set(k, String(v)),
        getProperties: () => {
          log.push('getProperties');
          return Object.fromEntries(props);
        },
      }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      computeHmacSha256Signature: (value, key) => [...createHmac('sha256', key).update(value, 'utf8').digest()],
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate: (d, tz, fmt) => {
        if (tz !== 'Asia/Tokyo') throw new Error(`時間帯が違う: ${tz}`);
        const iso = jstIso(d);
        if (fmt === 'yyyy') return iso.slice(0, 4);
        if (fmt === 'MMdd') return iso.slice(5, 7) + iso.slice(8, 10);
        if (fmt === 'MM') return iso.slice(5, 7);
        if (fmt === 'yyyy-MM-dd') return iso.slice(0, 10);
        if (fmt === 'yyyy年M月d日') return `${iso.slice(0, 4)}年${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
        if (fmt !== "yyyy-MM-dd'T'HH:mm:ss.SSS'+09:00'") throw new Error(`知らない書き方: ${fmt}`);
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
  return { ctx, post, postRaw, data, log, cache, props, drive, mails, triggers, setClock: (ms) => (clock = ms) };
}
