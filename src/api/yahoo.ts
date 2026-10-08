import { Candle, ChartData, SearchHit } from '../types';

const BASE = 'https://query1.finance.yahoo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const cache = new Map<string, { t: number; data: any }>();

async function getJson(url: string, ttlMs = 0): Promise<any> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data;
  let res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  for (let attempt = 0; res.status === 429 && attempt < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  }
  if (!res.ok) throw new Error(`Kursdaten nicht erreichbar (HTTP ${res.status})`);
  const data = await res.json();
  if (ttlMs > 0) cache.set(url, { t: Date.now(), data });
  return data;
}

export async function searchSymbols(q: string): Promise<SearchHit[]> {
  const url = `${BASE}/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=12&newsCount=0&lang=de-DE&region=DE`;
  const j = await getJson(url, 60_000);
  return (j.quotes ?? [])
    .filter((x: any) => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'FUTURE', 'CURRENCY'].includes(x.quoteType))
    .map((x: any) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      exchange: x.exchDisp || x.exchange || '',
      type: x.quoteType,
    }));
}

export type RangeKey = '1T' | '1W' | '1M' | '6M' | '1J' | '5J' | 'Max';
export const RANGES: Record<RangeKey, { range: string; interval: string }> = {
  '1T': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1J': { range: '1y', interval: '1d' },
  '5J': { range: '5y', interval: '1wk' },
  Max: { range: 'max', interval: '1mo' },
};

export async function getChart(symbol: string, range: string, interval: string, ttlMs = 120_000): Promise<ChartData> {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const j = await getJson(url, ttlMs);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(j?.chart?.error?.description || 'Keine Daten gefunden');
  const q = r.indicators?.quote?.[0] ?? {};
  const ts: number[] = r.timestamp ?? [];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null || !isFinite(c)) continue;
    candles.push({ t: ts[i] * 1000, c, h: q.high?.[i] ?? c, l: q.low?.[i] ?? c, v: q.volume?.[i] ?? 0 });
  }
  const m = r.meta;
  const reg = m.currentTradingPeriod?.regular;
  return {
    meta: {
      symbol: m.symbol,
      name: m.longName || m.shortName || m.symbol,
      currency: m.currency || 'USD',
      exchange: m.fullExchangeName || m.exchangeName || '',
      price: m.regularMarketPrice ?? candles[candles.length - 1]?.c ?? 0,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? candles[0]?.c ?? 0,
      high52: m.fiftyTwoWeekHigh,
      low52: m.fiftyTwoWeekLow,
      periodStart: reg?.start ? reg.start * 1000 : undefined,
      periodEnd: reg?.end ? reg.end * 1000 : undefined,
    },
    candles,
  };
}

export interface DividendEvent {
  t: number; // ms
  amount: number; // je Aktie, Kurswährung
}

/** Dividendenzahlungen der letzten Jahre (Ex-Dividenden-Tage) */
export async function getDividends(symbol: string, range = '10y', ttlMs = 3600_000): Promise<DividendEvent[]> {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1mo&events=div`;
  const j = await getJson(url, ttlMs);
  const ev = j?.chart?.result?.[0]?.events?.dividends;
  if (!ev) return [];
  return Object.values(ev as Record<string, any>)
    .map((e: any) => ({ t: e.date * 1000, amount: e.amount as number }))
    .filter((e) => isFinite(e.amount) && e.amount > 0)
    .sort((a, b) => a.t - b.t);
}

let fxCache: { t: number; rate: number } | null = null;
/** EUR→USD Kurs (1 EUR = x USD) */
export async function getEurUsd(): Promise<number> {
  if (fxCache && Date.now() - fxCache.t < 10 * 60_000) return fxCache.rate;
  try {
    const d = await getChart('EURUSD=X', '5d', '1d', 60_000);
    fxCache = { t: Date.now(), rate: d.meta.price };
  } catch {
    if (!fxCache) fxCache = { t: Date.now(), rate: 1.08 };
  }
  return fxCache!.rate;
}

export async function toEur(price: number, currency: string): Promise<number> {
  if (currency === 'EUR') return price;
  if (currency === 'USD') return price / (await getEurUsd());
  return price;
}

/** Aufgaben mit begrenzter Parallelität ausführen */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}
