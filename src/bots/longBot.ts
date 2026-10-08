import { getChart, toEur } from '../api/yahoo';
import { getRanking } from '../analysis/ranking';
import { biasLabel } from '../analysis/model';
import { fmtPct } from '../format';
import { getState, setState } from '../store';
import { BotState } from '../types';
import { buy, clone, equityOf, finish, sell } from './sim';

const TARGET_POSITIONS = 8;
const STOP_LOSS = -0.15;
const TAKE_PROFIT = 0.6;
const MIN_HOLD_DAYS = 5;

export async function runLongBot(): Promise<string> {
  const ranking = await getRanking();
  const bySym = new Map(ranking.map((r, i) => [r.symbol, { r, rank: i + 1 }]));
  const b: BotState = clone(getState().long);
  const log: string[] = [];

  b.positions.forEach((p) => {
    const x = bySym.get(p.symbol);
    if (x) p.lastPrice = x.r.price;
  });

  // Positionen, die nicht mehr in der Bestenliste stehen: Kurs einzeln holen
  const dropped = new Map<string, number>();
  for (const p of b.positions) {
    if (bySym.has(p.symbol)) continue;
    try {
      const d = await getChart(p.symbol, '5d', '1d', 0);
      p.lastPrice = await toEur(d.meta.price, d.meta.currency);
      dropped.set(p.symbol, p.lastPrice);
    } catch {}
  }

  // Verkäufe
  for (const p of [...b.positions]) {
    const x = bySym.get(p.symbol);
    if (!x) {
      const price = dropped.get(p.symbol);
      if (!price) continue;
      const pnl = price / p.avgPrice - 1;
      const heldDays = (Date.now() - p.openedAt) / 86400_000;
      let why = '';
      if (pnl <= STOP_LOSS) why = `Stop-Loss: ${fmtPct(pnl)} Verlust (Grenze ${fmtPct(STOP_LOSS, 0)}). Kapital wird geschützt.`;
      else if (pnl >= TAKE_PROFIT) why = `Gewinn mitgenommen: ${fmtPct(pnl)} (Ziel ${fmtPct(TAKE_PROFIT, 0)}).`;
      else if (heldDays >= MIN_HOLD_DAYS) why = `Nicht mehr unter den bestbewerteten Aktien des Rankings. Umschichtung bei ${fmtPct(pnl)}.`;
      if (why && sell(b, p.symbol, price, why)) log.push(`Verkauf ${p.symbol}`);
      continue;
    }
    const pnl = x.r.price / p.avgPrice - 1;
    const heldDays = (Date.now() - p.openedAt) / 86400_000;
    let reason = '';
    if (pnl <= STOP_LOSS) reason = `Stop-Loss: ${fmtPct(pnl)} Verlust (Grenze ${fmtPct(STOP_LOSS, 0)}). Kapital wird geschützt.`;
    else if (pnl >= TAKE_PROFIT) reason = `Gewinn mitgenommen: ${fmtPct(pnl)} (Ziel ${fmtPct(TAKE_PROFIT, 0)}).`;
    else if (heldDays >= MIN_HOLD_DAYS && x.r.score <= -1)
      reason = `Trend hat gedreht: Einstufung ${biasLabel(x.r.bias)} (Score ${x.r.score}). Ausstieg bei ${fmtPct(pnl)}.`;
    else if (heldDays >= MIN_HOLD_DAYS && x.rank > 20)
      reason = `Aus den besten 20 des Rankings gefallen (jetzt Platz ${x.rank}). Kapital wird in stärkere Aktien umgeschichtet (${fmtPct(pnl)}).`;
    if (reason && sell(b, p.symbol, x.r.price, reason)) log.push(`Verkauf ${p.symbol}`);
  }

  // Käufe: beste Aktien des Rankings mit Aufwärtstrend und moderater Schwankung
  const picks = ranking
    .map((r, i) => ({ r, rank: i + 1 }))
    // Micro-Caps (<1 Mio. $ Tagesumsatz) sind zu illiquid für den Bot
    .filter(({ r }) => r.score >= 1 && r.aboveSma200 && r.vol < 0.6 && r.liq !== 'micro')
    .filter(({ r }) => !b.positions.some((p) => p.symbol === r.symbol))
    .slice(0, 12);
  for (const { r, rank } of picks) {
    if (b.positions.length >= TARGET_POSITIONS) break;
    const amount = Math.min(equityOf(b) / TARGET_POSITIONS, b.cash);
    const reason =
      `Platz ${rank} im Ranking: erwartete 12M-Rendite ${fmtPct(r.expected)} bei ${(r.vol * 100).toFixed(0)} % Schwankung, ` +
      `Einstufung ${biasLabel(r.bias)} (Score ${r.score}), Kurs über 200-Tage-Linie. ` +
      `Gleichgewichtete Streuung auf ${TARGET_POSITIONS} Positionen. Haltedauer mindestens ${MIN_HOLD_DAYS} Tage.`;
    if (buy(b, r.symbol, r.name, r.price, amount, reason)) log.push(`Kauf ${r.symbol}`);
  }

  finish(b, log.length ? log.join(', ') : 'Keine Änderung – Portfolio bleibt bestehen.');
  setState(() => ({ long: b }));
  return b.lastLog;
}
