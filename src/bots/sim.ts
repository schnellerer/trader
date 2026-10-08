import { BotState, Position, Trade } from '../types';

export const FEE_RATE = 0.0005; // 0,05 % pro Order (simulierte Handelskosten)

export const clone = (b: BotState): BotState => JSON.parse(JSON.stringify(b));

export const equityOf = (b: BotState) => b.cash + b.positions.reduce((s, p) => s + p.qty * p.lastPrice, 0);

let seq = 0;
const id = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Kauf in EUR-Betrag. Gibt true zurück, wenn gekauft wurde. */
export function buy(b: BotState, symbol: string, name: string, price: number, amountEur: number, reason: string): boolean {
  amountEur = Math.min(amountEur, b.cash);
  if (price <= 0 || amountEur < 20) return false;
  const fee = amountEur * FEE_RATE;
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

export function sell(b: BotState, symbol: string, price: number, reason: string): boolean {
  const i = b.positions.findIndex((p) => p.symbol === symbol);
  if (i < 0 || price <= 0) return false;
  const p = b.positions[i];
  const gross = p.qty * price;
  const fee = gross * FEE_RATE;
  const cost = p.qty * p.avgPrice;
  const pnl = gross - fee - cost;
  b.cash += gross - fee;
  b.positions.splice(i, 1);
  b.trades.unshift({
    id: id(),
    t: Date.now(),
    symbol,
    name: p.name,
    side: 'VERKAUF',
    qty: p.qty,
    price,
    fee,
    reason,
    pnl,
    pnlPct: pnl / cost,
  });
  return true;
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

export function botStats(b: BotState): BotStats {
  const eq = equityOf(b);
  const closed = b.trades.filter((t) => t.side === 'VERKAUF');
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
