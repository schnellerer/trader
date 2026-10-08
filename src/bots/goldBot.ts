import { getChart, toEur } from '../api/yahoo';
import { atrAt, ema, rsiAt } from '../analysis/indicators';
import { fmtNum, fmtPct } from '../format';
import { BotState, Candle } from '../types';
import { buy, clone, closePosition, equityOf, finish, isShort, openShort, posPct } from './sim';

export const GOLD_SYMBOL = 'GC=F'; // Gold-Future (COMEX), folgt dem XAU/USD-Spotpreis eng
const NAME = 'Gold (XAU/USD)';
export const GOLD = {
  FEE: 0.0002, // 0,02 % pro Order (Gold-CFD-typische Kosten)
  RISK_PER_TRADE: 0.01, // 1 % des Depots riskiert pro Trade
  STOP_ATR: 2.5,
  TARGET_ATR: 5, // Chance-Risiko-Verhältnis 2:1
  LOOKBACK: 144, // Ausbruchs-Fenster: 144 × 5 Minuten = 12 Stunden
  MAX_HOLD_BARS: 96, // 8 Stunden bei 5-Minuten-Kerzen
  COOLDOWN_MS: 30 * 60_000,
};

export interface GoldSeries {
  cs: Candle[];
  closes: number[];
  e20: number[];
  e50: number[];
  e200: number[];
}

export const goldSeries = (cs: Candle[]): GoldSeries => {
  const closes = cs.map((c) => c.c);
  return { cs, closes, e20: ema(closes, 20), e50: ema(closes, 50), e200: ema(closes, 200) };
};

export interface GoldSignal {
  dir: 1 | -1;
  kind: 'breakout' | 'pullback' | 'range';
  level?: number; // Ausbruchs-Niveau (USD)
  rsi: number;
  atr: number; // USD
}

/**
 * Einstiegssignal an Kerze n – nur Daten bis n (kein Blick in die Zukunft).
 * Breakout-Strategie: Ausbruch über das 12-Stunden-Hoch (Long) bzw. unter das 12-Stunden-Tief (Short)
 * in Richtung des Haupttrends (EMA 20 > 50 > 200 bzw. umgekehrt), nur in den Haupt-Handelszeiten (7–20 Uhr UTC).
 *
 * Warum nur noch das? Der Backtest (siehe Tab „Beweis") hat gezeigt: Pullback- und Range-Signale verlieren auf
 * 5-Minuten- und Stundenkerzen dauerhaft Geld, der längere Breakout in der Handelszeit liegt etwa bei ±0 %.
 */
export function goldEntry(g: GoldSeries, n: number): GoldSignal | null {
  const { cs, closes, e20, e50, e200 } = g;
  if (n < 260) return null;
  const hour = new Date(cs[n].t).getUTCHours();
  if (hour < 7 || hour > 20) return null;
  const a = atrAt(cs, n, 14);
  const r = rsiAt(closes, n, 14);
  if (!isFinite(a) || !isFinite(r) || a <= 0) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let k = n - GOLD.LOOKBACK; k < n; k++) {
    if (cs[k].h > hh) hh = cs[k].h;
    if (cs[k].l < ll) ll = cs[k].l;
  }
  const last = cs[n];
  const upTrend = e20[n] > e50[n] && e50[n] > e200[n];
  const downTrend = e20[n] < e50[n] && e50[n] < e200[n];
  if (upTrend && last.c > hh && r < 78) return { dir: 1, kind: 'breakout', level: hh, rsi: r, atr: a };
  if (downTrend && last.c < ll && r > 22) return { dir: -1, kind: 'breakout', level: ll, rsi: r, atr: a };
  return null;
}

/**
 * Ein Durchgang des Gold-Bots auf 5-Minuten-Kerzen.
 * Risiko: Stop-Loss 2,5 × ATR, Ziel 5 × ATR, Positionsgröße so, dass max. 1 % des Depots riskiert wird, kein Hebel.
 * Ausstieg zusätzlich bei Trendwechsel (EMA-Kreuzung) oder nach 8 Stunden.
 */
export async function stepGoldBot(prev: BotState): Promise<BotState> {
  const d = await getChart(GOLD_SYMBOL, '10d', '5m', 0);
  const cs = d.candles;
  if (cs.length < 220) throw new Error('Zu wenig Gold-Kursdaten');
  const b: BotState = clone(prev);
  const last = cs[cs.length - 1];
  const open = Date.now() - last.t < 20 * 60_000;
  const fx = await toEur(1, 'USD');
  const price = d.meta.price * fx;

  const pos = b.positions[0];
  if (pos) pos.lastPrice = price;

  if (!open) {
    finish(b, 'Gold-Markt aktuell geschlossen – keine Handelsentscheidung.');
    return b;
  }

  const g = goldSeries(cs);
  const n = cs.length - 1;
  const sig = goldEntry(g, n);
  const a = sig?.atr ?? atrAt(cs, n, 14);
  const aEur = a * fx;
  const log: string[] = [];

  // ---- Position verwalten ----
  if (pos) {
    const dir = isShort(pos) ? -1 : 1;
    const profit = (price - pos.avgPrice) * dir;
    const R = pos.risk ?? aEur * GOLD.STOP_ATR;
    // Stop nachziehen: ab +1R auf Einstand, ab +1,5R dem Kurs im Abstand 1R folgen
    if (profit >= R) pos.stop = dir === 1 ? Math.max(pos.stop ?? -Infinity, pos.avgPrice) : Math.min(pos.stop ?? Infinity, pos.avgPrice);
    if (profit >= 1.5 * R) pos.stop = dir === 1 ? Math.max(pos.stop ?? -Infinity, price - R) : Math.min(pos.stop ?? Infinity, price + R);

    const pct = posPct(pos);
    const side = dir === 1 ? 'Long' : 'Short';
    let reason = '';
    if (pos.stop != null && (dir === 1 ? price <= pos.stop : price >= pos.stop))
      reason = `Stop-Loss/Trailing-Stop bei ${fmtNum(pos.stop)} € erreicht (${side} ${fmtPct(pct, 2)}).${profit > 0 ? ' Gewinn durch nachgezogenen Stop gesichert.' : ' Verlust begrenzt.'}`;
    else if (pos.target != null && (dir === 1 ? price >= pos.target : price <= pos.target))
      reason = `Gewinnziel bei ${fmtNum(pos.target)} € erreicht (${side} ${fmtPct(pct, 2)}, 2:1 Chance-Risiko).`;
    else if ((dir === 1 && g.e20[n] < g.e50[n]) || (dir === -1 && g.e20[n] > g.e50[n]))
      reason = `Trendwechsel: EMA 20 kreuzt EMA 50 gegen die ${side}-Position. Ausstieg bei ${fmtPct(pct, 2)}.`;
    else if (Date.now() - pos.openedAt > GOLD.MAX_HOLD_BARS * 5 * 60_000)
      reason = `Zeitstopp: Position länger als 8 Stunden offen (${fmtPct(pct, 2)}). Kapital wird freigegeben.`;
    if (reason && closePosition(b, pos, price, reason, GOLD.FEE)) log.push(`${side} geschlossen`);
  }

  // ---- Neue Position suchen ----
  if (b.positions.length === 0) {
    const lastClose = b.trades.find((t) => t.pnl != null);
    const cooling = lastClose && Date.now() - lastClose.t < GOLD.COOLDOWN_MS;
    if (cooling) log.push('Abkühlphase nach letztem Trade');
    else if (sig) {
      const dir = sig.dir;
      const rs = sig.rsi.toFixed(0);
      let why =
        dir === 1
          ? `Breakout-Strategie (Long): Kurs bricht über das 12-Stunden-Hoch (${fmtNum(sig.level! * fx)} €) im Aufwärtstrend (EMA 20 > 50 > 200), RSI ${rs}, Haupt-Handelszeit.`
          : `Breakout-Strategie (Short): Kurs bricht unter das 12-Stunden-Tief (${fmtNum(sig.level! * fx)} €) im Abwärtstrend (EMA 20 < 50 < 200), RSI ${rs}, Haupt-Handelszeit.`;
      const stopDist = GOLD.STOP_ATR * aEur;
      const eq = equityOf(b);
      const qty = Math.min((eq * GOLD.RISK_PER_TRADE) / stopDist, (eq * 0.95) / price);
      const amount = qty * price;
      why += ` Stop-Loss ${fmtNum(price - dir * stopDist)} €, Ziel ${fmtNum(price + dir * GOLD.TARGET_ATR * aEur)} €, Risiko ${fmtPct(GOLD.RISK_PER_TRADE, 0, false)} des Depots, ATR ${fmtNum(aEur)} €.`;
      const ok = dir === 1 ? buy(b, GOLD_SYMBOL, NAME, price, amount, why, GOLD.FEE) : openShort(b, GOLD_SYMBOL, NAME, price, amount, why, GOLD.FEE);
      if (ok) {
        const p = b.positions[0];
        p.stop = price - dir * stopDist;
        p.target = price + dir * GOLD.TARGET_ATR * aEur;
        p.risk = stopDist;
        log.push(dir === 1 ? 'Long eröffnet' : 'Short eröffnet');
      }
    }
  }

  finish(b, log.length ? log.join(', ') : 'Kein Signal – Bot wartet.');
  return b;
}
