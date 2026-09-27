import { createContext, useContext, useSyncExternalStore } from 'react';

export const AppContext = createContext(null);

// { store, st, model, year, env, readOnly, write, setEnv }
export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error('AppContext がありません');
  return v;
}

export function useStoreState(store) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
