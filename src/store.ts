import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface AppState {
  loaded: boolean;
  watchlist: string[];
  recent: string[];
}

const KEY = 'trader-state-v2';

let state: AppState = { loaded: false, watchlist: [], recent: [] };

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { watchlist, recent } = state;
    AsyncStorage.setItem(KEY, JSON.stringify({ watchlist, recent })).catch(() => {});
  }, 300);
}

export function setState(fn: (s: AppState) => Partial<AppState>) {
  state = { ...state, ...fn(state) };
  listeners.forEach((l) => l());
  persist();
}

export async function initStore() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    state = { loaded: true, watchlist: saved.watchlist ?? [], recent: saved.recent ?? [] };
  } catch {
    state = { ...state, loaded: true };
  }
  listeners.forEach((l) => l());
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}

export function toggleWatch(symbol: string) {
  setState((s) => ({ watchlist: s.watchlist.includes(symbol) ? s.watchlist.filter((x) => x !== symbol) : [symbol, ...s.watchlist] }));
}

export function addRecent(symbol: string) {
  setState((s) => ({ recent: [symbol, ...s.recent.filter((x) => x !== symbol)].slice(0, 8) }));
}
