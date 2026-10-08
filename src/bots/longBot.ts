import { getChart, toEur } from '../api/yahoo';
import { biasLabel } from '../analysis/model';
import { fmtPct } from '../format';
import { BotState, RankItem } from '../types';
import { BotCtx, daysToEarnings, earningsImminent } from './ctx';
import { buy, clone, equityOf, finish, sell } from './sim';

const TARGET_POSITIONS = 8;
const STOP_LOSS = -0.15;
const TAKE_PROFIT = 0.6;
const MIN_HOLD_DAYS = 5;

/** Ein Durchgang des Langzeit-Bots auf Basis des Rankings (Preise bereits in EUR). Läuft auf dem GitHub-Server. */
export async function stepLongBot(prev: BotState, ranking: RankItem[], ctx?: BotCtx): Promise<BotState> {
  const bySym = new Map(ranking.map((r, i) => [r.symbol, { r, rank: i + 1 }]));
  const b: BotState = clone(prev);
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
    if (earningsImminent(ctx, p.symbol))
      reason = `Quartalszahlen stehen unmittelbar an (${ctx!.earnings![p.symbol]}) – Kurse springen dabei oft stark. Position wird vorher geschlossen (${fmtPct(pnl)}).`;
    else if (pnl <= STOP_LOSS) reason = `Stop-Loss: ${fmtPct(pnl)} Verlust (Grenze ${fmtPct(STOP_LOSS, 0)}). Kapital wird geschützt.`;
    else if (pnl >= TAKE_PROFIT) reason = `Gewinn mitgenommen: ${fmtPct(pnl)} (Ziel ${fmtPct(TAKE_PROFIT, 0)}).`;
    else if (heldDays >= MIN_HOLD_DAYS && x.r.score <= -1)
      reason = `Trend hat gedreht: Einstufung ${biasLabel(x.r.bias)} (Score ${x.r.score}). Ausstieg bei ${fmtPct(pnl)}.`;
    else if (heldDays >= MIN_HOLD_DAYS && x.r.rs != null && x.r.rs < 50)
      reason = `Momentum erlahmt: Relative Stärke nur noch ${x.r.rs}/99 (unter dem Mittelfeld). Kapital wird in stärkere Aktien umgeschichtet (${fmtPct(pnl)}).`;
    if (reason && sell(b, p.symbol, x.r.price, reason)) log.push(`Verkauf ${p.symbol}`);
  }

  // Käufe nach der im Backtest besten Regel „Momentum mit Trendfilter": Aus den Aktien im Aufwärtstrend die mit der
  // höchsten Relative Stärke. Die Marktampel wird bewusst nur angezeigt, nicht als Bremse genutzt (hat im Backtest geschadet).
  const regime = ctx?.regime?.state;
  const maxPositions = TARGET_POSITIONS;
  {
    const picks = ranking
      .map((r, i) => ({ r, rank: i + 1 }))
      // Nur gut handelbare Werte (Tagesumsatz > 10 Mio.): Small/Micro-Caps sind zu illiquid und kursspringend für den Bot
      .filter(({ r }) => r.score >= 1 && r.aboveSma200 && r.vol < 0.6 && r.liq !== 'micro' && r.liq !== 'small')
      .filter(({ r }) => r.rs == null || r.rs >= 70)
      .sort((a, b) => (b.r.rs ?? 0) - (a.r.rs ?? 0) || a.rank - b.rank)
      // keine Käufe kurz vor Quartalszahlen (Termin in den nächsten 7 Tagen)
      .filter(({ r }) => {
        const d = daysToEarnings(ctx, r.symbol);
        return d == null || d > 7 || d < -1;
      })
      .filter(({ r }) => !b.positions.some((p) => p.symbol === r.symbol))
      .slice(0, 12);
    for (const { r, rank } of picks) {
      if (b.positions.length >= maxPositions) break;
      const amount = Math.min(equityOf(b) / maxPositions, b.cash);
      const reason =
        `Momentum-Strategie mit Trendfilter: Relative Stärke ${r.rs != null ? `${r.rs}/99` : 'hoch'} (stärker als ${r.rs ?? '?'} % aller ausgewerteten Aktien), ` +
        `Einstufung ${biasLabel(r.bias)} (Score ${r.score}), Kurs über 200-Tage-Linie, Schwankung ${(r.vol * 100).toFixed(0)} %, Platz ${rank} im Ranking. ` +
        `Marktampel ${regime === 'green' ? 'grün' : regime === 'yellow' ? 'gelb' : regime === 'red' ? 'rot (nur Hinweis)' : 'unbekannt'}, keine Quartalszahlen in den nächsten 7 Tagen. ` +
        `Gleichgewichtete Streuung auf ${maxPositions} Positionen. Haltedauer mindestens ${MIN_HOLD_DAYS} Tage.`;
      if (buy(b, r.symbol, r.name, r.price, amount, reason)) log.push(`Kauf ${r.symbol}`);
    }
  }

  finish(b, log.length ? log.join(', ') : 'Keine Änderung – Portfolio bleibt bestehen.');
  return b;
}
