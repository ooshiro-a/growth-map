import { useState } from 'react';
import { useApp } from '../app-context.js';
import { ConfirmDialog } from '../components/Modal.jsx';
import { ENV_LABEL } from '../config.js';
import { parseSeed, seedAlreadyImported, seedDrafts, seedSummary } from '../lib/seed.js';

// 設定＞初回の取り込み：初期データ（成長の地図・ホーム）の JSON を貼る／ファイルを選ぶ → 確かめる → 登録する
export function SeedImport() {
  const { model, write, readOnly, env } = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(null);

  const check = (t) => {
    setDone(null);
    setResult(parseSeed(t));
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
  const already = seed ? seedAlreadyImported(model.records, seed.year) : false;
  const drafts = seed ? seedDrafts(seed) : [];

  const register = () => {
    const rows = write(seedDrafts(seed));
    if (!rows) return false;
    setDone(rows.length);
    setText('');
    setResult(null);
    return true;
  };

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
          {already ? (
            <p className="err">{seed.year}年の初期データは、もう取り込んであります（二重には入れません）</p>
          ) : (
            <button type="button" className="btn primary" disabled={readOnly} onClick={() => setConfirm(true)}>
              登録する（{drafts.length}行・{ENV_LABEL[env]}）
            </button>
          )}
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
