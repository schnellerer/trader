import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { buy, clone, equityOf, newBot, sell } from './bots/sim';
import { BotState } from './types';

export interface AppState {
  loaded: boolean;
  watchlist: string[];
  recent: string[];
  me: BotState | null; // dein Spiel-Depot im Duell gegen die Bots (nur lokal auf dem Handy)
}

const KEY = 'trader-state-v2';

let state: AppState = { loaded: false, watchlist: [], recent: [], me: null };

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { watchlist, recent, me } = state;
    AsyncStorage.setItem(KEY, JSON.stringify({ watchlist, recent, me })).catch(() => {});
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
    state = { loaded: true, watchlist: saved.watchlist ?? [], recent: saved.recent ?? [], me: saved.me ?? null };
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

// ---------- Duell: eigenes Spiel-Depot ----------

export function startGame(capital: number) {
  const g = newBot(capital);
  g.lastLog = 'Duell gestartet.';
  setState(() => ({ me: g }));
}

export function endGame() {
  setState(() => ({ me: null }));
}

/** Kauf mit Spielgeld. Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
export function playerBuy(symbol: string, name: string, priceEur: number, amountEur: number, note: string): string | null {
  const me = state.me;
  if (!me) return 'Spiel nicht gestartet.';
  if (!(amountEur >= 20)) return 'Mindestbetrag sind 20 €.';
  if (amountEur > me.cash + 0.005) return 'Nicht genug Spielgeld (Cash).';
  const g = clone(me);
  const ok = buy(g, symbol, name, priceEur, amountEur, note.trim() || 'Eigener Trade (ohne Begründung)');
  if (!ok) return 'Kauf nicht möglich.';
  recordEquity(g);
  setState(() => ({ me: g }));
  return null;
}

/** Verkauf mit Spielgeld; fraction 1 = alles, 0,5 = die Hälfte. */
export function playerSell(symbol: string, priceEur: number, fraction: number, note = 'Eigener Verkauf'): string | null {
  const me = state.me;
  if (!me) return 'Spiel nicht gestartet.';
  const g = clone(me);
  if (!sell(g, symbol, priceEur, note, undefined, fraction)) return 'Verkauf nicht möglich.';
  recordEquity(g);
  setState(() => ({ me: g }));
  return null;
}

/** Aktuelle Kurse (EUR) in das Depot übernehmen und einen Verlaufspunkt speichern */
export function refreshPlayerPrices(prices: Record<string, number>) {
  const me = state.me;
  if (!me) return;
  const g = clone(me);
  g.positions.forEach((p) => {
    if (prices[p.symbol]) p.lastPrice = prices[p.symbol];
  });
  recordEquity(g);
  setState(() => ({ me: g }));
}

function recordEquity(g: BotState) {
  const v = equityOf(g);
  const last = g.equity[g.equity.length - 1];
  if (!last || Date.now() - last.t > 5 * 60_000) g.equity.push({ t: Date.now(), v });
  else last.v = v;
  if (g.equity.length > 1500) g.equity.splice(1, g.equity.length - 1500);
  if (g.trades.length > 300) g.trades.length = 300;
  g.lastRun = Date.now();
}
