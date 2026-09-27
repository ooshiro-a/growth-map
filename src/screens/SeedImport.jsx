import { useState } from 'react';
import { useApp } from '../app-context.js';
import { ConfirmDialog } from '../components/Modal.jsx';
import { ENV_LABEL } from '../config.js';
import { parseSeed, seedAlreadyImported, seedDrafts, seedSamples, seedSummary } from '../lib/seed.js';

// 設定＞初回の取り込み：初期データ（成長の地図・ホーム）の JSON を貼る／ファイルを選ぶ → 確かめる → 登録する
// 取り込みは1回だけ。「確かめる」を押した後にシートを読み直し、その最新の状態でだけ登録できる
// （古い控えや、前に開いたままの画面から二重に入れないように）
export function SeedImport() {
  const { store, model, write, readOnly, env, st, year } = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(null);
  const [mark, setMark] = useState(null); // 確かめた時の読み込みの番号

  const check = (t) => {
    setDone(null);
    const r = parseSeed(t, { currentYear: year });
    setResult(r);
    if (r.ok) {
      setMark(store.seq());
      store.reload();
    }
  };
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const t = await f.text();
    setText(t);
    check(t);
  };

  const seed = result && result.ok ? result.seed : null;
  const already = seedAlreadyImported(model.records);
  const fresh = mark != null && st.syncedSeq > mark && st.phase === 'ready' && !st.refreshing && st.cachedAt == null && !st.error;
  const drafts = seed ? seedDrafts(seed) : [];

  const register = () => {
    // 押した時にもう一度確かめる（確認の小窓を開いている間に読み込みが終わった時など）
    const now = store.getState();
    if (!fresh || now.syncedSeq <= mark || now.refreshing || now.error || seedAlreadyImported(model.records)) return false;
    const rows = write(seedDrafts(seed));
    if (!rows) return false;
    setDone(rows.length);
    setText('');
    setResult(null);
    return true;
  };

  if (already && done == null) {
    return (
      <div className="seed-import">
        <b className="sub-h">初期データ（成長の地図・ホーム）</b>
        <p className="note">初期データは取り込み済みです（取り込みは1回だけ）。直す時は各画面の「…」から</p>
      </div>
    );
  }

  return (
    <div className="seed-import">
      <b className="sub-h">初期データ（成長の地図・ホーム）</b>
      <p className="note">
        形式「growth-map-seed/1」の JSON を貼るか、ファイルを選んでください。追加日は取り込んだ日になります。取り込みは1回だけです
      </p>
      <div className="btns">
        <label className="btn">
          ファイルを選ぶ
          <input type="file" accept=".json,application/json" hidden onChange={onFile} />
        </label>
      </div>
      <textarea
        className="field mono"
        rows={5}
        value={text}
        placeholder='{"format": "growth-map-seed/1", "year": 2026, ...}'
        aria-label="初期データの JSON"
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
      />
      <div className="btns">
        <button type="button" className="btn" disabled={!text.trim()} onClick={() => check(text)}>
          確かめる
        </button>
      </div>

      {result && !result.ok && (
        <ul className="err">
          {result.errors.slice(0, 20).map((m, i) => (
            <li key={i}>{m}</li>
          ))}
          {result.errors.length > 20 && <li>ほか{result.errors.length - 20}件</li>}
        </ul>
      )}

      {seed && (
        <div className="card">
          <table className="summary">
            <tbody>
              {seedSummary(seed).map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">中身の例（文字化けしていないか確かめてください）</p>
          <table className="summary">
            <tbody>
              {seedSamples(seed).map(([k, list]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{list.join('／')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!fresh && <p className="err">シートを読み直しています。読み終えたら登録できます（通信できない時は、つながってから「確かめる」をもう一度）</p>}
          <button type="button" className="btn primary" disabled={readOnly || !fresh} onClick={() => setConfirm(true)}>
            登録する（{drafts.length}行・{ENV_LABEL[env]}）
          </button>
        </div>
      )}

      {done != null && <p className="ok">{done}行を足しました。右上の「未保存」が消えれば保存できています</p>}

      {confirm && (
        <ConfirmDialog
          title="初期データを登録する"
          message={`${ENV_LABEL[env]}のシートに${drafts.length}行を足します。取り込みは1回だけです（後から直す時は、各画面の「…」から）。`}
          okLabel="登録する"
          onOk={register}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
