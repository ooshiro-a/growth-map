/**
 * 成長の地図 GAS（スプレッドシートに付いたスクリプト）
 *
 * @OnlyCurrentDoc
 * （許可はこのスプレッドシートだけ。ほかのシートには触れない）
 *
 * することは2つだけ：「行を足す」「全部読む」。行の書き換え・削除はしない。
 *
 * スクリプトのプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   PASSPHRASE          合言葉（必須。コードには書かない）
 *   MIN_CLIENT_VERSION  これより古い画面からの読み書きを断る（任意）
 *   BACKUP_FOLDER_ID    控えフォルダ（フェーズ9）
 *   NOTIFY_EMAIL        12月のお知らせの宛先（フェーズ9）
 *
 * デプロイ：ウェブアプリ／次のユーザーとして実行＝自分／アクセスできるユーザー＝全員
 * 更新する時は「デプロイを管理」→ 同じデプロイを編集 →「新しいバージョン」（URL を変えない）
 */

var SHEET_NAME = 'records';
var HEADER = ['記録日時', '版', '記録番号', '年', '種類', '項目番号', '親番号', '操作', '層・区分', '文言', '状態・点数', '付記'];
var NCOL = 12;
var PER_YEAR_KINDS = ['アイスバーグ', 'ブレーキ', '自分軸', '動機'];
var MAX_BATCH = 500;
var MAX_CELL = 20000;
var MAX_FAILS = 10;
var LOCK_SECONDS = 1800;
var TZ = 'Asia/Tokyo';

// ------------------------------------------------------------ 入口

function doGet() {
  // データは返さない（読み書きは POST だけ）
  return json_({ ok: true, app: 'growth-map' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad' });
  }
  var denied = checkPass_(req && req.pass);
  if (denied) return json_({ ok: false, error: denied });

  var minVer = Number(prop_('MIN_CLIENT_VERSION') || 0);
  if (Number(req.clientVersion || 0) < minVer) return json_({ ok: false, error: 'upgrade' });

  try {
    if (req.action === 'readAll') return json_(readAll_());
    if (req.action === 'append') return json_(append_(req.rows, req.known));
    return json_({ ok: false, error: 'bad' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: (err && err.code) || 'server' });
  }
}

// ------------------------------------------------------------ 合言葉

function checkPass_(given) {
  var cache = CacheService.getScriptCache();
  if (cache.get('gm_locked')) return 'locked';
  var pass = prop_('PASSPHRASE');
  if (!pass) return 'setup';
  if (typeof given === 'string' && sameText_(given, pass)) {
    if (cache.get('gm_fails')) cache.remove('gm_fails');
    return null;
  }
  // 数え間違えないように、数える所だけ鍵をかける（取れなければ失敗として扱う）
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 'auth';
  try {
    var fails = Number(cache.get('gm_fails') || 0) + 1;
    if (fails >= MAX_FAILS) {
      cache.put('gm_locked', '1', LOCK_SECONDS);
      cache.remove('gm_fails');
    } else {
      cache.put('gm_fails', String(fails), LOCK_SECONDS);
    }
  } finally {
    lock.releaseLock();
  }
  return 'auth';
}

// 止まった時に、エディタから手で実行して解く
function unlock() {
  CacheService.getScriptCache().removeAll(['gm_locked', 'gm_fails']);
  return '解除しました';
}

// 文字の比較（途中で止めない）
function sameText_(a, b) {
  var n = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// ------------------------------------------------------------ 全部読む

function readAll_() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  return { ok: true, rows: rowsBetween_(sheet, 0, last - 1), count: Math.max(0, last - 1), serverYear: jstYear_(new Date()) };
}

// データ行の from 番目（0始まり）から to 番目の手前まで
function rowsBetween_(sheet, from, to) {
  if (to <= from) return [];
  return sheet
    .getRange(from + 2, 1, to - from, NCOL)
    .getValues()
    .map(function (r) {
      return r.map(cellText_);
    });
}

function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS'+09:00'");
  var s = v === null || v === undefined ? '' : String(v);
  // 書く時に付けた先頭の ' を外す（シートが外していなければ）
  if (s.length > 1 && s.charAt(0) === "'" && /^[=+\-@']/.test(s.charAt(1))) s = s.slice(1);
  return s;
}

// ------------------------------------------------------------ 行を足す

function append_(rows, known) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) throw code_('bad');
  var now = new Date();
  var serverYear = jstYear_(now);

  // 先に形を確かめる（1行でもおかしければ全部断り、何行目かを返す）
  var clean = [];
  var past = [];
  for (var i = 0; i < rows.length; i++) {
    var row = normalizeRow_(rows[i]);
    if (!row) return { ok: false, error: 'bad', row: i };
    if (isPastYearRow_(row, serverYear, now)) past.push(i);
    clean.push(row);
  }
  if (past.length) return { ok: false, error: 'year', serverYear: serverYear, rowsIndex: past };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
  try {
    // 鍵をかけてから、最後の行と記録番号を読む
    var sheet = sheet_();
    var last = sheet.getLastRow();
    var dataCount = Math.max(0, last - 1);
    var existing = {};
    var lastMs = 0;
    if (dataCount > 0) {
      sheet
        .getRange(2, 3, dataCount, 1)
        .getValues()
        .forEach(function (r) {
          existing[String(r[0])] = true;
        });
      lastMs = Date.parse(cellText_(sheet.getRange(last, 1).getValue())) || 0;
    }

    var out = [];
    var skipped = 0;
    clean.forEach(function (row) {
      if (existing[row[2]]) {
        skipped++;
        return;
      }
      existing[row[2]] = true;
      out.push(row);
    });

    if (out.length) {
      // 記録日時は鍵の中で付ける（前の行より必ず後）
      var t = Math.max(Date.now(), lastMs + 1);
      out.forEach(function (row) {
        row[0] = Utilities.formatDate(new Date(t), TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS'+09:00'");
        t++;
      });
      var need = last + out.length;
      var max = sheet.getMaxRows();
      if (need > max) sheet.insertRowsAfter(max, need - max + 200);
      var range = sheet.getRange(last + 1, 1, out.length, NCOL);
      range.setNumberFormat('@');
      range.setValues(
        out.map(function (r) {
          return r.map(escapeCell_);
        }),
      );
      SpreadsheetApp.flush();
    }

    var total = dataCount + out.length;
    var from = Number(known);
    if (!(from >= 0 && from <= dataCount) || Math.floor(from) !== from) from = 0;
    return { ok: true, appended: out.length, skipped: skipped, from: from, rows: rowsBetween_(sheet, from, total), count: total, serverYear: serverYear };
  } finally {
    lock.releaseLock();
  }
}

// 12列の文字列にそろえる。記録番号がない・長すぎるなどは null
function normalizeRow_(r) {
  if (!Array.isArray(r) || r.length > NCOL) return null;
  var row = [];
  for (var i = 0; i < NCOL; i++) {
    var v = r[i];
    var s = v === null || v === undefined ? '' : String(v);
    if (s.length > MAX_CELL) return null;
    row.push(s);
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{5,80}$/.test(row[2])) return null;
  if (!/^\d+$/.test(row[1])) return null;
  return row;
}

// 年ごとの種類で、今年より前の年の行（前の年は見るだけ）
// 除くもの：初期データの取り込み／年末に書いて年明けに届いた行（1月7日まで・書いた時刻がその年）
function isPastYearRow_(row, serverYear, now) {
  if (PER_YEAR_KINDS.indexOf(row[4]) < 0) return false;
  if (!/^\d{4}$/.test(row[3]) || Number(row[3]) >= serverYear) return false;
  try {
    var extra = JSON.parse(row[11] || '{}');
    if (extra && extra.source === 'seed') return false;
  } catch (err) {
    /* 付記が読めなければ通常の行として扱う */
  }
  var year = Number(row[3]);
  var writtenMs = Date.parse(row[0]);
  if (year === serverYear - 1 && inGrace_(now) && writtenMs && jstYear_(new Date(writtenMs)) === year) return false;
  return true;
}

// 年明けの猶予（日本時間の1月7日まで）
function inGrace_(now) {
  var md = Utilities.formatDate(now, TZ, 'MMdd');
  return md >= '0101' && md <= '0107';
}

// 数式などに化けないように先頭に ' を付ける（読む時に外す）
function escapeCell_(s) {
  return /^[=+\-@']/.test(s) ? "'" + s : s;
}

// ------------------------------------------------------------ 準備（エディタから1回だけ実行）

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, NCOL).setValues([HEADER]).setFontWeight('bold');
  }
  sheet.getRange(1, 1, sheet.getMaxRows(), NCOL).setNumberFormat('@');
  sheet.setFrozenRows(1);
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if (!protections.length) sheet.protect().setDescription('記録は足すだけ（手で直さない）').setWarningOnly(true);
  return '準備ができました：' + SHEET_NAME;
}

// ------------------------------------------------------------ 小物

function sheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw code_('setup');
  return sheet;
}

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function jstYear_(d) {
  return Number(Utilities.formatDate(d, TZ, 'yyyy'));
}

function code_(c) {
  var err = new Error(c);
  err.code = c;
  return err;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
