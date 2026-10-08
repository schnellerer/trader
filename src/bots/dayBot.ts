import { getChart, pool, toEur } from '../api/yahoo';
import { DAY_UNIVERSE } from '../analysis/universe';
import { atr, ema, rsi } from '../analysis/indicators';
import { fmtPct } from '../format';
import { BotState } from '../types';
import { badHour, dayLossLocked, isBanned, learnFrom, strictMode, symbolWeight } from './learn';
import { buy, clone, closePosition, equityOf, finish } from './sim';

const MAX_POSITIONS = 5;
const POSITION_SHARE = 0.2; // max. 20 % des Gesamtwerts pro Trade
const MIN_STOP = 0.004; // Stop-Loss mindestens 0,4 %
const MAX_STOP = 0.012; // höchstens 1,2 %
const RR = 1.8; // Gewinnziel = 1,8 × Stop-Abstand

interface Hit {
  low: number;
  high: number;
}

interface Snap {
  symbol: string;
  name: string;
  price: number; // EUR
  vwap: number; // EUR
  rsi: number;
  trendUp: boolean; // EMA 9 > EMA 21, EMA 21 steigt, Kurs über VWAP (1-Minuten-Kerzen)
  trendDown: boolean;
  dayChg: number;
  mom10: number; // Momentum der letzten 10 Minuten
  mom30: number;
  volSpike: number; // Volumen der letzten 5 Min. im Vergleich zum Tagesschnitt
  atrPct: number; // Schwankung pro Minute in % des Kurses
  open: boolean;
  closingSoon: boolean;
  candles: { t: number; h: number; l: number }[]; // EUR
}

async function snapshot(symbol: string): Promise<Snap | null> {
  const d = await getChart(symbol, '1d', '1m', 0);
  const cs = d.candles;
  if (cs.length < 40) return null;
  const last = cs[cs.length - 1];
  const open = Date.now() - last.t < 15 * 60_000;
  let pv = 0;
  let vol = 0;
  cs.forEach((c) => {
    pv += ((c.h + c.l + c.c) / 3) * c.v;
    vol += c.v;
  });
  const vwapRaw = vol > 0 ? pv / vol : last.c;
  const closes = cs.map((c) => c.c);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const n = closes.length - 1;
  const fx = await toEur(1, d.meta.currency);
  const end = d.meta.periodEnd ?? 0;
  const avgVol = vol / cs.length || 1;
  const recentVol = cs.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
  const a = atr(cs, 14);
  return {
    symbol,
    name: d.meta.name,
    price: last.c * fx,
    vwap: vwapRaw * fx,
    rsi: rsi(closes, 14),
    trendUp: e9[n] > e21[n] && e21[n] > e21[n - 5] && last.c > vwapRaw,
    trendDown: e9[n] < e21[n] && e21[n] < e21[n - 5] && last.c < vwapRaw,
    dayChg: last.c / closes[0] - 1,
    mom10: last.c / closes[n - 10] - 1,
    mom30: last.c / closes[Math.max(0, n - 30)] - 1,
    volSpike: avgVol > 0 ? recentVol / avgVol : 1,
    atrPct: a / last.c,
    open,
    // 25 Min. Puffer, weil GitHub geplante Läufe manchmal verspätet startet
    closingSoon: open && end > 0 && Date.now() > end - 25 * 60_000,
    candles: cs.map((c) => ({ t: c.t, h: c.h * fx, l: c.l * fx })),
  };
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Ein Handelsdurchgang des Day-Trading-Bots auf 1-Minuten-Kerzen. Reine Funktion, läuft auf dem GitHub-Server. */
export async function stepDayBot(prev: BotState): Promise<BotState> {
  const snaps = (await pool(DAY_UNIVERSE, 6, snapshot)).filter((x): x is Snap => !!x);
  if (!snaps.length) throw new Error('Keine Intraday-Daten erreichbar');
  const bySym = new Map(snaps.map((s) => [s.symbol, s]));
  const b: BotState = clone(prev);
  const log: string[] = [];
  const since = (b.lastRun ?? Date.now() - 10 * 60_000) - 60_000; // 1-Minuten-Kerzen seit dem letzten Lauf auswerten
  const tradesBefore = b.trades.length;

  b.positions.forEach((p) => {
    const s = bySym.get(p.symbol);
    if (s) p.lastPrice = s.price;
  });

  // ---- Positionen verwalten: Tiefst-/Höchstkurse der 1-Minuten-Kerzen seit dem letzten Lauf prüfen ----
  for (const p of [...b.positions]) {
    const s = bySym.get(p.symbol);
    if (!s) continue;
    const win = s.candles.filter((c) => c.t >= since && c.t >= p.openedAt - 60_000);
    const hit: Hit = { low: Math.min(s.price, ...win.map((c) => c.l)), high: Math.max(s.price, ...win.map((c) => c.h)) };
    const R = p.risk ?? p.avgPrice * MIN_STOP;
    const pnl = s.price / p.avgPrice - 1;
    let reason = '';
    let fill = s.price;

    if (!sameDay(p.openedAt, Date.now())) reason = `Day-Trading hält nichts über Nacht – Position vom Vortag wird geschlossen (${fmtPct(pnl, 2)}).`;
    else if (p.stop != null && hit.low <= p.stop) {
      fill = Math.min(p.stop, s.price);
      reason = `Stop-Loss ${p.stop >= p.avgPrice ? '(nachgezogen, Gewinn gesichert)' : 'erreicht – Verlust begrenzt'}: Tiefstkurs der 1-Minuten-Kerzen ${hit.low.toFixed(2)} € ≤ Stop ${p.stop.toFixed(2)} €.`;
    } else if (p.target != null && hit.high >= p.target) {
      fill = p.target;
      reason = `Gewinnziel erreicht: Höchstkurs ${hit.high.toFixed(2)} € ≥ Ziel ${p.target.toFixed(2)} € (${fmtPct(p.target / p.avgPrice - 1, 2)}).`;
    } else if (s.closingSoon) reason = `Börsenschluss naht – Position wird geschlossen (${fmtPct(pnl, 2)}), keine Übernachtrisiken.`;
    else if (s.open && s.trendDown) reason = `Trend gekippt (1-Min.): EMA 9 unter EMA 21 und Kurs unter VWAP ${s.vwap.toFixed(2)} €. Ausstieg bei ${fmtPct(pnl, 2)}.`;

    if (!reason && s.open) {
      // Stop nachziehen: ab +1R auf Einstand, ab +1,5R dem Höchstkurs im Abstand 1R folgen
      if (hit.high - p.avgPrice >= R) p.stop = Math.max(p.stop ?? 0, p.avgPrice);
      if (hit.high - p.avgPrice >= 1.5 * R) p.stop = Math.max(p.stop ?? 0, hit.high - R);
    }
    if (reason && closePosition(b, p, fill, reason)) log.push(`Verkauf ${p.symbol} (${fmtPct(fill / p.avgPrice - 1, 2)})`);
  }

  // ---- Lernen aus den gerade abgeschlossenen Trades ----
  const newClosed = b.trades.slice(0, Math.max(0, b.trades.length - tradesBefore)).filter((t) => t.pnl != null).reverse();
  newClosed.forEach((t) => learnFrom(b, t));

  // ---- Neue Käufe ----
  const strict = strictMode(b);
  const anyOpen = snaps.some((s) => s.open);
  if (!anyOpen) log.push('Börsen aktuell geschlossen – keine neuen Käufe.');
  else if (dayLossLocked(b)) log.push('Tages-Verlustlimit (−1,5 %) erreicht – heute keine neuen Trades.');
  else if (badHour(b)) log.push('Diese Handelsstunde war bisher schlecht – keine neuen Käufe.');
  else {
    const minRsi = strict ? 55 : 52;
    const maxRsi = strict ? 68 : 72;
    const minMom = strict ? 0.0015 : 0.0005;
    const candidates = snaps
      .filter((s) => s.open && !s.closingSoon && !isBanned(b, s.symbol))
      .filter((s) => s.trendUp && s.rsi >= minRsi && s.rsi <= maxRsi && s.dayChg > 0.002 && s.mom10 > minMom && (!strict || s.volSpike > 1))
      .filter((s) => !b.positions.some((p) => p.symbol === s.symbol))
      .map((s) => ({ s, score: (s.dayChg + s.mom10 * 3 + s.mom30 + Math.min(s.volSpike, 3) * 0.002) * symbolWeight(b, s.symbol) }))
      .sort((a, c) => c.score - a.score);
    let bought = 0;
    const limit = strict ? 3 : MAX_POSITIONS;
    for (const { s } of candidates) {
      if (b.positions.length >= limit || bought >= 2) break;
      const w = symbolWeight(b, s.symbol);
      const amount = Math.min(equityOf(b) * POSITION_SHARE * (strict ? 0.5 : 1) * Math.min(w, 1), b.cash);
      const stopPct = Math.min(MAX_STOP, Math.max(MIN_STOP, s.atrPct * 6));
      const exp = learnNote(b, s.symbol, w, strict);
      const reason =
        `1-Minuten-Aufwärtstrend: EMA 9 über EMA 21 (steigend), Kurs ${s.price.toFixed(2)} € über VWAP ${s.vwap.toFixed(2)} €, ` +
        `Tagesplus ${fmtPct(s.dayChg, 2)}, 10-Min-Momentum ${fmtPct(s.mom10, 2)}, RSI ${s.rsi.toFixed(0)}, Volumen ×${s.volSpike.toFixed(1).replace('.', ',')} des Schnitts. ` +
        `Stop-Loss ${fmtPct(-stopPct, 2, false)} (2 × Minuten-Schwankung), Ziel ${fmtPct(stopPct * RR, 2)}.${exp}`;
      if (buy(b, s.symbol, s.name, s.price, amount, reason)) {
        const p = b.positions.find((x) => x.symbol === s.symbol)!;
        p.risk = s.price * stopPct;
        p.stop = s.price * (1 - stopPct);
        p.target = s.price * (1 + stopPct * RR);
        bought++;
        log.push(`Kauf ${s.symbol}`);
      }
    }
    if (strict) log.push('Strenger Modus aktiv (viele Verluste zuletzt)');
  }

  finish(b, log.length ? log.join(', ') : 'Keine Handelssignale.');
  return b;
}

function learnNote(b: BotState, symbol: string, w: number, strict: boolean): string {
  const s = b.learn?.symbols[symbol];
  const parts: string[] = [];
  if (s && s.n >= 3) parts.push(`Erfahrung mit ${symbol}: ${s.w} von ${s.n} Trades im Plus${w < 1 ? ', daher kleinere Position' : w > 1 ? ', daher höheres Gewicht' : ''}`);
  if (strict) parts.push('Strenger Modus nach Verlustserie: höhere Hürden, halbe Positionsgröße');
  return parts.length ? ` Gelernt: ${parts.join('; ')}.` : '';
}
