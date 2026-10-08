/**
 * Backtest: Hätten die Strategien in der Vergangenheit funktioniert?  →  data/backtest.json
 *   npx tsx scripts/backtest.ts
 *
 * 1) Aktien-Strategien (monatliche Umschichtung, 10 Jahre Tageskurse, nur Daten bis zum jeweiligen Stichtag):
 *      Langzeit-Bot wie live, + Marktampel, + Relative Stärke, reines Momentum
 *    Vergleich: S&P 500 (Kaufen & Halten) und gleichgewichtetes Universum
 * 2) Gold-Bot: gleiche Signale wie live auf den letzten ~60 Tagen 5-Minuten-Kerzen
 *
 * Ehrliche Einschränkung: Das Aktien-Universum besteht aus HEUTIGEN Großkonzernen (Survivorship-Bias) –
 * die Ergebnisse sind zu optimistisch. Deshalb wird auch das gleichgewichtete Universum als Maßstab gezeigt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { getChart, pool } from '../src/api/yahoo';
import { mean, pctChange, sma, stdev } from '../src/analysis/indicators';
import { assessBias, driftStats, expectedReturn } from '../src/analysis/model';
import { UNIVERSE } from '../src/analysis/universe';
import { GOLD, goldEntry, goldSeries } from '../src/bots/goldBot';
import { Candle } from '../src/types';

const FEE = 0.0005; // pro Order, wie im Live-Betrieb
const REBALANCE_BARS = 21; // etwa monatlich
const START_BAR = 252;

interface Series {
  t: number[];
  c: number[];
  cs: Candle[];
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

async function loadAll(): Promise<{ spx: Series; stocks: Map<string, Series> }> {
  const get = async (sym: string): Promise<Series> => {
    const d = await getChart(sym, '10y', '1d', 0);
    return { t: d.candles.map((c) => c.t), c: d.candles.map((c) => c.c), cs: d.candles };
  };
  const spx = await get('^GSPC');
  const res = await pool(UNIVERSE, 5, async (s) => [s, await get(s)] as const);
  const stocks = new Map<string, Series>();
  res.forEach((r) => r && r[1].c.length > 400 && stocks.set(r[0], r[1]));
  return { spx, stocks };
}

/** Index der letzten Kerze mit Datum <= t */
function idxAt(s: Series, t: number): number {
  let lo = 0;
  let hi = s.t.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

interface Feat {
  symbol: string;
  j: number;
  score: number;
  vol: number;
  above200: boolean;
  rankKey: number;
  momentum: number;
  rs: number;
}

function features(stocks: Map<string, Series>, t: number): Feat[] {
  const out: Feat[] = [];
  stocks.forEach((s, symbol) => {
    const j = idxAt(s, t);
    if (j < 252 || t - s.t[j] > 7 * 86400_000) return;
    const cs = s.cs.slice(j - 251, j + 1);
    const closes = cs.map((c) => c.c);
    const st = driftStats(closes, 252);
    const { score } = assessBias(cs, 0);
    const exp = expectedReturn(st, score, 1);
    const price = closes[closes.length - 1];
    const s200 = sma(closes, 200);
    const momentum = 0.4 * pctChange(closes, 63) + 0.2 * pctChange(closes, 126) + 0.2 * pctChange(closes, 189) + 0.2 * (price / closes[0] - 1);
    out.push({ symbol, j, score, vol: st.vol, above200: price > s200, rankKey: exp / (0.5 + st.vol), momentum, rs: 0 });
  });
  const sorted = [...out].sort((a, b) => a.momentum - b.momentum);
  sorted.forEach((f, i) => (f.rs = Math.round(((i + 1) / sorted.length) * 99)));
  return out;
}

type Picker = (f: Feat[], regime: 'green' | 'yellow' | 'red') => string[];

const base = (f: Feat[]) => f.filter((x) => x.score >= 1 && x.above200 && x.vol < 0.6).sort((a, b) => b.rankKey - a.rankKey);

const STRATEGIES: { key: string; name: string; desc: string; pick: Picker }[] = [
  {
    key: 'long',
    name: 'Langzeit-Bot (Regeln wie live)',
    desc: 'Beste 8 nach Ranking-Score: Aufwärtstrend, positiver Signal-Score, Schwankung < 60 %. Monatlich umgeschichtet.',
    pick: (f) => base(f).slice(0, 8).map((x) => x.symbol),
  },
  {
    key: 'long_regime',
    name: '+ Marktampel',
    desc: 'Wie oben, aber bei rotem Markt (S&P 500 unter 200-Tage-Linie) alles in Cash, bei gelb nur 5 Positionen.',
    pick: (f, r) => (r === 'red' ? [] : base(f).slice(0, r === 'yellow' ? 5 : 8).map((x) => x.symbol)),
  },
  {
    key: 'long_rs',
    name: '+ Marktampel + Relative Stärke',
    desc: 'Zusätzlich nur Aktien mit Relative Stärke ≥ 60 (stärker als 60 % des Universums).',
    pick: (f, r) => (r === 'red' ? [] : base(f).filter((x) => x.rs >= 60).slice(0, r === 'yellow' ? 5 : 8).map((x) => x.symbol)),
  },
  {
    key: 'mom_trend',
    name: 'Momentum mit Trendfilter',
    desc: 'Aus den Aktien im Aufwärtstrend (Score ≥ 1, über 200-Tage-Linie) die 8 mit dem stärksten 3-12-Monats-Momentum (Relative Stärke).',
    pick: (f) => f.filter((x) => x.score >= 1 && x.above200).sort((a, b) => b.momentum - a.momentum).slice(0, 8).map((x) => x.symbol),
  },
  {
    key: 'momentum',
    name: 'Reines Momentum (Top 8)',
    desc: 'Die 8 Aktien mit dem stärksten 3-12-Monats-Momentum, ohne weitere Filter.',
    pick: (f) => [...f].sort((a, b) => b.momentum - a.momentum).slice(0, 8).map((x) => x.symbol),
  },
];

interface Result {
  key: string;
  name: string;
  desc: string;
  totalReturn: number;
  cagr: number;
  maxDD: number;
  sharpe: number;
  winMonths: number;
  cashShare: number;
  equity: [number, number][];
}

function metrics(key: string, name: string, desc: string, eq: [number, number][], cash = 0): Result {
  const rets: number[] = [];
  for (let i = 1; i < eq.length; i++) rets.push(eq[i][1] / eq[i - 1][1] - 1);
  const years = (eq[eq.length - 1][0] - eq[0][0]) / (365.25 * 86400_000);
  let peak = eq[0][1];
  let dd = 0;
  eq.forEach(([, v]) => {
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
  });
  const total = eq[eq.length - 1][1] / eq[0][1] - 1;
  const stepsPerYear = rets.length / years;
  return {
    key,
    name,
    desc,
    totalReturn: total,
    cagr: Math.pow(1 + total, 1 / years) - 1,
    maxDD: dd,
    sharpe: stdev(rets) > 0 ? (mean(rets) / stdev(rets)) * Math.sqrt(stepsPerYear) : 0,
    winMonths: rets.filter((r) => r > 0).length / (rets.length || 1),
    cashShare: cash,
    equity: eq,
  };
}

async function stockBacktests(): Promise<{ results: Result[]; from: number; to: number }> {
  const { spx, stocks } = await loadAll();
  console.log(`Aktien geladen: ${stocks.size}, S&P-Kerzen: ${spx.c.length}`);
  const dates: number[] = [];
  for (let i = START_BAR; i < spx.t.length; i += REBALANCE_BARS) dates.push(spx.t[i]);

  const equities = new Map<string, [number, number][]>();
  const state = new Map<string, { w: Map<string, number>; v: number; cash: number; n: number }>();
  STRATEGIES.forEach((s) => {
    equities.set(s.key, [[dates[0], 1]]);
    state.set(s.key, { w: new Map(), v: 1, cash: 0, n: 0 });
  });
  const ew: [number, number][] = [[dates[0], 1]];
  const bench: [number, number][] = [[dates[0], 1]];
  let ewV = 1;
  let benchV = 1;

  for (let k = 0; k < dates.length - 1; k++) {
    const t0 = dates[k];
    const t1 = dates[k + 1];
    const i0 = idxAt(spx, t0);
    const spxCloses = spx.c.slice(0, i0 + 1);
    const s200 = sma(spxCloses, 200);
    const s50 = sma(spxCloses, 50);
    const last = spxCloses[spxCloses.length - 1];
    const regime = last < s200 ? 'red' : s50 < s200 ? 'yellow' : 'green';
    const feats = features(stocks, t0);

    const retOf = (symbol: string) => {
      const s = stocks.get(symbol)!;
      const a = idxAt(s, t0);
      const b = idxAt(s, t1);
      return s.c[b] / s.c[a] - 1;
    };

    STRATEGIES.forEach((strat) => {
      const st = state.get(strat.key)!;
      const picks = feats.length ? strat.pick(feats, regime) : [];
      const w = 1 / Math.max(picks.length, 1);
      // Umschichtungskosten: Umsatz = Summe der Gewichtsänderungen (alte Gewichte sind durch Kursbewegung verschoben)
      let turnover = 0;
      const newW = new Map<string, number>();
      picks.forEach((p) => newW.set(p, w));
      new Set([...st.w.keys(), ...newW.keys()]).forEach((sym) => (turnover += Math.abs((newW.get(sym) ?? 0) - (st.w.get(sym) ?? 0))));
      st.v *= 1 - turnover * FEE;
      // Haltezeit: Rendite der gewählten Aktien, Rest Cash
      const invested = picks.length ? 1 : 0;
      const r = picks.length ? mean(picks.map(retOf)) : 0;
      st.v *= 1 + r * invested;
      if (!picks.length) st.cash++;
      st.n++;
      // Gewichte nach Kursbewegung (für den nächsten Umsatz)
      const drifted = new Map<string, number>();
      if (picks.length) {
        let tot = 0;
        picks.forEach((p) => {
          const x = w * (1 + retOf(p));
          drifted.set(p, x);
          tot += x;
        });
        drifted.forEach((x, p) => drifted.set(p, x / tot));
      }
      st.w = drifted;
      equities.get(strat.key)!.push([t1, st.v]);
    });

    // gleichgewichtetes Universum (monatlich neu gewichtet, ohne Kosten) und S&P 500
    if (feats.length) ewV *= 1 + mean(feats.map((f) => retOf(f.symbol)));
    ew.push([t1, ewV]);
    benchV *= spx.c[idxAt(spx, t1)] / spx.c[i0];
    bench.push([t1, benchV]);
  }

  const results: Result[] = STRATEGIES.map((s) => metrics(s.key, s.name, s.desc, equities.get(s.key)!, state.get(s.key)!.cash / Math.max(state.get(s.key)!.n, 1)));
  results.push(metrics('universe', 'Alle 44 Aktien gleichgewichtet', 'Maßstab: einfach alle Aktien des Universums zu gleichen Teilen halten (zeigt, wie stark der Hindsight-Effekt ist).', ew));
  results.push(metrics('spx', 'S&P 500 (Kaufen & Halten)', 'Der Markt – das, was man ohne jede Strategie bekommt.', bench));
  return { results, from: dates[0], to: dates[dates.length - 1] };
}

/** Gold-Bot auf 5-Minuten-Kerzen (≈60 Tage), gleiche Signale wie live */
async function goldBacktest() {
  const d = await getChart('GC=F', '60d', '5m', 0);
  const cs = d.candles;
  const g = goldSeries(cs);
  let eq = 1;
  const curve: [number, number][] = [[cs[0].t, 1]];
  let pos: null | { dir: 1 | -1; entry: number; stop: number; target: number; R: number; qtyShare: number; bar: number } = null;
  let cooldown = -1;
  let trades = 0;
  let wins = 0;
  const close = (price: number, i: number) => {
    const pnl = ((price - pos!.entry) * pos!.dir) / pos!.entry; // Rendite auf eingesetztes Kapital
    const fees = GOLD.FEE * 2;
    eq *= 1 + pos!.qtyShare * (pnl - fees);
    trades++;
    if (pnl - fees > 0) wins++;
    pos = null;
    cooldown = i + 6;
  };
  for (let i = 210; i < cs.length; i++) {
    const c = cs[i];
    if (pos) {
      const p = pos;
      // zuerst Stop, dann Ziel (konservativ)
      const hitStop = p.dir === 1 ? c.l <= p.stop : c.h >= p.stop;
      const hitTarget = p.dir === 1 ? c.h >= p.target : c.l <= p.target;
      if (hitStop) close(p.stop, i);
      else if (hitTarget) close(p.target, i);
      else {
        const profit = (c.c - p.entry) * p.dir;
        if (profit >= p.R) p.stop = p.dir === 1 ? Math.max(p.stop, p.entry) : Math.min(p.stop, p.entry);
        if (profit >= 1.5 * p.R) p.stop = p.dir === 1 ? Math.max(p.stop, c.c - p.R) : Math.min(p.stop, c.c + p.R);
        const flip = (p.dir === 1 && g.e20[i] < g.e50[i]) || (p.dir === -1 && g.e20[i] > g.e50[i]);
        if (flip || i - p.bar >= GOLD.MAX_HOLD_BARS) close(c.c, i);
      }
    } else if (i > cooldown) {
      const sig = goldEntry(g, i);
      if (sig) {
        const R = GOLD.STOP_ATR * sig.atr;
        const qtyShare = Math.min(GOLD.RISK_PER_TRADE / (R / c.c), 0.95); // Anteil des Depots, der investiert wird
        pos = { dir: sig.dir, entry: c.c, stop: c.c - sig.dir * R, target: c.c + sig.dir * GOLD.TARGET_ATR * sig.atr, R, qtyShare, bar: i };
      }
    }
    if (i % 12 === 0) curve.push([c.t, eq]);
  }
  curve.push([cs[cs.length - 1].t, eq]);
  const hold: [number, number][] = cs.filter((_, i) => i % 12 === 0).map((c) => [c.t, c.c / cs[0].c]);
  const r = metrics('gold', 'Gold-Bot (5-Minuten-Kerzen)', `Breakout, Pullback und Range wie live – ${trades} Trades in den letzten ~${Math.round((cs[cs.length - 1].t - cs[0].t) / 86400_000)} Tagen.`, curve);
  const h = metrics('gold_hold', 'Gold kaufen & halten', 'Zum Vergleich im selben Zeitraum.', hold);
  return { bot: { ...r, trades, winRate: trades ? wins / trades : 0 }, hold: h, from: cs[0].t, to: cs[cs.length - 1].t };
}

/** Zeitreihen auf maximal ~120 Punkte verkleinern */
const thin = (eq: [number, number][]) => {
  const step = Math.ceil(eq.length / 120);
  return eq.filter((_, i) => i % step === 0 || i === eq.length - 1).map(([t, v]) => [t, Math.round(v * 10000) / 10000] as [number, number]);
};

async function main() {
  const t0 = Date.now();
  const st = await stockBacktests();
  let gold: Awaited<ReturnType<typeof goldBacktest>> | null = null;
  try {
    gold = await goldBacktest();
  } catch (e: any) {
    console.warn('Gold-Backtest fehlgeschlagen:', e?.message);
  }
  const out = {
    generatedAt: Date.now(),
    stocks: { from: st.from, to: st.to, years: (st.to - st.from) / (365.25 * 86400_000), results: st.results.map((r) => ({ ...r, equity: thin(r.equity) })) },
    gold: gold ? { from: gold.from, to: gold.to, bot: { ...gold.bot, equity: thin(gold.bot.equity) }, hold: { ...gold.hold, equity: thin(gold.hold.equity) } } : null,
    notes: [
      'Das Aktien-Universum besteht aus heutigen Großkonzernen: Wer 2016 so ausgewählt hätte, wusste nicht, welche Firmen erfolgreich werden (Survivorship-Bias). Ergebnisse sind daher zu optimistisch – vergleiche mit „Alle 44 Aktien gleichgewichtet".',
      'Gebühren: 0,05 % pro Order. Keine Steuern, keine Spreads, perfekte Ausführung zu Schlusskursen.',
      'Der Day-Trading-Bot kann nicht über längere Zeit getestet werden, weil Yahoo 1-Minuten-Kerzen nur für wenige Tage liefert.',
      'Gold-Backtest: nur ~60 Tage Daten – statistisch dünn, nur ein Anhaltspunkt.',
    ],
  };
  mkdirSync('data', { recursive: true });
  writeFileSync('data/backtest.json', JSON.stringify(out));
  console.log(`Fertig in ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const r of out.stocks.results) console.log(r.name.padEnd(38), `Rendite ${(r.totalReturn * 100).toFixed(0).padStart(5)} %  p.a. ${(r.cagr * 100).toFixed(1).padStart(5)} %  max.Rückgang ${(r.maxDD * 100).toFixed(0).padStart(4)} %  Sharpe ${r.sharpe.toFixed(2)}  Cash ${(r.cashShare * 100).toFixed(0)} %`);
  if (out.gold) {
    const g = out.gold;
    console.log(g.bot.name.padEnd(38), `Rendite ${(g.bot.totalReturn * 100).toFixed(1)} %  max.Rückgang ${(g.bot.maxDD * 100).toFixed(1)} %  Trades ${g.bot.trades}  Trefferquote ${(g.bot.winRate * 100).toFixed(0)} %`);
    console.log(g.hold.name.padEnd(38), `Rendite ${(g.hold.totalReturn * 100).toFixed(1)} %`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
