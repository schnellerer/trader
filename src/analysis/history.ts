import { getChart, pool } from '../api/yahoo';
import { UNIVERSE } from './universe';

export interface Series {
  t: number[];
  c: number[];
}

export interface History {
  spx: Series;
  stocks: Map<string, Series>;
}

let cache: History | null = null;
let running: Promise<History> | null = null;

/** Lädt 10 Jahre Tageskurse für das Universum (44 Aktien) und den S&P 500; wird im Speicher zwischengehalten */
export function loadHistory(onProgress?: (done: number, total: number) => void): Promise<History> {
  if (cache) return Promise.resolve(cache);
  if (running) return running;
  let done = 0;
  const total = UNIVERSE.length + 1;
  const get = async (sym: string): Promise<Series> => {
    const d = await getChart(sym, '10y', '1d', 3600_000);
    onProgress?.(++done, total);
    return { t: d.candles.map((c) => c.t), c: d.candles.map((c) => c.c) };
  };
  running = (async () => {
    const spx = await get('^GSPC');
    const res = await pool(UNIVERSE, 5, async (s) => [s, await get(s)] as const);
    const stocks = new Map<string, Series>();
    res.forEach((r) => r && r[1].c.length > 400 && stocks.set(r[0], r[1]));
    if (stocks.size < 10) throw new Error('Zu wenige Kursdaten geladen – bitte später erneut versuchen.');
    cache = { spx, stocks };
    return cache;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Index der letzten Kerze mit Zeit <= t (−1 wenn keine) */
export function idxAt(s: Series, t: number): number {
  let lo = 0;
  let hi = s.t.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
