/**
 * 成長の地図 GAS（スプレッドシートに付いたスクリプト）
 *
 * 画面（doPost）からすることは2つだけ：「行を足す」「全部読む」。行の書き換え・削除はしない。
 * 時間指定からすること（setupSchedule で作る）：毎月の控えの複製・12月のお知らせのメール
 *
 * 許可：このスプレッドシート／新しいスプレッドシートを作る（控え）／ドライブ（控えフォルダ）／
 *       自分宛てのメール／時間指定。ほかのファイルは読まない・変えない
 *
 * スクリプトのプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   PASSPHRASE          合言葉（必須。コードには書かない。変えると、端末の鍵もすべて使えなくなる）
 *   MIN_CLIENT_VERSION  これより古い画面からの読み書きを断る（任意）
 *   NOTIFY_EMAIL        12月のお知らせの宛先（任意。なければ自分＝このスクリプトを動かすアカウント）
 *   BACKUP_FOLDER_ID    控えフォルダ（最初の控えの時に自動で入る。シートと同じフォルダの「〇〇の控え」）
 *   LAST_BACKUP         最後の控え（自動で入る。画面の設定に出す）
 *   NOTICE_SENT         お知らせを送った年（自動で入る。同じ年に2回送らない）
 *
 * デプロイ：ウェブアプリ／次のユーザーとして実行＝自分／アクセスできるユーザー＝全員
 * 更新する時は「デプロイを管理」→ 同じデプロイを編集 →「新しいバージョン」（URL を変えない）
 */

var SHEET_NAME = 'records';
var HEADER = ['記録日時', '版', '記録番号', '年', '種類', '項目番号', '親番号', '操作', '層・区分', '文言', '状態・点数', '付記'];
var NCOL = 12;
var PER_YEAR_KINDS = ['アイスバーグ', 'ブレーキ', '自分軸', '動機'];
var MAX_BATCH = 500;
// 送り直しの重なりを確かめる最近の行数（返事が届かずに送り直した行は、この中に入る。
// 万一重なっても、画面は記録番号で1行にまとめる）
var DEDUP_WINDOW = 300;
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
  var t0 = Date.now();
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad' });
  }
  // スクリプトのプロパティは1回で読む
  var props = PropertiesService.getScriptProperties().getProperties();
  var auth = checkAuth_(req || {}, props.PASSPHRASE);
  if (auth.denied) return json_({ ok: false, error: auth.denied });

  var minVer = Number(props.MIN_CLIENT_VERSION || 0);
  if (Number(req.clientVersion || 0) < minVer) return json_({ ok: false, error: 'upgrade' });

  try {
    var out;
    if (req.action === 'readAll') {
      out = readAll_();
      out.backup = backupInfo_(props.LAST_BACKUP);
    }
    else if (req.action === 'append') out = append_(req.rows, req.known);
    else return json_({ ok: false, error: 'bad' });
    // 合言葉で通った端末には鍵を渡す（次からは鍵で通る）
    if (auth.newKey) out.key = auth.newKey;
    out.serverMs = Date.now() - t0; // 保存先の中でかかった時間（画面の設定に出す）
    return json_(out);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: (err && err.code) || 'server' });
  }
}

// ------------------------------------------------------------ 合言葉・端末の鍵
// 合言葉を1回入れた端末には「鍵」を渡し、次からは鍵で通す。
// 鍵で通る端末は、他の人が合言葉をわざと間違えて止めている間も使える（止めるのは合言葉の照合だけ）。
// 鍵＝端末ごとの番号＋合言葉で作った署名。合言葉を変えると、すべての鍵が使えなくなる

function checkAuth_(req, pass) {
  if (!pass) return { denied: 'setup' };
  if (typeof req.key === 'string' && keyOk_(req.key, pass)) return {};
  var denied = checkPass_(req.pass, pass);
  if (denied) return { denied: denied };
  return { newKey: makeKey_(Utilities.getUuid(), pass) };
}

function makeKey_(id, pass) {
  return id + '.' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('growth-map-key:' + id, pass));
}

function keyOk_(key, pass) {
  var dot = key.lastIndexOf('.');
  if (dot < 1 || key.length > 200) return false;
  return sameText_(key, makeKey_(key.slice(0, dot), pass));
}

function checkPass_(given, pass) {
  var cache = CacheService.getScriptCache();
  if (cache.get('gm_locked')) return 'locked';
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
  // 書く時に付けた先頭の ' は、シートが外して保存する（ここでは外さない）
  return v === null || v === undefined ? '' : String(v);
}

// ------------------------------------------------------------ 行を足す

function append_(rows, known) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH) throw code_('bad');
  var now = new Date();
  var serverYear = jstYear_(now);

  // 先に形を確かめる（1行でもおかしければ全部断り、何行目かを返す）
  var clean = [];
  for (var i = 0; i < rows.length; i++) {
    var row = normalizeRow_(rows[i]);
    if (!row) return { ok: false, error: 'bad', row: i };
    clean.push(row);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
  try {
    // 鍵をかけてから、最後の行と、最近の行を1回で読む（重なりの確かめ・最後の記録日時・返事に使う）
    // シートとのやりとりは1回ごとに時間がかかるので、読むのはここと getLastRow だけにする
    var sheet = sheet_();
    var last = sheet.getLastRow();
    var dataCount = Math.max(0, last - 1);
    var from = Number(known);
    if (!(from >= 0 && from <= dataCount) || Math.floor(from) !== from) from = 0;
    var start = Math.max(0, Math.min(from, dataCount - DEDUP_WINDOW));
    var recent = rowsBetween_(sheet, start, dataCount);
    var existing = {};
    recent.forEach(function (r) {
      existing[r[2]] = true;
    });
    var lastMs = recent.length ? Date.parse(recent[recent.length - 1][0]) || 0 : 0;

    // もう入っている行（返事が届かずに送り直した行）は足さない。前の年の行を断るのは、新しい行だけ
    var out = [];
    var skipped = 0;
    var past = [];
    clean.forEach(function (row, i) {
      if (existing[row[2]]) {
        skipped++;
        return;
      }
      if (isPastYearRow_(row, serverYear, now)) past.push(i);
      existing[row[2]] = true;
      out.push(row);
    });
    if (past.length) return { ok: false, error: 'year', serverYear: serverYear, rowsIndex: past };

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

    // 返事：known より後の行（読んだ最近の行＋いま足した行）。書いた後に読み直さない
    var total = dataCount + out.length;
    var tail = recent.slice(from - start).concat(
      out.map(function (r) {
        return r.slice();
      }),
    );
    return { ok: true, appended: out.length, skipped: skipped, from: from, rows: tail, count: total, serverYear: serverYear };
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

// 数式などに化けないように先頭に ' を付ける（シートは ' を外して、残りを文字のまま保存する）
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

// ------------------------------------------------------------ 控えの複製・12月のお知らせ
// 時間指定から動く（画面の doPost からは呼ばない）。エディタから手で実行してもよい
//   setupSchedule  時間指定を作り直し、控えを1つ作る（最初に1回。本番で行う）
//   stopSchedule   時間指定を消す
//   backupNow      控えを今作る（毎月1日の時間指定もこれを動かす）
//   testNotice     お知らせのメールを今送る（件名に「試し」）

var APP_URL = 'https://ooshiro-a.github.io/growth-map/';
var BACKUP_DAY = 1; // 毎月1日の
var BACKUP_HOUR = 3; // 3時台
var NOTICE_MONTH = 12;
var NOTICE_DAY = 25; // 12月25日の
var NOTICE_HOUR = 9; // 9時台
var SCHEDULED = ['backupNow', 'decemberNotice'];

function setupSchedule() {
  stopSchedule();
  ScriptApp.newTrigger('backupNow').timeBased().onMonthDay(BACKUP_DAY).atHour(BACKUP_HOUR).create();
  // 時間指定は「毎年」を作れないので、毎月25日に動かし、12月の時だけ送る
  ScriptApp.newTrigger('decemberNotice').timeBased().onMonthDay(NOTICE_DAY).atHour(NOTICE_HOUR).create();
  var made = backupNow();
  return '時間指定を作りました（控え：毎月' + BACKUP_DAY + '日' + BACKUP_HOUR + '時台／お知らせ：毎年' + NOTICE_MONTH + '月' + NOTICE_DAY + '日' + NOTICE_HOUR + '時台）。' + made;
}

function stopSchedule() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (SCHEDULED.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return '時間指定を' + n + '個消しました';
}

// シート records を新しいスプレッドシートに写し、控えフォルダに置く（古い控えは消さない）
function backupNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = sheet_();
  var props = PropertiesService.getScriptProperties();
  var folder = backupFolder_(ss, props);
  var now = new Date();
  var name = ss.getName() + '_控え_' + Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  var same = folder.getFilesByName(name);
  while (same.hasNext()) {
    if (!same.next().isTrashed()) return '今日の控えはもうあります：' + name;
  }

  var copy = SpreadsheetApp.create(name);
  var file = DriveApp.getFileById(copy.getId());
  file.moveTo(folder);
  // 写している間に行が足されないように、行を足す時と同じ鍵をかける
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw code_('busy');
  var rows;
  try {
    rows = Math.max(0, sheet.getLastRow() - 1);
    var copied = sheet.copyTo(copy);
    copied.setName(SHEET_NAME);
  } finally {
    lock.releaseLock();
  }
  // 最初からある空のシートを外す（控えの中だけ。元のシートには触れない）
  copy.getSheets().forEach(function (s) {
    if (s.getSheetId() !== copied.getSheetId()) copy.deleteSheet(s);
  });
  var got = Math.max(0, copied.getLastRow() - 1);
  if (got !== rows) throw new Error('控えの行数が合いません（元 ' + rows + '行・控え ' + got + '行）：' + name);

  props.setProperty('LAST_BACKUP', JSON.stringify({ at: Utilities.formatDate(now, TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS'+09:00'"), rows: rows, name: name }));
  return '控えを作りました：' + name + '（' + rows + '行）';
}

// 控えフォルダ：BACKUP_FOLDER_ID。なければシートと同じフォルダに「〇〇の控え」を作る
function backupFolder_(ss, props) {
  var id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try {
      var saved = DriveApp.getFolderById(id);
      if (!saved.isTrashed()) return saved;
    } catch (err) {
      console.warn('BACKUP_FOLDER_ID のフォルダが開けないので、作り直します');
    }
  }
  var parents = DriveApp.getFileById(ss.getId()).getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var folderName = ss.getName() + 'の控え';
  var folder = null;
  var found = parent.getFoldersByName(folderName);
  while (!folder && found.hasNext()) {
    var f = found.next();
    if (!f.isTrashed()) folder = f;
  }
  if (!folder) folder = parent.createFolder(folderName);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

// 画面に返す最後の控え（日時と行数だけ）
function backupInfo_(text) {
  if (!text) return null;
  try {
    var b = JSON.parse(text);
    return b && typeof b.at === 'string' ? { at: b.at, rows: Number(b.rows) || 0 } : null;
  } catch (err) {
    return null;
  }
}

// 毎月25日に動く。12月の時だけ送る（同じ年に2回送らない）
function decemberNotice() {
  var now = new Date();
  if (Number(Utilities.formatDate(now, TZ, 'MM')) !== NOTICE_MONTH) return NOTICE_MONTH + '月ではないので送りません';
  var props = PropertiesService.getScriptProperties();
  var year = String(jstYear_(now));
  if (props.getProperty('NOTICE_SENT') === year) return year + '年のお知らせは送ってあります';
  sendNotice_(props, '');
  props.setProperty('NOTICE_SENT', year);
  return year + '年のお知らせを送りました';
}

function testNotice() {
  sendNotice_(PropertiesService.getScriptProperties(), '（試し）');
  return '試しのお知らせを送りました';
}

function sendNotice_(props, mark) {
  var to = props.getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  if (!to) throw new Error('宛先がありません（スクリプトのプロパティ NOTIFY_EMAIL に入れてください）');
  MailApp.sendEmail({
    to: to,
    subject: mark + '成長の地図：振り返りの時期です',
    body: noticeBody_(backupInfo_(props.getProperty('LAST_BACKUP'))),
    name: '成長の地図',
  });
}

// お知らせの本文（記録の中身は入れない）
function noticeBody_(backup) {
  var lines = [
    '今年もあと少しです。',
    '年末年始に、成長の地図で1年を振り返りましょう。',
    '',
    '① 今年の目標の答え合わせ',
    '② 今年の振り返り',
    '③ 来年の目標',
    '④ 来年の抱負',
    '',
    '振り返りを開く：' + APP_URL + '#/review',
  ];
  if (backup) {
    lines.push('', '最後の控え：' + Utilities.formatDate(new Date(Date.parse(backup.at)), TZ, 'yyyy年M月d日') + '（' + backup.rows + '行）');
  }
  return lines.join('\n');
}

// ------------------------------------------------------------ 小物

function sheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw code_('setup');
  return sheet;
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
