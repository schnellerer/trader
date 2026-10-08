import { BotState, Position, Trade } from '../types';

export const FEE_RATE = 0.0005; // 0,05 % pro Order (simulierte Handelskosten)

export const clone = (b: BotState): BotState => JSON.parse(JSON.stringify(b));

export const isShort = (p: Position) => p.dir === -1;

/** Gesamtwert = Cash + Long-Positionen − Short-Verbindlichkeiten */
export const equityOf = (b: BotState) => b.cash + b.positions.reduce((s, p) => s + (isShort(p) ? -1 : 1) * p.qty * p.lastPrice, 0);

/** Gewinn/Verlust einer offenen Position in Prozent */
export const posPct = (p: Position) => (isShort(p) ? p.avgPrice / p.lastPrice - 1 : p.lastPrice / p.avgPrice - 1);
export const posPnl = (p: Position) => p.qty * (isShort(p) ? p.avgPrice - p.lastPrice : p.lastPrice - p.avgPrice);

let seq = 0;
const id = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Kauf in EUR-Betrag. Gibt true zurück, wenn gekauft wurde. */
export function buy(b: BotState, symbol: string, name: string, price: number, amountEur: number, reason: string, feeRate = FEE_RATE): boolean {
  amountEur = Math.min(amountEur, b.cash);
  if (price <= 0 || amountEur < 20) return false;
  const fee = amountEur * feeRate;
  const qty = (amountEur - fee) / price;
  b.cash -= amountEur;
  const ex = b.positions.find((p) => p.symbol === symbol);
  if (ex) {
    ex.avgPrice = (ex.avgPrice * ex.qty + price * qty) / (ex.qty + qty);
    ex.qty += qty;
    ex.lastPrice = price;
  } else {
    const p: Position = { symbol, name, qty, avgPrice: price, lastPrice: price, openedAt: Date.now() };
    b.positions.push(p);
  }
  const t: Trade = { id: id(), t: Date.now(), symbol, name, side: 'KAUF', qty, price, fee, reason };
  b.trades.unshift(t);
  return true;
}

/** Verkauf; fraction < 1 verkauft nur einen Teil der Position (z. B. 0,5 = die Hälfte) */
export function sell(b: BotState, symbol: string, price: number, reason: string, feeRate = FEE_RATE, fraction = 1): boolean {
  const i = b.positions.findIndex((p) => p.symbol === symbol && !isShort(p));
  if (i < 0 || price <= 0) return false;
  const p = b.positions[i];
  const qty = fraction >= 0.9999 ? p.qty : p.qty * fraction;
  const gross = qty * price;
  const fee = gross * feeRate;
  const cost = qty * p.avgPrice;
  const pnl = gross - fee - cost;
  b.cash += gross - fee;
  if (qty >= p.qty) b.positions.splice(i, 1);
  else p.qty -= qty;
  b.trades.unshift({
    id: id(),
    t: Date.now(),
    symbol,
    name: p.name,
    side: 'VERKAUF',
    qty,
    price,
    fee,
    reason,
    pnl,
    pnlPct: pnl / cost,
    heldMs: Date.now() - p.openedAt,
  });
  return true;
}

/** Short eröffnen (auf fallende Kurse setzen). Betrag in EUR. */
export function openShort(b: BotState, symbol: string, name: string, price: number, amountEur: number, reason: string, feeRate = FEE_RATE): boolean {
  if (price <= 0 || amountEur < 20 || b.positions.some((p) => p.symbol === symbol)) return false;
  const fee = amountEur * feeRate;
  const qty = amountEur / price;
  b.cash += amountEur - fee;
  b.positions.push({ symbol, name, qty, avgPrice: price, lastPrice: price, openedAt: Date.now(), dir: -1 });
  b.trades.unshift({ id: id(), t: Date.now(), symbol, name, side: 'SHORT', qty, price, fee, reason });
  return true;
}

export function coverShort(b: BotState, symbol: string, price: number, reason: string, feeRate = FEE_RATE): boolean {
  const i = b.positions.findIndex((p) => p.symbol === symbol && isShort(p));
  if (i < 0 || price <= 0) return false;
  const p = b.positions[i];
  const gross = p.qty * price;
  const fee = gross * feeRate;
  const pnl = p.qty * p.avgPrice - gross - fee;
  b.cash -= gross + fee;
  b.positions.splice(i, 1);
  b.trades.unshift({
    id: id(),
    t: Date.now(),
    symbol,
    name: p.name,
    side: 'COVER',
    qty: p.qty,
    price,
    fee,
    reason,
    pnl,
    pnlPct: pnl / (p.qty * p.avgPrice),
    heldMs: Date.now() - p.openedAt,
  });
  return true;
}

/** Position schließen, egal ob Long oder Short */
export function closePosition(b: BotState, p: Position, price: number, reason: string, feeRate = FEE_RATE): boolean {
  return isShort(p) ? coverShort(b, p.symbol, price, reason, feeRate) : sell(b, p.symbol, price, reason, feeRate);
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

export function finish(b: BotState, log: string) {
  b.lastRun = Date.now();
  b.lastLog = log;
  if (b.trades.length > 300) b.trades.length = 300;
  const last = b.equity[b.equity.length - 1];
  const v = equityOf(b);
  if (!last || Date.now() - last.t > 15 * 60_000) b.equity.push({ t: Date.now(), v });
  else last.v = v;
  // Verlauf klein halten: ältere Hälfte ausdünnen (jeder zweite Punkt)
  if (b.equity.length > 1500) {
    const half = Math.floor(b.equity.length / 2);
    b.equity = [...b.equity.slice(0, half).filter((_, i) => i % 2 === 0), ...b.equity.slice(half)];
  }
}

export interface BotStats {
  equity: number;
  pnl: number;
  pnlPct: number;
  monthPct: number;
  closed: number;
  winRate: number;
  best?: Trade;
  worst?: Trade;
  fees: number;
}

const isClose = (t: Trade) => t.pnl != null;

export function botStats(b: BotState): BotStats {
  const eq = equityOf(b);
  const closed = b.trades.filter(isClose);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const monthAgo = Date.now() - 30 * 86400_000;
  const ref = [...b.equity].reverse().find((e) => e.t <= monthAgo) ?? b.equity[0];
  const sorted = [...closed].sort((a, c) => (c.pnl ?? 0) - (a.pnl ?? 0));
  return {
    equity: eq,
    pnl: eq - b.startCapital,
    pnlPct: eq / b.startCapital - 1,
    monthPct: ref && ref.v > 0 ? eq / ref.v - 1 : 0,
    closed: closed.length,
    winRate: closed.length ? wins / closed.length : 0,
    best: sorted[0],
    worst: sorted[sorted.length - 1],
    fees: b.trades.reduce((s, t) => s + t.fee, 0),
  };
}

// ---------- Tagesbilanz & Tagesrating ----------

export interface DaySummary {
  key: string;
  start: number; // Tagesbeginn (ms, lokale Zeit des Geräts)
  isToday: boolean;
  trades: Trade[]; // alle Trades des Tages (neueste zuerst)
  closed: Trade[]; // abgeschlossene Trades des Tages
  wins: number;
  losses: number;
  realized: number; // realisierter Gewinn/Verlust in €
  change: number; // Gesamtveränderung des Depots an diesem Tag in € (inkl. offener Positionen)
  pct: number; // Veränderung in % des Depots zu Tagesbeginn
  stars: number; // 0 = kein Handel, 1-5
  label: string;
}

export function rateDay(pct: number, tradeCount: number): { stars: number; label: string } {
  if (tradeCount === 0) return { stars: 0, label: 'Kein Handel' };
  if (pct >= 0.01) return { stars: 5, label: 'Sehr stark' };
  if (pct >= 0.003) return { stars: 4, label: 'Gut' };
  if (pct >= 0) return { stars: 3, label: 'Ausgeglichen' };
  if (pct >= -0.005) return { stars: 2, label: 'Schwach' };
  return { stars: 1, label: 'Schlecht' };
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Tagesbilanz pro Handelstag (neuester Tag zuerst); der heutige Tag ist immer enthalten. */
export function dailySummaries(b: BotState, now = Date.now()): DaySummary[] {
  const keys = new Set<string>([dayKey(now), ...b.trades.map((t) => dayKey(t.t))]);
  const eqNow = equityOf(b);
  const out: DaySummary[] = [];
  keys.forEach((key) => {
    const [y, m, d] = key.split('-').map(Number);
    const start = new Date(y, m - 1, d).getTime();
    const end = start + 86400_000;
    const isToday = key === dayKey(now);
    const trades = b.trades.filter((t) => t.t >= start && t.t < end);
    const closed = trades.filter(isClose);
    const before = [...b.equity].reverse().find((e) => e.t < start);
    const startEq = before?.v ?? (start <= b.createdAt ? b.startCapital : b.equity[0]?.v ?? b.startCapital);
    const lastIn = [...b.equity].reverse().find((e) => e.t < end);
    const endEq = isToday ? eqNow : lastIn?.v ?? startEq;
    const change = endEq - startEq;
    const pct = startEq > 0 ? change / startEq : 0;
    const r = rateDay(pct, trades.length);
    out.push({
      key,
      start,
      isToday,
      trades,
      closed,
      wins: closed.filter((t) => (t.pnl ?? 0) > 0).length,
      losses: closed.filter((t) => (t.pnl ?? 0) <= 0).length,
      realized: closed.reduce((s, t) => s + (t.pnl ?? 0), 0),
      change,
      pct,
      stars: r.stars,
      label: r.label,
    });
  });
  return out.sort((a, c) => c.start - a.start);
}
