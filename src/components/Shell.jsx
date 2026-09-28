import { useApp } from '../app-context.js';
import { ENV_LABEL } from '../config.js';
import { ERROR_TEXT } from '../lib/api.js';
import { ErrorBoundary } from './ErrorBoundary.jsx';

export const TABS = [
  { key: 'home', label: 'ホーム', path: 'home' },
  { key: 'map', label: '成長の地図', path: 'map/iceberg' },
  { key: 'review', label: '振り返り', path: 'review' },
  { key: 'life', label: '人生マップ', path: 'life' },
  { key: 'timeline', label: '年表', path: 'timeline/growth' },
];

export const SUBTABS = {
  map: [
    { key: 'iceberg', label: 'アイスバーグ', path: 'map/iceberg' },
    { key: 'brake', label: 'ブレーキ', path: 'map/brake' },
    { key: 'accel', label: 'アクセル', path: 'map/accel' },
  ],
  timeline: [
    { key: 'growth', label: 'アイスバーグ成長年表', short: '成長年表', path: 'timeline/growth' },
    { key: 'years', label: '年ごとの記録', path: 'timeline/years' },
  ],
};

// 右上は短く（詳しい文は title と設定の画面に出す）
const SHORT_ERROR = {
  locked: '止めています',
  year: '読み込み直しました',
  upgrade: '更新が必要',
  busy: '混み合っています',
  setup: '準備が必要',
  bad: '送れない記録あり',
  server: '保存先のエラー',
  network: '通信できません',
  timeout: '通信待ち',
  nourl: '接続先なし',
};

// 保存の様子（右上に小さく）
function SaveStatus() {
  const { st } = useApp();
  let text = '';
  let full = '';
  let cls = '';
  if (st.saving) {
    // 書いた内容はもう端末に残っている。届くまで送り直す
    text = st.pending.length ? `送信中（${st.pending.length}件）` : '送信中…';
    full = '書いた内容はこの端末に残っています。届くまで送り直します';
  } else if (st.pending.length) {
    text = `未保存 ${st.pending.length}件`;
    cls = 'warn';
  } else if (st.refreshing) text = '読み込み中…';
  else if (st.error && st.error !== 'auth') {
    text = SHORT_ERROR[st.error] || '通信エラー';
    full = ERROR_TEXT[st.error] || '';
    cls = 'warn';
  }
  if (!text) return null;
  return (
    <span className={`save ${cls}`} role="status" title={full || undefined}>
      {text}
    </span>
  );
}

export function Shell({ tab, sub, title, go, actions = null, children }) {
  const { env, st, store } = useApp();
  const subs = SUBTABS[tab];
  return (
    <div className="app">
      <aside className="side" aria-label="画面の切り替え">
        <div className="side-title">成長の地図</div>
        {TABS.map((t) => (
          <div key={t.key}>
            <button type="button" className={`side-item${tab === t.key && !SUBTABS[t.key] ? ' on' : ''}`} onClick={() => go(t.path)}>
              {t.label}
            </button>
            {SUBTABS[t.key]?.map((s) => (
              <button
                type="button"
                key={s.key}
                className={`side-item sub${tab === t.key && sub === s.key ? ' on' : ''}`}
                onClick={() => go(s.path)}
              >
                {s.short || s.label}
              </button>
            ))}
          </div>
        ))}
        <button type="button" className={`side-item gear${tab === 'settings' ? ' on' : ''}`} onClick={() => go('settings')}>
          設定
        </button>
      </aside>

      <div className="main">
        <header className="bar">
          <div className="bar-l">
            <b className="bar-title">{title}</b>
            {env === 'test' && <span className="env-badge">{ENV_LABEL.test}</span>}
          </div>
          <div className="bar-r">
            <SaveStatus />
            <span id="bar-actions" className="bar-actions" />
            {actions}
            <button type="button" className="bar-link gear-top" onClick={() => go('settings')}>
              設定
            </button>
          </div>
        </header>
        {st.notice && (
          <div className="notice" role="status">
            <span>{st.notice}</span>
            <button type="button" className="notice-x" aria-label="知らせを閉じる" onClick={() => store.clearNotice()}>
              ×
            </button>
          </div>
        )}
        {subs && (
          <nav className="subtabs" aria-label={`${title}の中`}>
            {subs.map((s) => (
              <button type="button" key={s.key} className={sub === s.key ? 'on' : ''} onClick={() => go(s.path)}>
                {s.label}
              </button>
            ))}
          </nav>
        )}
        <main className="body">
          <ErrorBoundary key={`${tab}/${sub || ''}`}>{children}</ErrorBoundary>
        </main>
      </div>

      <nav className="nav" aria-label="画面の切り替え">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => go(t.path)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
