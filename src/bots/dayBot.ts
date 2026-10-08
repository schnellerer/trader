import { getChart, pool, toEur } from '../api/yahoo';
import { DAY_UNIVERSE } from '../analysis/universe';
import { rsi } from '../analysis/indicators';
import { fmtPct } from '../format';
import { BotState } from '../types';
import { buy, clone, equityOf, finish, sell } from './sim';

const MAX_POSITIONS = 5;
const POSITION_SHARE = 0.2; // max. 20 % des Gesamtwerts pro Trade
const STOP_LOSS = -0.012;
const TAKE_PROFIT = 0.02;

interface Snap {
  symbol: string;
  name: string;
  price: number; // EUR
  vwap: number; // EUR
  rsi: number;
  dayChg: number;
  mom: number;
  open: boolean;
  closingSoon: boolean;
}

async function snapshot(symbol: string): Promise<Snap | null> {
  const d = await getChart(symbol, '1d', '5m', 0);
  const cs = d.candles;
  if (cs.length < 16) return null;
  const last = cs[cs.length - 1];
  const open = Date.now() - last.t < 25 * 60_000;
  let pv = 0;
  let vol = 0;
  cs.forEach((c) => {
    const tp = (c.h + c.l + c.c) / 3;
    pv += tp * c.v;
    vol += c.v;
  });
  const vwap = vol > 0 ? pv / vol : last.c;
  const closes = cs.map((c) => c.c);
  const fx = await toEur(1, d.meta.currency);
  const end = d.meta.periodEnd ?? 0;
  return {
    symbol,
    name: d.meta.name,
    price: last.c * fx,
    vwap: vwap * fx,
    rsi: rsi(closes, 14),
    dayChg: last.c / closes[0] - 1,
    mom: last.c / closes[Math.max(0, closes.length - 8)] - 1,
    open,
    // 25 Min. Puffer, weil GitHub geplante Läufe manchmal verspätet startet
    closingSoon: open && end > 0 && Date.now() > end - 25 * 60_000,
  };
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Ein Handelsdurchgang des Day-Trading-Bots. Gibt den neuen Zustand zurück (reine Funktion, läuft auf dem GitHub-Server). */
export async function stepDayBot(prev: BotState): Promise<BotState> {
  const snaps = (await pool(DAY_UNIVERSE, 6, snapshot)).filter((x): x is Snap => !!x);
  if (!snaps.length) throw new Error('Keine Intraday-Daten erreichbar');
  const bySym = new Map(snaps.map((s) => [s.symbol, s]));
  const b: BotState = clone(prev);
  const log: string[] = [];

  // Kurse aktualisieren
  b.positions.forEach((p) => {
    const s = bySym.get(p.symbol);
    if (s) p.lastPrice = s.price;
  });

  // Verkäufe
  for (const p of [...b.positions]) {
    const s = bySym.get(p.symbol);
    if (!s) continue;
    const pnl = s.price / p.avgPrice - 1;
    let reason = '';
    if (!sameDay(p.openedAt, Date.now())) reason = `Day-Trading hält nichts über Nacht – Position vom Vortag wird geschlossen (${fmtPct(pnl, 2)}).`;
    else if (pnl <= STOP_LOSS) reason = `Stop-Loss erreicht: ${fmtPct(pnl, 2)} (Grenze ${fmtPct(STOP_LOSS, 1)}). Verlust wird begrenzt.`;
    else if (pnl >= TAKE_PROFIT) reason = `Gewinnziel erreicht: ${fmtPct(pnl, 2)} (Ziel ${fmtPct(TAKE_PROFIT, 1)}). Gewinn wird mitgenommen.`;
    else if (s.closingSoon) reason = `Börsenschluss naht – Position wird geschlossen (${fmtPct(pnl, 2)}), keine Übernachtrisiken.`;
    else if (s.open && s.price < s.vwap * 0.999 && s.rsi < 45)
      reason = `Momentum gekippt: Kurs unter VWAP (${s.vwap.toFixed(2)} €) und RSI ${s.rsi.toFixed(0)} < 45. Ausstieg bei ${fmtPct(pnl, 2)}.`;
    if (reason && sell(b, p.symbol, s.price, reason)) log.push(`Verkauf ${p.symbol}`);
  }

  // Käufe
  const anyOpen = snaps.some((s) => s.open);
  if (!anyOpen) log.push('Börsen aktuell geschlossen – keine neuen Käufe.');
  else {
    const candidates = snaps
      .filter((s) => s.open && !s.closingSoon && s.price > s.vwap && s.rsi >= 52 && s.rsi <= 72 && s.dayChg > 0.003 && s.mom > 0.001)
      .filter((s) => !b.positions.some((p) => p.symbol === s.symbol))
      .sort((a, c) => c.dayChg + c.mom * 2 - (a.dayChg + a.mom * 2));
    let bought = 0;
    for (const s of candidates) {
      if (b.positions.length >= MAX_POSITIONS || bought >= 2) break;
      const amount = Math.min(equityOf(b) * POSITION_SHARE, b.cash);
      const reason =
        `Intraday-Aufwärtstrend: Kurs ${s.price.toFixed(2)} € über VWAP ${s.vwap.toFixed(2)} €, ` +
        `Tagesplus ${fmtPct(s.dayChg, 2)}, 40-Min-Momentum ${fmtPct(s.mom, 2)}, RSI ${s.rsi.toFixed(0)} (kräftig, aber nicht überkauft). ` +
        `Risiko begrenzt durch Stop-Loss ${fmtPct(STOP_LOSS, 1)} / Ziel ${fmtPct(TAKE_PROFIT, 1)}.`;
      if (buy(b, s.symbol, s.name, s.price, amount, reason)) {
        bought++;
        log.push(`Kauf ${s.symbol}`);
      }
    }
  }

  finish(b, log.length ? log.join(', ') : 'Keine Handelssignale.');
  return b;
}
