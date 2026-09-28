// GAS との通信（読むのも書くのも POST。合言葉・端末の鍵は本文に入れ、URL には載せない）
// Content-Type を text/plain にして事前確認（preflight）を起こさない。GAS の 302 はそのまま追う
import { SCHEMA_VERSION } from './schema.js';

export class ApiError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code; // auth / locked / year / upgrade / busy / setup / bad / server / network / timeout
    this.detail = detail || null;
  }
}

// signal：呼んだ側から止める（画面に戻った時に、止まっていた送信を捨てて送り直す）
export async function callGas(url, body, { timeoutMs = 25000, fetchImpl, signal } = {}) {
  if (!url) throw new ApiError('nourl');
  const doFetch = fetchImpl || globalThis.fetch.bind(globalThis);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, clientVersion: SCHEMA_VERSION }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ApiError('network', { status: res.status });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new ApiError('server');
    }
    if (!data || data.ok !== true) throw new ApiError((data && data.error) || 'server', data);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e && e.name === 'AbortError') throw new ApiError('timeout');
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
}

// cred：{ key }（端末の鍵）か { pass }（合言葉）。合言葉で通ると、返事に key が入る
const credBody = (cred) => (cred && cred.key ? { key: cred.key } : { pass: (cred && cred.pass) || '' });

export const readAll = (url, cred, opts) => callGas(url, { action: 'readAll', ...credBody(cred) }, opts);

// known＝画面が知っている行数。返事にはそれより後の行が全部入る
export const append = (url, cred, rows, known, opts) =>
  callGas(url, { action: 'append', ...credBody(cred), rows, known }, opts);

export const ERROR_TEXT = {
  auth: '合言葉が違います',
  locked: '合言葉を続けて間違えたため、30分ほど止めています',
  year: '年が変わったため、読み込み直しました',
  upgrade: 'アプリを更新してください（画面を読み込み直してください）',
  busy: '混み合っています。少し待って送り直します',
  setup: 'シートまたは合言葉の準備ができていません（GAS の設定を確認してください）',
  bad: '送った内容が正しくありません',
  server: '保存先でエラーが起きました',
  network: '通信できませんでした',
  timeout: '通信に時間がかかっています',
  nourl: '接続先が設定されていません',
};
