import { History, idxAt, Series } from './history';
import { mean, pctChange, rsiAt, stdev } from './indicators';

/** Eine selbst gebaute Handelsregel – wird wöchentlich auf die 44 Aktien des Universums angewendet */
export interface Rule {
  minRs: number; // Relative Stärke mindestens (0 = aus)
  minRsi: number; // RSI mindestens
  maxRsi: number; // RSI höchstens (100 = aus)
  uptrend: boolean; // nur über der 200-Tage-Linie
  nearHigh: number | null; // höchstens x % unter dem 52-Wochen-Hoch (null = aus)
  maxVol: number; // Schwankung p.a. höchstens (1 = aus)
  positions: number; // maximale Anzahl Positionen
  stopLoss: number | null; // z. B. 0.08 = −8 %
  takeProfit: number | null; // z. B. 0.3 = +30 %
  holdWeeks: number; // maximale Haltedauer in Wochen (0 = unbegrenzt)
  exitOnFail: boolean; // verkaufen, wenn Trend- oder Stärke-Bedingung nicht mehr gilt
  marketFilter: boolean; // keine Käufe, wenn der S&P 500 unter seiner 200-Tage-Linie liegt
}

export const FEE = 0.0005;
const WEEK = 5; // Handelstage

export const PRESET_RULES: { key: string; name: string; desc: string; rule: Rule }[] = [
  {
    key: 'momentum',
    name: 'Momentum (wie Langzeit-Bot)',
    desc: 'Starke Aktien im Aufwärtstrend, 8 Positionen, Stop −15 %.',
    rule: { minRs: 70, minRsi: 0, maxRsi: 100, uptrend: true, nearHigh: null, maxVol: 0.6, positions: 8, stopLoss: 0.15, takeProfit: null, holdWeeks: 0, exitOnFail: true, marketFilter: false },
  },
  {
    key: 'breakout',
    name: 'Ausbruch',
    desc: 'Nahe am 52-Wochen-Hoch, starke Relative Stärke, enger Stop.',
    rule: { minRs: 80, minRsi: 50, maxRsi: 100, uptrend: true, nearHigh: 0.03, maxVol: 0.6, positions: 6, stopLoss: 0.08, takeProfit: null, holdWeeks: 0, exitOnFail: true, marketFilter: false },
  },
  {
    key: 'dip',
    name: 'Rücksetzer kaufen',
    desc: 'Überverkaufte Aktien (RSI ≤ 35) im Aufwärtstrend, schneller Gewinnmitnahme.',
    rule: { minRs: 40, minRsi: 0, maxRsi: 35, uptrend: true, nearHigh: null, maxVol: 0.6, positions: 8, stopLoss: 0.08, takeProfit: 0.12, holdWeeks: 8, exitOnFail: false, marketFilter: false },
  },
  {
    key: 'defensive',
    name: 'Defensiv',
    desc: 'Ruhige Aktien mit Trend, Marktfilter an, enge Verlustbegrenzung.',
    rule: { minRs: 50, minRsi: 0, maxRsi: 100, uptrend: true, nearHigh: null, maxVol: 0.3, positions: 10, stopLoss: 0.08, takeProfit: null, holdWeeks: 0, exitOnFail: true, marketFilter: true },
  },
];

interface Feat {
  rs: number;
  rsi: number;
  up: boolean;
  hiDist: number;
  vol: number;
}

function momentum(c: number[], j: number): number {
  const p = c[j];
  return 0.4 * (p / c[j - 63] - 1) + 0.2 * (p / c[j - 126] - 1) + 0.2 * (p / c[j - 189] - 1) + 0.2 * (p / c[j - 251] - 1);
}

export interface RuleResult {
  equity: [number, number][]; // wöchentlich, normiert auf 1
  spx: [number, number][]; // S&P 500 im selben Zeitraum, normiert
  ew: [number, number][]; // gleichgewichtetes Universum
  totalReturn: number;
  cagr: number;
  maxDD: number;
  sharpe: number;
  trades: number;
  winRate: number;
  avgHoldWeeks: number;
  invested: number; // durchschnittlicher Investitionsgrad
  halves: { first: number; second: number; firstSpx: number; secondSpx: number };
  years: number;
  from: number;
  to: number;
}

/** Führt die Regel wöchentlich über [startIdx, endIdx] des S&P-500-Index aus */
export function runRule(rule: Rule, h: History, startIdx?: number, endIdx?: number): RuleResult {
  const { spx, stocks } = h;
  const syms = [...stocks.keys()];
  const start = Math.max(startIdx ?? 260, 260);
  const end = Math.min(endIdx ?? spx.t.length - 1, spx.t.length - 1);
  const steps: number[] = [];
  for (let i = start; i <= end; i += WEEK) steps.push(i);
  if (steps.length < 10) throw new Error('Zeitraum zu kurz');

  let cash = 1;
  const pos = new Map<string, { w: number; entry: number; weeks: number }>(); // w = Wert in Einheiten des Depots
  const eq: [number, number][] = [[spx.t[steps[0]], 1]];
  const spxEq: [number, number][] = [[spx.t[steps[0]], 1]];
  const ewEq: [number, number][] = [[spx.t[steps[0]], 1]];
  let ewV = 1;
  const closedRets: number[] = [];
  const holds: number[] = [];
  let investedSum = 0;
  let prevIdx: Record<string, number> = {};

  const at = (s: Series, t: number) => idxAt(s, t);

  steps.forEach((si, step) => {
    const t = spx.t[si];
    const j: Record<string, number> = {};
    syms.forEach((sy) => (j[sy] = at(stocks.get(sy)!, t)));

    // 1) Positionen mit den Kursbewegungen seit letzter Woche fortschreiben
    if (step > 0) {
      let ewR: number[] = [];
      syms.forEach((sy) => {
        const s = stocks.get(sy)!;
        if (j[sy] >= 0 && prevIdx[sy] >= 0) ewR.push(s.c[j[sy]] / s.c[prevIdx[sy]] - 1);
      });
      ewV *= 1 + mean(ewR);
      pos.forEach((p, sy) => {
        const s = stocks.get(sy)!;
        p.w *= s.c[j[sy]] / s.c[prevIdx[sy]];
        p.weeks++;
      });
    }
    prevIdx = j;

    // 2) Merkmale aller Aktien berechnen
    const feats = new Map<string, Feat>();
    const moms: [string, number][] = [];
    syms.forEach((sy) => {
      const s = stocks.get(sy)!;
      const k = j[sy];
      if (k < 252 || t - s.t[k] > 7 * 86400_000) return;
      moms.push([sy, momentum(s.c, k)]);
    });
    moms.sort((a, b) => a[1] - b[1]);
    const rsOf = new Map(moms.map(([sy], i) => [sy, Math.round(((i + 1) / moms.length) * 99)]));
    moms.forEach(([sy]) => {
      const s = stocks.get(sy)!;
      const k = j[sy];
      let s200 = 0;
      for (let m = k - 199; m <= k; m++) s200 += s.c[m];
      s200 /= 200;
      let hi = 0;
      for (let m = k - 251; m <= k; m++) if (s.c[m] > hi) hi = s.c[m];
      const rets: number[] = [];
      for (let m = k - 251; m <= k; m++) rets.push(Math.log(s.c[m] / s.c[m - 1]));
      feats.set(sy, { rs: rsOf.get(sy)!, rsi: rsiAt(s.c, k, 14), up: s.c[k] > s200, hiDist: 1 - s.c[k] / hi, vol: stdev(rets) * Math.sqrt(252) });
    });
    const passes = (f: Feat) =>
      f.rs >= rule.minRs && f.rsi >= rule.minRsi && f.rsi <= rule.maxRsi && (!rule.uptrend || f.up) && (rule.nearHigh == null || f.hiDist <= rule.nearHigh) && f.vol <= rule.maxVol;

    // 3) Verkäufe
    const total = () => cash + [...pos.values()].reduce((a, p) => a + p.w, 0);
    [...pos.entries()].forEach(([sy, p]) => {
      const ret = p.w / p.entry - 1;
      const f = feats.get(sy);
      let sell = false;
      if (rule.stopLoss != null && ret <= -rule.stopLoss) sell = true;
      else if (rule.takeProfit != null && ret >= rule.takeProfit) sell = true;
      else if (rule.holdWeeks > 0 && p.weeks >= rule.holdWeeks) sell = true;
      else if (rule.exitOnFail && f && ((rule.uptrend && !f.up) || f.rs < Math.max(0, rule.minRs - 25))) sell = true;
      if (sell) {
        const fee = p.w * FEE;
        cash += p.w - fee;
        closedRets.push(ret - 2 * FEE);
        holds.push(p.weeks);
        pos.delete(sy);
      }
    });

    // 4) Käufe
    const spxCloses = spx.c.slice(0, si + 1);
    let s200 = 0;
    for (let m = spxCloses.length - 200; m < spxCloses.length; m++) s200 += spxCloses[m];
    s200 /= 200;
    const marketOk = !rule.marketFilter || spxCloses[spxCloses.length - 1] > s200;
    if (marketOk) {
      const cands = [...feats.entries()]
        .filter(([sy, f]) => !pos.has(sy) && passes(f))
        .sort((a, b) => b[1].rs - a[1].rs);
      const eqNow = total();
      for (const [sy] of cands) {
        if (pos.size >= rule.positions) break;
        const amount = Math.min(eqNow / rule.positions, cash);
        if (amount < 0.005) break;
        const fee = amount * FEE;
        cash -= amount;
        pos.set(sy, { w: amount - fee, entry: amount, weeks: 0 });
      }
    }

    const value = total();
    investedSum += (value - cash) / value;
    eq.push([t, value]);
    spxEq.push([t, spx.c[si] / spx.c[steps[0]]]);
    ewEq.push([t, ewV]);
  });

  // offene Positionen zählen für die Trefferquote mit ihrem aktuellen Stand
  pos.forEach((p) => {
    closedRets.push(p.w / p.entry - 1 - FEE);
    holds.push(p.weeks);
  });

  eq.shift();
  spxEq.shift();
  ewEq.shift();
  const norm = (a: [number, number][]) => a.map(([t, v]) => [t, v / a[0][1]] as [number, number]);
  const E = norm(eq);
  const S = norm(spxEq);
  const W = norm(ewEq);
  const rets: number[] = [];
  for (let i = 1; i < E.length; i++) rets.push(E[i][1] / E[i - 1][1] - 1);
  let peak = E[0][1];
  let dd = 0;
  E.forEach(([, v]) => {
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
  });
  const years = (E[E.length - 1][0] - E[0][0]) / (365.25 * 86400_000);
  const total = E[E.length - 1][1] / E[0][1] - 1;
  const half = Math.floor(E.length / 2);
  const seg = (a: [number, number][], from: number, to: number) => a[to][1] / a[from][1] - 1;
  return {
    equity: E,
    spx: S,
    ew: W,
    totalReturn: total,
    cagr: years > 0 ? Math.pow(1 + total, 1 / years) - 1 : total,
    maxDD: dd,
    sharpe: stdev(rets) > 0 ? (mean(rets) / stdev(rets)) * Math.sqrt(52) : 0,
    trades: closedRets.length,
    winRate: closedRets.length ? closedRets.filter((r) => r > 0).length / closedRets.length : 0,
    avgHoldWeeks: mean(holds),
    invested: investedSum / steps.length,
    halves: { first: seg(E, 0, half), second: seg(E, half, E.length - 1), firstSpx: seg(S, 0, half), secondSpx: seg(S, half, S.length - 1) },
    years,
    from: E[0][0],
    to: E[E.length - 1][0],
  };
}

export { pctChange };
