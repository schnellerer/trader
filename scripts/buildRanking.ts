/**
 * Rechnet das Ranking für alle US-Aktien (inkl. Small Caps) + DAX durch und schreibt
 *   data/ranking.json  (beste 60 je Größenklasse, mit Begründung)
 *   data/scan.json     (ALLE ausgewerteten Aktien kompakt, für den Scanner in der App)
 *   data/earnings.json (Quartalszahlen-Termine der nächsten 2 Wochen)
 * Läuft kostenlos per GitHub Actions (siehe .github/workflows/ranking.yml) oder lokal:
 *   npx tsx scripts/buildRanking.ts            (alles)
 *   LIMIT=100 npx tsx scripts/buildRanking.ts  (Test mit 100 Aktien)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { getChart, pool } from '../src/api/yahoo';
import { DE_STOCKS } from '../src/analysis/universe';
import { pctChange, rsi, sma } from '../src/analysis/indicators';
import { assessBias, biasLabel, driftStats, expectedReturn } from '../src/analysis/model';
import { fetchFundamentals, Fund, FUND_FIELDS, packFund } from '../src/api/fundamentals';
import { FundScore, scoreFund } from '../src/analysis/fundamental';
import { notify } from './notify';
import { updateTrack } from './track';

type Liq = 'large' | 'mid' | 'small' | 'micro';
const BAD_NAME = /warrant|right|unit|preferred|depositary share|notes due|trust|fund|etn|acquisition corp|spac|% /i;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function usSymbols(): Promise<{ symbol: string; name: string }[]> {
  const out: { symbol: string; name: string }[] = [];
  const get = async (u: string) => (await (await fetch(u)).text()).split(/\r?\n/).slice(1);
  for (const line of await get('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt')) {
    const [sym, name, , test, , , etf] = line.split('|');
    if (sym && test === 'N' && etf === 'N') out.push({ symbol: sym, name });
  }
  for (const line of await get('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt')) {
    const [sym, name, , , etf, , test] = line.split('|');
    if (sym && test === 'N' && etf === 'N') out.push({ symbol: sym, name });
  }
  return out.filter((x) => /^[A-Z]{1,5}$/.test(x.symbol) && !BAD_NAME.test(x.name));
}

/** Quartalszahlen-Termine (Nasdaq-Kalender, kostenlos) für die nächsten 14 Tage */
async function earningsMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const days: string[] = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
  }
  await pool(days, 3, async (day) => {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j: any = await r.json();
    for (const row of j?.data?.rows ?? []) if (row.symbol && !map[row.symbol]) map[row.symbol] = day;
  });
  return map;
}

const liqClass = (dollarVol: number): Liq => (dollarVol >= 100e6 ? 'large' : dollarVol >= 10e6 ? 'mid' : dollarVol >= 1e6 ? 'small' : 'micro');
const pct1 = (v: number) => (v * 100).toFixed(1).replace('.', ',');
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

async function main() {
  const t0 = Date.now();
  let list = [...(await usSymbols()), ...DE_STOCKS.map((s) => ({ symbol: s, name: s }))];
  const limit = Number(process.env.LIMIT || 0);
  if (limit) list = list.slice(0, limit);
  console.log(`Prüfe ${list.length} Aktien …`);

  let earnings: Record<string, string> = {};
  try {
    earnings = await earningsMap();
    console.log(`Earnings-Termine: ${Object.keys(earnings).length}`);
  } catch (e: any) {
    console.warn('Earnings-Kalender nicht erreichbar:', e?.message);
  }

  let done = 0;
  let failed = 0;
  const res = await pool(list, 6, async ({ symbol }) => {
    if (++done % 250 === 0) console.log(`${done}/${list.length} (${Math.round((Date.now() - t0) / 1000)} s, ${failed} ohne Daten)`);
    let d;
    try {
      d = await getChart(symbol, '1y', '1d', 0);
    } catch (e) {
      failed++;
      throw e;
    }
    const cs = d.candles;
    if (cs.length < 200) return null;
    const closes = cs.map((c) => c.c);
    const price = closes[closes.length - 1];
    const last30 = cs.slice(-30);
    const dollarVol = last30.reduce((s, c) => s + c.c * c.v, 0) / last30.length;
    const isEur = d.meta.currency === 'EUR';
    if (!isEur && d.meta.currency !== 'USD') return null;
    if (price < 1 || dollarVol < 100_000) return null;
    // Datenfehler / extreme Sprünge aussortieren
    for (let i = cs.length - 60; i < cs.length; i++) if (cs[i].c / cs[i - 1].c > 2.5 || cs[i].c / cs[i - 1].c < 0.4) return null;

    const stats = driftStats(closes, 252);
    const { bias, score, signals } = assessBias(cs, 0);
    const expected = expectedReturn(stats, score, 1);
    const s200 = sma(closes, 200);
    const m6 = pctChange(closes, 126);
    const hi52 = Math.max(...closes);
    const vols = cs.map((c) => c.v);
    const volSurge = mean(vols.slice(-5)) / (mean(vols.slice(-50)) || 1);
    const momentum =
      0.4 * pctChange(closes, 63) + 0.2 * pctChange(closes, 126) + 0.2 * pctChange(closes, 189) + 0.2 * (price / closes[0] - 1);
    const liq = liqClass(isEur ? dollarVol * 1.08 : dollarVol);
    const pos = signals.filter((s) => s.value > 0).map((s) => s.text);
    const neg = signals.filter((s) => s.value < 0).map((s) => s.text);
    const explanation =
      `Erwartete 12-Monats-Rendite (Basis): ${pct1(expected)} % bei ${(stats.vol * 100).toFixed(0)} % Schwankung.\n` +
      `Grundlage: langfristiger Markt-Schnitt (7 % p.a.), gedämpft mit der eigenen Kurshistorie (1 Jahr: ${(stats.rawDrift * 100).toFixed(0)} % p.a.) und einem Trend-Zuschlag von ${(0.02 * Math.max(-4, Math.min(4, score)) * 100).toFixed(0)} %-Punkten.\n` +
      (pos.length ? `Dafür spricht: ${pos.join('; ')}.\n` : '') +
      (neg.length ? `Dagegen spricht: ${neg.join('; ')}.\n` : '') +
      `Einstufung: ${biasLabel(bias)} (Score ${score}). Handelsvolumen ca. ${(dollarVol / 1e6).toFixed(1).replace('.', ',')} Mio. ${isEur ? '€' : '$'} pro Tag.` +
      (liq === 'small' || liq === 'micro' ? '\nAchtung: kleiner, wenig gehandelter Wert – Kurse können stark springen, Kaufen/Verkaufen ist teils schwierig.' : '');
    return {
      symbol,
      name: d.meta.name,
      currency: d.meta.currency,
      price,
      expected,
      vol: stats.vol,
      score,
      bias,
      aboveSma200: isFinite(s200) ? price > s200 : isFinite(m6) && m6 > 0,
      signals,
      explanation,
      rankKey: expected / (0.5 + stats.vol),
      liq,
      dollarVol,
      momentum,
      rsi14: rsi(closes, 14),
      hi52Dist: price / hi52 - 1,
      volSurge,
      m1: pctChange(closes, 21),
      m6,
      m12: price / closes[0] - 1,
      earnings: earnings[symbol],
    };
  });

  const items = res.filter((x): x is NonNullable<typeof x> => !!x);

  // Relative Stärke: Rang des Momentums unter allen ausgewerteten Aktien (1 = schwächste, 99 = stärkste)
  const byMom = [...items].sort((a, b) => a.momentum - b.momentum);
  const rsOf = new Map(byMom.map((x, i) => [x.symbol, Math.max(1, Math.min(99, Math.round(((i + 1) / byMom.length) * 99)))]));
  const withRs = items.map((x) => ({ ...x, rs: rsOf.get(x.symbol)! })).sort((a, b) => b.rankKey - a.rankKey);

  // Fundamentaldaten (Bewertung, Wachstum, Qualität, Analysten) für alle Aktien außer Micro-Caps
  const fundMap = new Map<string, Fund>();
  const fundScore = new Map<string, FundScore>();
  {
    const targets = withRs.filter((x) => x.liq !== 'micro');
    let fdone = 0;
    let ferr = 0;
    let aborted = false;
    console.log(`Hole Fundamentaldaten für ${targets.length} Aktien …`);
    await pool(targets, 4, async (x) => {
      if (aborted) return;
      try {
        const f = await fetchFundamentals(x.symbol);
        if (f) {
          fundMap.set(x.symbol, f);
          fundScore.set(x.symbol, scoreFund(f, x.price));
        }
      } catch (e) {
        ferr++;
        if (ferr > 60 && ferr > fdone * 0.5) aborted = true; // Yahoo blockt → Schritt abbrechen, Rest läuft trotzdem
      }
      if (++fdone % 500 === 0) console.log(`  Fundamentaldaten ${fdone}/${targets.length} (${fundMap.size} mit Daten, ${ferr} Fehler)`);
    });
    if (aborted) console.warn('Fundamentaldaten abgebrochen (zu viele Fehler) – Ranking läuft ohne.');
    console.log(`Fundamentaldaten: ${fundMap.size} Aktien`);
  }
  const fundOf = (s: string) => fundScore.get(s)?.total;

  // Pro Liquiditätsklasse die besten 60 behalten (hält die Datei klein)
  const classes: Liq[] = ['large', 'mid', 'small', 'micro'];
  const keep = classes
    .flatMap((c) => withRs.filter((x) => x.liq === c).slice(0, 60))
    .sort((a, b) => b.rankKey - a.rankKey)
    .map(({ momentum, rsi14, hi52Dist, volSurge, m1, m6, m12, ...rest }) => ({ ...rest, fund: fundOf(rest.symbol) }));
  const counts = Object.fromEntries(classes.map((c) => [c, withRs.filter((x) => x.liq === c).length]));

  // Scanner-Datei: alle Aktien, kompakt als Zahlenreihen
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const scan = withRs.map((x) => [
    x.symbol,
    x.name.slice(0, 32),
    x.liq,
    Math.round(x.price * 100) / 100,
    x.currency,
    x.rs,
    Math.round(x.rsi14),
    r4(x.hi52Dist),
    Math.round(x.volSurge * 100) / 100,
    r4(x.m1),
    r4(x.m6),
    r4(x.m12),
    x.score,
    r4(x.vol),
    x.aboveSma200 ? 1 : 0,
    x.earnings ?? '',
    fundOf(x.symbol) ?? null,
    fundMap.get(x.symbol)?.fpe ?? fundMap.get(x.symbol)?.pe ?? null,
    fundMap.get(x.symbol)?.rev ?? null,
    fundMap.get(x.symbol)?.mar ?? null,
    fundScore.get(x.symbol)?.upside != null ? r4(fundScore.get(x.symbol)!.upside!) : null,
    fundMap.get(x.symbol)?.div ?? null,
    fundMap.get(x.symbol)?.sec ?? null,
  ]);

  mkdirSync('data', { recursive: true });
  writeFileSync('data/ranking.json', JSON.stringify({ generatedAt: Date.now(), requested: list.length, analyzed: items.length, counts, items: keep }));
  writeFileSync(
    'data/scan.json',
    JSON.stringify({
      generatedAt: Date.now(),
      fields: ['symbol', 'name', 'liq', 'price', 'currency', 'rs', 'rsi', 'hi52', 'vol', 'm1', 'm6', 'm12', 'score', 'sigma', 'up', 'earnings', 'fund', 'pe', 'revg', 'margin', 'upside', 'div', 'sector'],
      rows: scan,
    }),
  );
  if (fundMap.size > 0) {
    const rows: Record<string, unknown[]> = {};
    fundMap.forEach((f, s) => (rows[s] = packFund(f)));
    writeFileSync('data/fundamentals.json', JSON.stringify({ generatedAt: Date.now(), fields: FUND_FIELDS, rows }));
  }
  writeFileSync('data/earnings.json', JSON.stringify({ generatedAt: Date.now(), map: earnings }));
  if (!limit) updateTrack(withRs.map((x) => ({ symbol: x.symbol, price: x.price, expected: x.expected, score: x.score, vol: x.vol, rankKey: x.rankKey, liq: x.liq })));
  console.log(`Fertig in ${Math.round((Date.now() - t0) / 1000)} s: ${items.length} von ${list.length} ausgewertet`, counts);
  if (items.length < Math.min(50, list.length * 0.3)) throw new Error('Zu wenige Ergebnisse – vermutlich blockiert Yahoo die Anfragen.');

  // Handy-Benachrichtigung mit den stärksten Ausbrüchen (nur große/mittlere Werte, falls NTFY_TOPIC gesetzt ist)
  const breakouts = withRs
    .filter((x) => (x.liq === 'large' || x.liq === 'mid') && x.hi52Dist > -0.03 && x.volSurge > 1.5 && x.aboveSma200 && x.rs >= 80)
    .sort((a, b) => b.rs - a.rs)
    .slice(0, 5);
  if (breakouts.length)
    await notify('Scanner: Ausbruchs-Kandidaten', breakouts.map((x) => `${x.symbol} (RS ${x.rs}, Volumen ×${x.volSurge.toFixed(1)})`).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
