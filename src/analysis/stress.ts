import { getChart, pool } from '../api/yahoo';
import { BotState } from '../types';
import { equityOf, isShort } from '../bots/sim';

export const CRASHES = [
  { key: 'dip', name: 'Normale Korrektur', spx: -0.1, info: 'passiert fast jedes Jahr' },
  { key: 'y22', name: 'Zinswende 2022', spx: -0.25, info: 'S&P 500 Jan–Okt 2022' },
  { key: 'covid', name: 'Corona-Crash 2020', spx: -0.34, info: 'S&P 500 in 33 Tagen' },
  { key: 'gfc', name: 'Finanzkrise 2008/09', spx: -0.55, info: 'S&P 500 Okt 2007–Mär 2009' },
  { key: 'dotcom', name: 'Dotcom-Crash 2000–02', spx: -0.49, info: 'S&P 500 über 2,5 Jahre' },
];

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Beta = wie stark eine Aktie die Bewegungen des S&P 500 mitmacht (1 = gleich stark). Aus 2 Jahren Tagesrenditen. */
export async function betas(symbols: string[]): Promise<Record<string, number>> {
  const spx = await getChart('^GSPC', '2y', '1d', 600_000);
  const sm = new Map<string, number>();
  for (let i = 1; i < spx.candles.length; i++) sm.set(dayKey(spx.candles[i].t), spx.candles[i].c / spx.candles[i - 1].c - 1);
  const res = await pool(symbols, 4, async (s) => {
    const d = await getChart(s, '2y', '1d', 600_000);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 1; i < d.candles.length; i++) {
      const m = sm.get(dayKey(d.candles[i].t));
      if (m != null) {
        xs.push(m);
        ys.push(d.candles[i].c / d.candles[i - 1].c - 1);
      }
    }
    if (xs.length < 60) return [s, 1] as const;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let cov = 0;
    let varx = 0;
    xs.forEach((x, i) => {
      cov += (x - mx) * (ys[i] - my);
      varx += (x - mx) ** 2;
    });
    return [s, Math.max(-1, Math.min(3, cov / varx))] as const;
  });
  const out: Record<string, number> = {};
  res.forEach((r, i) => (out[symbols[i]] = r ? r[1] : 1));
  return out;
}

/** Geschätzter Verlust des Depots bei einem Marktrückgang (Beta-Näherung) */
export function stressLoss(b: BotState, beta: Record<string, number>, spxMove: number) {
  const eq = equityOf(b);
  let loss = 0;
  let wBeta = 0;
  b.positions.forEach((p) => {
    const v = p.qty * p.lastPrice;
    const dir = isShort(p) ? -1 : 1;
    const bt = beta[p.symbol] ?? 1;
    loss += dir * v * bt * spxMove;
    wBeta += (dir * v * bt) / eq;
  });
  return { loss, pct: eq > 0 ? loss / eq : 0, portfolioBeta: wBeta };
}
