import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, useStoreState } from './app-context.js';
import { Shell, SUBTABS } from './components/Shell.jsx';
import { GAS_URLS, loadEnv, safeStorage, saveEnv } from './config.js';
import { useHashRoute } from './hooks.js';
import { ERROR_TEXT } from './lib/api.js';
import { currentYear, now, setClockOffset } from './lib/clock.js';
import { buildModel } from './lib/fold.js';
import { currentQuarter } from './lib/review.js';
import { PER_YEAR_KINDS } from './lib/schema.js';
import { createStore } from './lib/store.js';
import { AccelScreen } from './screens/AccelScreen.jsx';
import { BrakeScreen } from './screens/BrakeScreen.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { IcebergScreen } from './screens/IcebergScreen.jsx';
import { LifeMapScreen } from './screens/LifeMapScreen.jsx';
import { LongtermScreen } from './screens/LongtermScreen.jsx';
import { GrowthTimeline } from './screens/GrowthTimeline.jsx';
import { PassphraseScreen } from './screens/PassphraseScreen.jsx';
import { ReviewScreen } from './screens/ReviewScreen.jsx';
import { Settings } from './screens/Settings.jsx';
import { YearRecord } from './screens/YearRecord.jsx';

const storage = safeStorage();

// rest：場所の続き（年ごとの記録の年と中身。#/timeline/years/2026/brake）
function screenFor(tab, sub, year, rest, go) {
  switch (tab) {
    case 'home':
      return { title: `${year}年`, el: <HomeScreen /> };
    case 'map':
      if (sub === 'brake') return { title: `成長の地図 ${year}年`, el: <BrakeScreen year={year} /> };
      if (sub === 'accel') return { title: `成長の地図 ${year}年`, el: <AccelScreen year={year} /> };
      return { title: `成長の地図 ${year}年`, el: <IcebergScreen year={year} /> };
    case 'review':
      if (sub === 'roadmap') return { title: '逆算ロードマップ', el: <LongtermScreen part="roadmap" /> };
      if (sub === 'plan') return { title: 'アクションプラン', el: <LongtermScreen part="plan" /> };
      return { title: '振り返り', el: <ReviewScreen /> };
    case 'life':
      return { title: '人生マップ', el: <LifeMapScreen /> };
    case 'timeline':
      if (sub === 'years') {
        return {
          title: '年表',
          el: <YearRecord year={Number(rest[0]) || null} part={rest[1] || null} onChange={(y, p) => go(`timeline/years/${y}/${p}`)} />,
        };
      }
      return { title: '年表', el: <GrowthTimeline onOpen={(y) => go(`timeline/years/${y}/iceberg`)} /> };
    case 'settings':
      return { title: '設定', el: <Settings /> };
    default:
      return { title: `${year}年`, el: <HomeScreen /> };
  }
}

export default function App() {
  const [env, setEnvState] = useState(() => loadEnv(storage));
  const url = GAS_URLS[env];
  const store = useMemo(() => createStore({ env, url, storage, nowFn: now }), [env, url]);
  const st = useStoreState(store);
  const [year, setYear] = useState(currentYear);
  // 今の四半期（ホームの「今の四半期の目標」）。開いたまま四半期をまたいでも描き直す
  const [quarter, setQuarter] = useState(() => currentQuarter(now()));
  const [route, go] = useHashRoute('home');

  // 本番では仮の日付を使わない
  useEffect(() => {
    if (env === 'prod') setClockOffset(0);
    setYear(currentYear());
    setQuarter(currentQuarter(now()));
  }, [env]);

  // 接続先を替えたら前の保存の仕組みを止める
  const prevStore = useRef(null);
  useEffect(() => {
    if (prevStore.current && prevStore.current !== store) prevStore.current.dispose();
    prevStore.current = store;
    store.reload();
  }, [store]);

  // 画面に戻った時・通信が戻った時：年を確かめ直し、未保存を送る
  // 開いたまま年・四半期をまたいだ時のために、1分ごとにも年と四半期を確かめる
  const yearRef = useRef(year);
  yearRef.current = year;
  useEffect(() => {
    const checkYear = () => {
      const cq = currentQuarter(now());
      setQuarter((old) => (old && cq && old.year === cq.year && old.q === cq.q ? old : cq));
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
        if (drafts.some((d) => PER_YEAR_KINDS.has(d.kind) && Number(d.year) < y && d.extra?.source !== 'seed')) {
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
      setQuarter(currentQuarter(now()));
    },
    [env],
  );

  const ctx = { store, st, model, year, quarter, env, readOnly, write, setEnv, setClock };

  if (st.phase === 'needPass' || (st.phase === 'init' && !st.pass && !st.key)) {
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

  const [tab, sub0, ...rest] = route.split('/');
  // 振り返りの中（逆算ロードマップ・アクションプラン）は切り替えを出さずに、場所だけで分ける
  const sub = SUBTABS[tab] ? SUBTABS[tab].find((s) => s.key === sub0)?.key || SUBTABS[tab][0].key : sub0 || null;
  const { title, el } = screenFor(tab, sub, year, rest, go);

  return (
    <AppContext.Provider value={ctx}>
      <Shell tab={tab} sub={sub} title={title} go={go}>
        {readOnly && <div className="notice warn">{ERROR_TEXT.upgrade}（見るだけにしています）</div>}
        {el}
      </Shell>
    </AppContext.Provider>
  );
}
