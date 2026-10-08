export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export const stdev = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

export const sma = (a: number[], n: number) => (a.length >= n ? mean(a.slice(-n)) : NaN);

export function rsi(closes: number[], n = 14): number {
  if (closes.length <= n) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

/** Exponentieller gleitender Durchschnitt (Reihe in gleicher Länge) */
export function ema(a: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  a.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

/** Average True Range (Schwankungsbreite pro Kerze) */
export function atr(c: { h: number; l: number; c: number }[], n = 14): number {
  if (c.length <= n) return NaN;
  let sum = 0;
  for (let i = c.length - n; i < c.length; i++) sum += Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
  return sum / n;
}

export const logReturns = (closes: number[]) => {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0 && closes[i] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  return r;
};

/** Standardnormalverteilung (Verteilungsfunktion) */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const pctChange = (closes: number[], back: number) =>
  closes.length > back ? closes[closes.length - 1] / closes[closes.length - 1 - back] - 1 : NaN;
