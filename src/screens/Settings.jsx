import { useMemo, useState } from 'react';
import { useApp } from '../app-context.js';
import { ConfirmDialog } from '../components/Modal.jsx';
import { ItemList } from '../components/ItemList.jsx';
import { APP_VERSION, ENV_LABEL, GAS_URLS } from '../config.js';
import { ERROR_TEXT } from '../lib/api.js';
import { clockOffset, now } from '../lib/clock.js';
import { formatJpDate, jstParts } from '../lib/dates.js';
import { newId } from '../lib/ids.js';
import { KIND, LAYER, OP, SCHEMA_VERSION } from '../lib/schema.js';
import { SeedImport } from './SeedImport.jsx';

// 往復テストで送る文字（シートで数式・日付・数に化けないか）
const TRICKY = ['=1+1', '+5', '-3', '@x', "'x", "'=x", '1/2', '12月6日', '001', 'TRUE', '1e3', '2026-12-06', '{"a":1}', '改行\nあり', '  前後の空白  '];

function RoundTrip() {
  const { st, write } = useApp();
  const [sent, setSent] = useState(null);
  const result = useMemo(() => {
    if (!sent) return null;
    const pend = new Set(st.pending.map((p) => p.row[2]));
    if (sent.some((s) => pend.has(s.no))) return { done: false };
    const byNo = new Map(st.rows.map((r) => [r[2], r]));
    const bad = sent.filter((s) => !byNo.has(s.no) || byNo.get(s.no)[9] !== s.text).map((s) => ({ sent: s.text, got: byNo.get(s.no)?.[9] }));
    return { done: true, bad };
  }, [sent, st.rows, st.pending]);
  const run = () => {
    const rows = write(TRICKY.map((t) => ({ kind: KIND.SYSTEM, id: newId(), op: OP.ADD, layer: LAYER.ROUNDTRIP, text: t })));
    if (rows) setSent(rows.map((r) => ({ no: r[2], text: r[9] })));
  };
  return (
    <div className="card">
      <b>書き込みの往復テスト</b>
      <p className="note">数式・日付・数に化けやすい文字を{TRICKY.length}行送り、読み戻して同じか確かめます</p>
      <button type="button" className="btn" onClick={run}>
        送って確かめる
      </button>
      {result && !result.done && <p className="note">送っています…</p>}
      {result?.done && result.bad.length === 0 && <p className="ok">すべて同じでした（{TRICKY.length}行）</p>}
      {result?.done && result.bad.length > 0 && (
        <ul className="err">
          {result.bad.map((b, i) => (
            <li key={i}>
              送った「{b.sent}」→ 戻った「{b.got ?? '（見つからない）'}」
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClockControl() {
  const { setClock, year } = useApp();
  const [, redraw] = useState(0); // 同じ年の中で変えた時も表示を直す
  const p = jstParts(now());
  const [val, setVal] = useState(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`);
  const change = (ms) => {
    setClock(ms);
    redraw((n) => n + 1);
  };
  const apply = () => {
    const [y, m, d] = val.split('-').map(Number);
    if (!y || !m || !d) return;
    const target = Date.UTC(y, m - 1, d, 1, 0, 0); // その日の 10:00（日本時間）
    change(target - Date.now());
  };
  return (
    <div className="card">
      <b>日付を仮に変える（テスト用シートだけ）</b>
      <p className="note">
        今の日付：{formatJpDate(now())}（{year}年）{clockOffset() ? '・仮の日付' : ''}
      </p>
      <div className="pass-row">
        <input type="date" className="field" value={val} onChange={(e) => setVal(e.target.value)} />
        <button type="button" className="btn" onClick={apply}>
          変える
        </button>
        <button type="button" className="btn" disabled={!clockOffset()} onClick={() => change(0)}>
          元に戻す
        </button>
      </div>
    </div>
  );
}

const FAIL_REASON = { bad: '形が正しくない', year: '前の年の地図（見るだけ）' };

// 送れなかった記録（シートには入っていない）。中身を見て、手で入れ直してから消す
function FailedList() {
  const { st, store } = useApp();
  if (!st.failed.length) return null;
  return (
    <section className="list">
      <div className="sec">
        <span>送れなかった記録（{st.failed.length}件）</span>
      </div>
      <p className="note">シートには入っていません。必要なら入れ直してから消してください</p>
      {st.failed.map((f) => (
        <div className="item" key={f.row[2]}>
          <div className="row">
            <span className="tx">
              {[f.row[3] && `${f.row[3]}年`, f.row[4], f.row[7], f.row[9] && `「${f.row[9]}」`, f.row[10]].filter(Boolean).join('・')}
            </span>
            <button type="button" className="btn small" onClick={() => store.discardFailed(f.row[2])}>
              消す
            </button>
          </div>
          <div className="note">
            {formatJpDate(f.row[0])}に書いた・{FAIL_REASON[f.reason] || f.reason}
          </div>
        </div>
      ))}
    </section>
  );
}

export function Settings() {
  const { st, store, env, setEnv, model } = useApp();
  const [confirm, setConfirm] = useState(null);
  return (
    <div className="settings">
      <section className="list">
        <div className="sec">
          <span>接続先</span>
        </div>
        <div className="seg" role="radiogroup" aria-label="接続先">
          {['prod', 'test'].map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={env === k}
              className={env === k ? 'on' : ''}
              disabled={!GAS_URLS[k]}
              onClick={() => setEnv(k)}
            >
              {ENV_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="note">
          記録 {st.rows.length}行
          {st.pending.length ? `／未保存 ${st.pending.length}件` : ''}
          {st.error ? `／${ERROR_TEXT[st.error] || st.error}` : ''}
        </p>
        <div className="btns">
          <button type="button" className="btn" onClick={() => store.reload()}>
            読み込み直す
          </button>
          {st.pending.length > 0 && (
            <button type="button" className="btn" onClick={() => store.flush()}>
              今すぐ送る
            </button>
          )}
        </div>
      </section>

      <FailedList />

      <section className="list">
        <div className="sec">
          <span>合言葉</span>
        </div>
        <p className="note">この端末に記憶しています（{ENV_LABEL[env]}）</p>
        <button type="button" className="btn" onClick={() => setConfirm('forget')}>
          この端末の合言葉を消す
        </button>
      </section>

      <section className="list">
        <div className="sec">
          <span>初回の取り込み</span>
        </div>
        <SeedImport />
        <p className="note">旧マインドマップの取り込みはフェーズ7で作ります</p>
      </section>

      {env === 'test' && (
        <section className="list">
          <div className="sec">
            <span>動作確認（テスト用シートだけ）</span>
          </div>
          <ClockControl />
          <RoundTrip />
          <div className="card">
            <ItemList kind={KIND.SYSTEM} layer={LAYER.TRIAL} title="試しの一覧" emptyText="「…」→「追加する」で足せます" />
          </div>
        </section>
      )}

      <p className="note ver">
        版 {APP_VERSION}／記録の版 {SCHEMA_VERSION}
        {model.unsupported && '（新しい版の記録があります。アプリを更新してください）'}
      </p>

      {confirm === 'forget' && (
        <ConfirmDialog
          title="合言葉を消す"
          message="この端末の記憶（合言葉で受け取った鍵）を消します。次に開いた時に合言葉を入れ直します。"
          okLabel="消す"
          warn
          onOk={() => store.forgetPass()}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
