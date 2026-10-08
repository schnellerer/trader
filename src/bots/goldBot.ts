import { getChart, toEur } from '../api/yahoo';
import { atr, ema, rsi } from '../analysis/indicators';
import { fmtNum, fmtPct } from '../format';
import { BotState } from '../types';
import { buy, clone, closePosition, equityOf, finish, isShort, openShort, posPct } from './sim';

export const GOLD_SYMBOL = 'GC=F'; // Gold-Future (COMEX), folgt dem XAU/USD-Spotpreis eng
const NAME = 'Gold (XAU/USD)';
const FEE = 0.0002; // 0,02 % pro Order (Gold-CFD-typische Kosten)
const RISK_PER_TRADE = 0.01; // 1 % des Depots riskiert pro Trade
const STOP_ATR = 2.5;
const TARGET_ATR = 5; // Chance-Risiko-Verhältnis 2:1
const MAX_HOLD_MS = 8 * 3600_000;
const COOLDOWN_MS = 30 * 60_000;

/**
 * Ein Durchgang des Gold-Bots auf 5-Minuten-Kerzen. Klassische Strategien:
 *  - Breakout:  Ausbruch über das 3-Stunden-Hoch / unter das 3-Stunden-Tief in Richtung des Haupttrends (EMA 200)
 *  - Pullback:  Rücksetzer an die EMA 20 im intakten Trend (EMA 20 > EMA 50 > EMA 200 bzw. umgekehrt)
 *  - Range:     Mean-Reversion bei RSI-Extremen, wenn der Markt seitwärts läuft
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

  const closes = cs.map((c) => c.c);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const n = closes.length - 1;
  const a = atr(cs, 14);
  const r = rsi(closes, 14);
  const prior = cs.slice(n - 36, n);
  const hh = Math.max(...prior.map((c) => c.h));
  const ll = Math.min(...prior.map((c) => c.l));
  const upTrend = e20[n] > e50[n] && e50[n] > e200[n];
  const downTrend = e20[n] < e50[n] && e50[n] < e200[n];
  const ranging = Math.abs(e20[n] - e50[n]) < 0.5 * a;
  const aEur = a * fx;
  const log: string[] = [];

  // ---- Position verwalten ----
  if (pos) {
    const dir = isShort(pos) ? -1 : 1;
    const profit = (price - pos.avgPrice) * dir;
    const R = pos.risk ?? aEur * STOP_ATR;
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
    else if ((dir === 1 && e20[n] < e50[n]) || (dir === -1 && e20[n] > e50[n]))
      reason = `Trendwechsel: EMA 20 kreuzt EMA 50 gegen die ${side}-Position. Ausstieg bei ${fmtPct(pct, 2)}.`;
    else if (Date.now() - pos.openedAt > MAX_HOLD_MS) reason = `Zeitstopp: Position länger als 8 Stunden offen (${fmtPct(pct, 2)}). Kapital wird freigegeben.`;
    if (reason && closePosition(b, pos, price, reason, FEE)) log.push(`${side} geschlossen`);
  }

  // ---- Neue Position suchen ----
  if (b.positions.length === 0) {
    const lastClose = b.trades.find((t) => t.pnl != null);
    const cooling = lastClose && Date.now() - lastClose.t < COOLDOWN_MS;
    if (cooling) log.push('Abkühlphase nach letztem Trade');
    else {
      let dir: 1 | -1 | 0 = 0;
      let why = '';
      const rs = r.toFixed(0);
      if (upTrend && last.c > hh && r < 78) {
        dir = 1;
        why = `Breakout-Strategie (Long): Kurs bricht über das 3-Stunden-Hoch (${fmtNum(hh * fx)} €) im Aufwärtstrend (EMA 20 > 50 > 200), RSI ${rs}.`;
      } else if (downTrend && last.c < ll && r > 22) {
        dir = -1;
        why = `Breakout-Strategie (Short): Kurs bricht unter das 3-Stunden-Tief (${fmtNum(ll * fx)} €) im Abwärtstrend (EMA 20 < 50 < 200), RSI ${rs}.`;
      } else if (upTrend && Math.abs(last.c - e20[n]) <= 0.7 * a && last.c > e50[n] && r >= 40 && r <= 60 && last.c > cs[n - 1].c) {
        dir = 1;
        why = `Pullback-Strategie (Long): Rücksetzer an die EMA 20 im intakten Aufwärtstrend, RSI ${rs} (neutral), erste Aufwärtskerze nach dem Rücksetzer.`;
      } else if (downTrend && Math.abs(last.c - e20[n]) <= 0.7 * a && last.c < e50[n] && r >= 40 && r <= 60 && last.c < cs[n - 1].c) {
        dir = -1;
        why = `Pullback-Strategie (Short): Erholung an die EMA 20 im intakten Abwärtstrend, RSI ${rs} (neutral), erste Abwärtskerze nach der Erholung.`;
      } else if (ranging && r < 25) {
        dir = 1;
        why = `Range-Strategie (Long): Seitwärtsmarkt (EMA 20 ≈ EMA 50), RSI ${rs} stark überverkauft – Rückkehr zur Mitte erwartet.`;
      } else if (ranging && r > 75) {
        dir = -1;
        why = `Range-Strategie (Short): Seitwärtsmarkt (EMA 20 ≈ EMA 50), RSI ${rs} stark überkauft – Rückkehr zur Mitte erwartet.`;
      }
      if (dir !== 0) {
        const stopDist = STOP_ATR * aEur;
        const eq = equityOf(b);
        const qty = Math.min((eq * RISK_PER_TRADE) / stopDist, (eq * 0.95) / price);
        const amount = qty * price;
        why += ` Stop-Loss ${fmtNum(price - dir * stopDist)} €, Ziel ${fmtNum(price + dir * TARGET_ATR * aEur)} €, Risiko ${fmtPct(RISK_PER_TRADE, 0, false)} des Depots, ATR ${fmtNum(aEur)} €.`;
        const ok = dir === 1 ? buy(b, GOLD_SYMBOL, NAME, price, amount, why, FEE) : openShort(b, GOLD_SYMBOL, NAME, price, amount, why, FEE);
        if (ok) {
          const p = b.positions[0];
          p.stop = price - dir * stopDist;
          p.target = price + dir * TARGET_ATR * aEur;
          p.risk = stopDist;
          log.push(dir === 1 ? 'Long eröffnet' : 'Short eröffnet');
        }
      }
    }
  }

  finish(b, log.length ? log.join(', ') : 'Kein Signal – Bot wartet.');
  return b;
}
