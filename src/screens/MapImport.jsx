import { useState } from 'react';
import { useApp } from '../app-context.js';
import { ConfirmDialog } from '../components/Modal.jsx';
import { ENV_LABEL } from '../config.js';
import { now } from '../lib/clock.js';
import { mapAlreadyStarted, mapImportDrafts, mapSamples, parseMapImport, treeStats } from '../lib/lifemap.js';

// 設定＞旧マインドマップの取り込み：「番号つきで書き出す」の JSON（または「文章として書き出す」の形）を貼る／ファイルを選ぶ
// → 確かめる → 登録する。取り込みは1回だけ。「確かめる」の後にシートを読み直し、その最新の状態でだけ登録できる
export function MapImport() {
  const { store, model, write, readOnly, env, st } = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(null);
  const [mark, setMark] = useState(null);

  const check = (t) => {
    setDone(null);
    const r = parseMapImport(t);
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

  const parsed = result && result.ok ? result : null;
  const already = mapAlreadyStarted(model.records);
  const fresh = mark != null && st.syncedSeq > mark && st.phase === 'ready' && !st.refreshing && st.cachedAt == null && !st.error;
  const stats = parsed ? treeStats(parsed.tree) : null;

  const register = () => {
    const cur = store.getState();
    if (!fresh || cur.syncedSeq <= mark || cur.refreshing || cur.error || mapAlreadyStarted(model.records)) return false;
    const rows = write(mapImportDrafts(parsed, { nowMs: now() }));
    if (!rows) return false;
    setDone(rows.length);
    setText('');
    setResult(null);
    return true;
  };

  if (already && done == null) {
    return (
      <div className="seed-import map-import">
        <b className="sub-h">旧マインドマップ（人生マップ）</b>
        <p className="note">人生マップにはもう記録があります（取り込みは1回だけ）。直す時は人生マップの「…」から</p>
      </div>
    );
  }

  return (
    <div className="seed-import map-import">
      <b className="sub-h">旧マインドマップ（人生マップ）</b>
      <p className="note">
        旧アプリの「番号つきで書き出す」の中身を貼るか、ファイルを選んでください。番号と追加日を引き継ぎます。
        使えない時は「文章として書き出す」の中身も貼れます（追加日は取り込んだ日）。取り込みは1回だけです
      </p>
      <div className="btns">
        <label className="btn">
          ファイルを選ぶ
          <input type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={onFile} />
        </label>
      </div>
      <textarea
        className="field mono"
        rows={5}
        value={text}
        placeholder='{"id": "root", "text": "…", "children": [ … ]}'
        aria-label="旧マインドマップの書き出し"
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

      {parsed && (
        <div className="card">
          <table className="summary">
            <tbody>
              <tr>
                <th>形</th>
                <td>{parsed.kind === 'numbered' ? '番号つき（番号と追加日を引き継ぐ）' : '文章（追加日は取り込んだ日）'}</td>
              </tr>
              <tr>
                <th>項目</th>
                <td>
                  {stats.count}個（rootを含む）・深さ{stats.depth}
                </td>
              </tr>
              <tr>
                <th>最初の枝</th>
                <td>{parsed.tree.children.length}本</td>
              </tr>
            </tbody>
          </table>
          <p className="note">中身の例（文字化けしていないか、旧アプリの項目の数と同じか確かめてください）</p>
          <p className="sample">{mapSamples(parsed.tree).join('／')}</p>
          {!fresh && <p className="err">シートを読み直しています。読み終えたら登録できます（通信できない時は、つながってから「確かめる」をもう一度）</p>}
          <button type="button" className="btn primary" disabled={readOnly || !fresh} onClick={() => setConfirm(true)}>
            登録する（{stats.count}行・{ENV_LABEL[env]}）
          </button>
        </div>
      )}

      {done != null && <p className="ok">{done}行を足しました。右上の「未保存」が消えれば保存できています</p>}

      {confirm && stats && (
        <ConfirmDialog
          title="旧マインドマップを登録する"
          message={`${ENV_LABEL[env]}のシートに${stats.count}行を足します。取り込みは1回だけです（後から直す時は、人生マップの「…」から）。`}
          okLabel="登録する"
          onOk={register}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
