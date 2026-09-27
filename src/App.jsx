import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, useStoreState } from './app-context.js';
import { Shell, SUBTABS } from './components/Shell.jsx';
import { GAS_URLS, loadEnv, safeStorage, saveEnv } from './config.js';
import { useHashRoute } from './hooks.js';
import { ERROR_TEXT } from './lib/api.js';
import { currentYear, now, setClockOffset } from './lib/clock.js';
import { buildModel } from './lib/fold.js';
import { PER_YEAR_KINDS } from './lib/schema.js';
import { createStore } from './lib/store.js';
import { PassphraseScreen } from './screens/PassphraseScreen.jsx';
import { Placeholder } from './screens/Placeholder.jsx';
import { Settings } from './screens/Settings.jsx';

const storage = safeStorage();

function screenFor(tab, sub, year) {
  switch (tab) {
    case 'home':
      return { title: `${year}年`, el: <Placeholder name="ホーム（今年の目標・指標）" phase={4} /> };
    case 'map':
      if (sub === 'brake') return { title: `成長の地図 ${year}年`, el: <Placeholder name="ブレーキ" phase={6} /> };
      if (sub === 'accel') return { title: `成長の地図 ${year}年`, el: <Placeholder name="アクセル" phase={5} /> };
      return { title: `成長の地図 ${year}年`, el: <Placeholder name="アイスバーグ" phase={2} /> };
    case 'review':
      return { title: '振り返り', el: <Placeholder name="振り返り" phase={3} /> };
    case 'life':
      return { title: '人生マップ', el: <Placeholder name="人生マップ" phase={7} /> };
    case 'timeline':
      return {
        title: '年表',
        el: <Placeholder name={sub === 'years' ? '年ごとの記録' : 'アイスバーグ成長年表'} phase={8} />,
      };
    case 'settings':
      return { title: '設定', el: <Settings /> };
    default:
      return { title: `${year}年`, el: <Placeholder name="ホーム" phase={4} /> };
  }
}

export default function App() {
  const [env, setEnvState] = useState(() => loadEnv(storage));
  const url = GAS_URLS[env];
  const store = useMemo(() => createStore({ env, url, storage, nowFn: now }), [env, url]);
  const st = useStoreState(store);
  const [year, setYear] = useState(currentYear);
  const [route, go] = useHashRoute('home');

  // 本番では仮の日付を使わない
  useEffect(() => {
    if (env === 'prod') setClockOffset(0);
    setYear(currentYear());
  }, [env]);

  // 接続先を替えたら前の保存の仕組みを止める
  const prevStore = useRef(null);
  useEffect(() => {
    if (prevStore.current && prevStore.current !== store) prevStore.current.dispose();
    prevStore.current = store;
    store.reload();
  }, [store]);

  // 画面に戻った時・通信が戻った時：年を確かめ直し、未保存を送る
  // 開いたまま年をまたいだ時のために、1分ごとにも年だけ確かめる
  const yearRef = useRef(year);
  yearRef.current = year;
  useEffect(() => {
    const checkYear = () => {
      const y = currentYear();
      if (y === yearRef.current) return;
      yearRef.current = y;
      setYear(y);
      store.reload();
    };
    const check = () => {
      checkYear();
      store.flush();
    };
    const vis = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    const timer = setInterval(checkYear, 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      clearInterval(timer);
    };
  }, [store]);

  const pendingRows = useMemo(() => st.pending.map((p) => p.row), [st.pending]);
  const model = useMemo(() => buildModel(st.rows, pendingRows, { currentYear: year }), [st.rows, pendingRows, year]);
  const readOnly = model.unsupported || st.error === 'upgrade';

  // 書く。書けなかった時は null（入力の小窓は閉じずに残す）
  const write = useCallback(
    (drafts) => {
      if (readOnly) return null;
      // 書く直前にも年を確かめる（年をまたいで開いたままの画面）
      const y = currentYear();
      if (y !== year) {
        setYear(y);
        store.reload();
        // 前の年の地図（年ごとの種類）への書き込みだけ止める。振り返りなどはそのまま書く
        if (drafts.some((d) => PER_YEAR_KINDS.has(d.kind) && Number(d.year) < y)) {
          store.notify(`年が変わりました（${y}年）。前の年の地図は見るだけです`);
          return null;
        }
      }
      return store.add(drafts);
    },
    [readOnly, store, year],
  );

  const setEnv = useCallback((k) => {
    saveEnv(storage, k);
    setEnvState(k);
  }, []);

  const setClock = useCallback(
    (ms) => {
      if (env !== 'test') return;
      setClockOffset(ms);
      setYear(currentYear());
    },
    [env],
  );

  const ctx = { store, st, model, year, env, readOnly, write, setEnv, setClock };

  if (st.phase === 'needPass' || (st.phase === 'init' && !st.pass)) {
    return (
      <PassphraseScreen
        env={env}
        error={st.error}
        onEnv={setEnv}
        onSubmit={(p) => {
          store.setPass(p);
          store.reload();
        }}
      />
    );
  }
  if (st.phase === 'loading' || st.phase === 'init') {
    return (
      <div className="gate">
        <p className="note">読み込み中…</p>
      </div>
    );
  }
  if (st.phase === 'error') {
    return (
      <div className="gate">
        <div className="gate-box">
          <p className="err">{ERROR_TEXT[st.error] || ERROR_TEXT.server}</p>
          <button type="button" className="btn primary wide" onClick={() => store.reload()}>
            もう一度読み込む
          </button>
          {GAS_URLS.prod && GAS_URLS.test && (
            <button type="button" className="btn wide" style={{ marginTop: 8 }} onClick={() => setEnv(env === 'prod' ? 'test' : 'prod')}>
              {env === 'prod' ? 'テスト用' : '本番'}につなぎ替える
            </button>
          )}
        </div>
      </div>
    );
  }

  const [tab, sub0] = route.split('/');
  const sub = SUBTABS[tab] ? SUBTABS[tab].find((s) => s.key === sub0)?.key || SUBTABS[tab][0].key : null;
  const { title, el } = screenFor(tab, sub, year);

  return (
    <AppContext.Provider value={ctx}>
      <Shell tab={tab} sub={sub} title={title} go={go}>
        {readOnly && <div className="notice warn">{ERROR_TEXT.upgrade}（見るだけにしています）</div>}
        {el}
      </Shell>
    </AppContext.Provider>
  );
}
