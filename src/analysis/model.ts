import { Bias, Candle, Scenario, Signal } from '../types';
import { clamp, logReturns, mean, normCdf, pctChange, rsi, sma, stdev } from './indicators';

const LONG_RUN_DRIFT = 0.07; // langfristige Aktienmarkt-Rendite p.a. (Anker)

export interface DriftStats {
  drift: number; // geglättete erwartete Rendite p.a. (ohne Trend-Zuschlag)
  vol: number; // Volatilität p.a.
  rawDrift: number;
}

/** Rendite & Schwankung aus historischen Kursen. perYear = 252 (täglich) bzw. 52 (wöchentlich) */
export function driftStats(closes: number[], perYear: number): DriftStats {
  const r = logReturns(closes);
  const rawDrift = mean(r) * perYear;
  const vol = stdev(r) * Math.sqrt(perYear);
  // Vergangene Rendite ist ein schwacher Indikator → stark Richtung langfristigem Schnitt gedämpft
  const drift = 0.35 * clamp(rawDrift, -0.3, 0.4) + 0.65 * LONG_RUN_DRIFT;
  return { drift, vol: vol || 0.3, rawDrift };
}

/** Bullisch / Bärisch Einschätzung aus Trend, Momentum, RSI und News */
export function assessBias(daily: Candle[], newsSentiment: number): { bias: Bias; score: number; signals: Signal[] } {
  const closes = daily.map((c) => c.c);
  const last = closes[closes.length - 1];
  const signals: Signal[] = [];
  const add = (text: string, value: number) => signals.push({ text, value });

  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  if (isFinite(s200)) {
    add(last > s200 ? 'Kurs liegt über der 200-Tage-Linie (langfristiger Aufwärtstrend)' : 'Kurs liegt unter der 200-Tage-Linie (langfristiger Abwärtstrend)', last > s200 ? 1 : -1);
  }
  if (isFinite(s50) && isFinite(s200)) {
    add(s50 > s200 ? '50-Tage-Linie über 200-Tage-Linie („Golden Cross"-Lage)' : '50-Tage-Linie unter 200-Tage-Linie („Death Cross"-Lage)', s50 > s200 ? 1 : -1);
  }
  const m6 = pctChange(closes, 126);
  if (isFinite(m6)) add(`6-Monats-Momentum ${(m6 * 100).toFixed(1).replace('.', ',')} %`, m6 > 0.03 ? 1 : m6 < -0.03 ? -1 : 0);
  const m1 = pctChange(closes, 21);
  if (isFinite(m1)) add(`1-Monats-Momentum ${(m1 * 100).toFixed(1).replace('.', ',')} %`, m1 > 0.02 ? 1 : m1 < -0.02 ? -1 : 0);
  const rs = rsi(closes, 14);
  if (isFinite(rs)) {
    const v = rs < 30 ? 1 : rs > 75 ? -1 : 0;
    add(`RSI ${rs.toFixed(0)} – ${rs < 30 ? 'überverkauft (Erholungschance)' : rs > 75 ? 'überkauft (Rückschlaggefahr)' : 'neutral'}`, v);
  }
  const hi = Math.max(...closes.slice(-252));
  if (isFinite(hi) && hi > 0) {
    const dist = last / hi - 1;
    add(`${(Math.abs(dist) * 100).toFixed(1).replace('.', ',')} % unter dem 52-Wochen-Hoch`, dist > -0.05 ? 1 : dist < -0.3 ? -1 : 0);
  }
  if (newsSentiment !== 0 || signals.length) {
    add(
      newsSentiment > 0.15 ? 'News-Stimmung überwiegend positiv' : newsSentiment < -0.15 ? 'News-Stimmung überwiegend negativ' : 'News-Stimmung neutral',
      newsSentiment > 0.15 ? 1 : newsSentiment < -0.15 ? -1 : 0,
    );
  }
  const score = signals.reduce((s, x) => s + x.value, 0);
  const bias: Bias = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral';
  return { bias, score, signals };
}

/** Erwartete Jahresrendite inkl. Trend-Zuschlag (nur kurzfristig wirksam) */
export function expectedReturn(stats: DriftStats, score: number, years = 1): number {
  const tilt = 0.02 * clamp(score, -4, 4) * (years <= 1 ? 1 : years <= 3 ? 0.5 : 0);
  return stats.drift + tilt;
}

// Zeiträume in Jahren: 15 Tage, 30 Tage, 1, 3, 5 und 10 Jahre
export const HORIZONS = [15 / 365, 30 / 365, 1, 3, 5, 10];

export const horizonLabel = (years: number, short = false) => {
  if (years < 1) return `${Math.round(years * 365)} ${short ? 'T' : 'Tage'}`;
  return short ? `${years} J` : years === 1 ? '1 Jahr' : `${years} Jahre`;
};

/** Szenarien (Bullisch/Basis/Bärisch) als Lognormal-Spanne ±1 Standardabweichung */
export function buildScenarios(stats: DriftStats, score: number): Scenario[] {
  return HORIZONS.map((T) => {
    const mu = expectedReturn(stats, score, T);
    const m = (mu - (stats.vol * stats.vol) / 2) * T;
    const s = stats.vol * Math.sqrt(T);
    return {
      years: T,
      bull: Math.exp(m + s) - 1,
      base: Math.exp(m) - 1,
      bear: Math.exp(m - s) - 1,
      probProfit: normCdf(m / s),
    };
  });
}

/**
 * Szenarien für einen beliebigen Zeitraum aus den Ranking-Daten.
 * `expected` ist die Jahresrendite inkl. Trend-Zuschlag für 1 Jahr; der Zuschlag wird hier je Zeitraum neu gewichtet
 * (voll bis 1 Jahr, halb bis 3 Jahre, danach 0), wie bei den Szenarien der Einzelaktie.
 */
export function scenarioFor(item: { expected: number; score: number; vol: number }, years: number) {
  const tilt = 0.02 * clamp(item.score, -4, 4);
  const drift = item.expected - tilt;
  const mu = drift + tilt * (years <= 1 ? 1 : years <= 3 ? 0.5 : 0);
  const m = (mu - (item.vol * item.vol) / 2) * years;
  const s = item.vol * Math.sqrt(years);
  return { bull: Math.exp(m + s) - 1, base: Math.exp(m) - 1, bear: Math.exp(m - s) - 1 };
}

/** Zeiträume im Ranking */
export const RANK_HORIZONS = [
  { key: '30d', label: '30 Tage', years: 30 / 365 },
  { key: '1y', label: '1 Jahr', years: 1 },
  { key: '5y', label: '5 Jahre', years: 5 },
] as const;

export const biasLabel = (b: Bias) => (b === 'bullish' ? 'Bullisch' : b === 'bearish' ? 'Bärisch' : 'Neutral');
