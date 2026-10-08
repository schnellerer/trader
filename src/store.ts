import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { BotState } from './types';

export interface AppState {
  loaded: boolean;
  startCapital: number;
  watchlist: string[];
  recent: string[];
  day: BotState;
  long: BotState;
}

export const newBot = (capital: number): BotState => ({
  cash: capital,
  startCapital: capital,
  positions: [],
  trades: [],
  equity: [{ t: Date.now(), v: capital }],
  lastRun: null,
  lastLog: 'Noch nicht gelaufen.',
  createdAt: Date.now(),
});

const DEFAULT_CAPITAL = 10000;
const KEY = 'trader-state-v1';

let state: AppState = {
  loaded: false,
  startCapital: DEFAULT_CAPITAL,
  watchlist: [],
  recent: [],
  day: newBot(DEFAULT_CAPITAL),
  long: newBot(DEFAULT_CAPITAL),
};

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { loaded, ...rest } = state;
    AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => {});
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
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved, loaded: true };
    } else {
      state = { ...state, loaded: true };
    }
  } catch {
    state = { ...state, loaded: true };
  }
  listeners.forEach((l) => l());
}

export const getState = () => state;

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

export function resetBots(capital: number) {
  setState(() => ({ startCapital: capital, day: newBot(capital), long: newBot(capital) }));
}
