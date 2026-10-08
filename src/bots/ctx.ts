import { Regime } from '../analysis/regime';

/** Zusatzwissen, das der Server den Bots mitgibt (Marktampel, Quartalszahlen-Termine) */
export interface BotCtx {
  regime?: Regime;
  earnings?: Record<string, string>; // Symbol → Termin (YYYY-MM-DD)
}

/** Tage bis zu den nächsten Quartalszahlen (null = unbekannt/keine in den nächsten 2 Wochen). Negativ = gestern/heute schon gemeldet. */
export function daysToEarnings(ctx: BotCtx | undefined, symbol: string, now = Date.now()): number | null {
  const d = ctx?.earnings?.[symbol];
  if (!d) return null;
  return (Date.parse(`${d}T21:00:00Z`) - now) / 86400_000;
}

/** Quartalszahlen heute nach Börsenschluss oder morgen früh → Kurssprung-Risiko */
export const earningsImminent = (ctx: BotCtx | undefined, symbol: string, now = Date.now()) => {
  const d = daysToEarnings(ctx, symbol, now);
  return d != null && d > -0.9 && d < 1.6;
};
