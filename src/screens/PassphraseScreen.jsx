import { useState } from 'react';
import { APP_NAME, ENV_LABEL, GAS_URLS } from '../config.js';
import { ERROR_TEXT } from '../lib/api.js';

// 合言葉（端末ごとに初回に1回。記憶が消えたら入れ直す）
export function PassphraseScreen({ env, error, onSubmit, onEnv }) {
  const [pass, setPass] = useState('');
  const [shown, setShown] = useState(false);
  const canTest = !!GAS_URLS.test && !!GAS_URLS.prod;
  return (
    <div className="gate">
      <form
        className="gate-box"
        onSubmit={(e) => {
          e.preventDefault();
          if (pass.trim()) onSubmit(pass.trim());
        }}
      >
        <h1>{APP_NAME}</h1>
        <p className="note">合言葉を入れてください（この端末に記憶します）</p>
        {canTest && (
          <div className="seg" role="radiogroup" aria-label="接続先">
            {['prod', 'test'].map((k) => (
              <button type="button" key={k} role="radio" aria-checked={env === k} className={env === k ? 'on' : ''} onClick={() => onEnv(k)}>
                {ENV_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        <label className="lbl" htmlFor="pass">
          合言葉
        </label>
        <div className="pass-row">
          <input
            id="pass"
            className="field"
            type={shown ? 'text' : 'password'}
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <button type="button" className="btn small" onClick={() => setShown((s) => !s)}>
            {shown ? '隠す' : '見る'}
          </button>
        </div>
        {error && <p className="err">{ERROR_TEXT[error] || ERROR_TEXT.server}</p>}
        <button type="submit" className="btn primary wide" disabled={!pass.trim()}>
          はじめる
        </button>
      </form>
    </div>
  );
}
