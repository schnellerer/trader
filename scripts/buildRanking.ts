/**
 * Rechnet das Ranking für alle US-Aktien (inkl. Small Caps) + DAX durch und schreibt data/ranking.json.
 * Läuft kostenlos per GitHub Actions (siehe .github/workflows/ranking.yml) oder lokal:
 *   npx tsx scripts/buildRanking.ts            (alles)
 *   LIMIT=100 npx tsx scripts/buildRanking.ts  (Test mit 100 Aktien)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { getChart, pool } from '../src/api/yahoo';
import { DE_STOCKS } from '../src/analysis/universe';
import { pctChange, sma } from '../src/analysis/indicators';
import { assessBias, biasLabel, driftStats, expectedReturn } from '../src/analysis/model';

type Liq = 'large' | 'mid' | 'small' | 'micro';
const BAD_NAME = /warrant|right|unit|preferred|depositary share|notes due|trust|fund|etn|acquisition corp|spac|% /i;

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
  return out
    .filter((x) => /^[A-Z]{1,5}$/.test(x.symbol) && !BAD_NAME.test(x.name))
    .map((x) => ({ symbol: x.symbol, name: x.name }));
}

const liqClass = (dollarVol: number): Liq => (dollarVol >= 100e6 ? 'large' : dollarVol >= 10e6 ? 'mid' : dollarVol >= 1e6 ? 'small' : 'micro');
const pct1 = (v: number) => (v * 100).toFixed(1).replace('.', ',');

async function main() {
  const t0 = Date.now();
  let list = [...(await usSymbols()), ...DE_STOCKS.map((s) => ({ symbol: s, name: s }))];
  const limit = Number(process.env.LIMIT || 0);
  if (limit) list = list.slice(0, limit);
  console.log(`Prüfe ${list.length} Aktien …`);

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
    const last = cs.slice(-30);
    const dollarVol = last.reduce((s, c) => s + c.c * c.v, 0) / last.length;
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
    };
  });

  const items = res.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.rankKey - a.rankKey);
  // Pro Liquiditätsklasse die besten 60 behalten (hält die Datei klein)
  const keep = (['large', 'mid', 'small', 'micro'] as Liq[]).flatMap((c) => items.filter((x) => x.liq === c).slice(0, 60));
  keep.sort((a, b) => b.rankKey - a.rankKey);
  const counts = Object.fromEntries((['large', 'mid', 'small', 'micro'] as Liq[]).map((c) => [c, items.filter((x) => x.liq === c).length]));

  mkdirSync('data', { recursive: true });
  writeFileSync(
    'data/ranking.json',
    JSON.stringify({ generatedAt: Date.now(), requested: list.length, analyzed: items.length, counts, items: keep }),
  );
  console.log(`Fertig in ${Math.round((Date.now() - t0) / 1000)} s: ${items.length} von ${list.length} ausgewertet`, counts);
  if (items.length < Math.min(50, list.length * 0.3)) throw new Error('Zu wenige Ergebnisse – vermutlich blockiert Yahoo die Anfragen.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
