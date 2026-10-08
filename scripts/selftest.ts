import { analyzeCoach, weekSummary } from '../src/analysis/coach';
import { luckTest } from '../src/analysis/luck';
import { assessBias, buildScenarios, driftStats, expectedReturn, scenarioFor } from '../src/analysis/model';
import { combineVerdict, scoreFund } from '../src/analysis/fundamental';
import { buildPlan } from '../src/analysis/tradePlan';
import { netAfterTax } from '../src/analysis/tax';
import { buy, botStats, closePosition, dailySummaries, equityOf, newBot, openShort, sell, coverShort } from '../src/bots/sim';
import { describeRisk, dayRisk, longRisk, goldRisk } from '../src/bots/risk';
import { fmtMoney, fmtNum, fmtPct } from '../src/format';
import { Candle } from '../src/types';

let fails = 0;
const ok = (name: string, cond: boolean, info = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'OK  ' : 'FEHLER'} ${name}${info ? ' – ' + info : ''}`);
};
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const finite = (o: unknown) => !JSON.stringify(o, (_k, v) => (typeof v === 'number' && !isFinite(v) ? 'NaN!' : v)).includes('NaN!');

// ---- Buchführung ----
{
  const b = newBot(10000);
  buy(b, 'X', 'X', 100, 5000, 't');
  ok('Kauf: Cash + Positionswert = Depot abzüglich Gebühr', near(equityOf(b), 10000 - 5000 * 0.0005, 0.5), equityOf(b).toFixed(2));
  sell(b, 'X', 100, 't');
  ok('Kauf+Verkauf zum gleichen Kurs kostet nur Gebühren', near(equityOf(b), 10000 - 5000 * 0.0005 - 4997.5 * 0.0005, 0.5), equityOf(b).toFixed(2));
  buy(b, 'Y', 'Y', 50, 2000, 't');
  sell(b, 'Y', 60, 't', undefined, 0.5);
  ok('Teilverkauf lässt halbe Position', b.positions.length === 1 && near(b.positions[0].qty, 39.98 / 2, 0.02), b.positions[0]?.qty.toFixed(3));
  const s = newBot(10000);
  openShort(s, 'G', 'G', 100, 4000, 't');
  ok('Short: Depotwert direkt nach Eröffnung = Start − Gebühr', near(equityOf(s), 10000 - 4000 * 0.0005, 0.5), equityOf(s).toFixed(2));
  s.positions[0].lastPrice = 90;
  ok('Short gewinnt bei fallendem Kurs', equityOf(s) > 10300, equityOf(s).toFixed(2));
  coverShort(s, 'G', 90, 't');
  ok('Short-Gewinn korrekt (≈ +400 € abzgl. Gebühren)', near(s.cash, 10000 + 400 - 4000 * 0.0005 - 40 * 90 / 1 * 0.0005 * 0 - 3600 * 0.0005, 3), s.cash.toFixed(2));
  ok('Gewinn-Trade hat pnl und heldMs', s.trades[0].pnl! > 0 && s.trades[0].heldMs != null);
  ok('closePosition (Long)', (() => { const c = newBot(1000); buy(c, 'Z', 'Z', 10, 500, 't'); return closePosition(c, c.positions[0], 11, 't') && c.positions.length === 0; })());
}

// ---- leere/neue Zustände ----
{
  const b = newBot(10000);
  const st = botStats(b);
  ok('botStats bei neuem Bot ohne NaN', finite(st), JSON.stringify({ pct: st.pnlPct, win: st.winRate }));
  const d = dailySummaries(b);
  ok('Tagesbilanz enthält heute auch ohne Trades', d.length === 1 && d[0].isToday && d[0].stars === 0);
  const c = analyzeCoach(b);
  ok('Coach ohne Trades: keine Bewertung, kein Absturz', c.stars === 0 && finite(c));
  ok('Wochenbilanz ohne Trades', finite(weekSummary(b)));
  const l = luckTest(b);
  ok('Zufallstest ohne Daten: „zu früh"', !l.enough);
  ok('Steuer bei Verlust: 0 €', netAfterTax(-500).tax === 0 && netAfterTax(500).tax === 0 && near(netAfterTax(3000).tax, 527.5));
}

// ---- Modell ----
{
  const flat: Candle[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 86400_000, c: 100, h: 100, l: 100, v: 1000 }));
  const closes = flat.map((c) => c.c);
  const st = driftStats(closes, 252);
  ok('Konstanter Kurs: Volatilität nicht 0 (Fallback)', st.vol > 0, String(st.vol));
  const sc = buildScenarios(st, 0);
  ok('Szenarien ohne NaN bei Flachlinie', finite(sc));
  const bias = assessBias(flat, 0);
  ok('Bias bei Flachlinie neutral', bias.bias === 'neutral' || bias.bias === 'bullish' || bias.bias === 'bearish');
  ok('scenarioFor ohne NaN', finite(scenarioFor({ expected: 0.1, score: 3, vol: 0.3 }, 30 / 365)));
  ok('expectedReturn endlich', isFinite(expectedReturn(st, 4, 1)));
  const rising: Candle[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 86400_000, c: 100 + i * 0.3, h: 101 + i * 0.3, l: 99 + i * 0.3, v: 1000 }));
  const plan = buildPlan(rising, 'bullish', null);
  ok('Trade-Plan: Stop unter Kurs, Ziel 1 über Kurs', !!plan && plan.stop < plan.price && plan.t1 > plan.price, plan ? `${plan.stop.toFixed(1)} < ${plan.price.toFixed(1)} < ${plan.t1.toFixed(1)}` : 'null');
  ok('Trade-Plan: zu wenig Daten → null', buildPlan(rising.slice(0, 30), 'bullish') === null);
  ok('Plan ohne NaN', finite(plan));
}

// ---- Fundamentaldaten ----
{
  const empty = scoreFund({});
  ok('scoreFund ohne Daten: neutral 50, kein Absturz', empty.total === 50 && finite(empty), String(empty.total));
  const loss = scoreFund({ pe: undefined, mar: -0.2, rev: -0.1, de: 4, cr: 0.5, fcf: -1e9, mcap: 1e9, tgt: 5, na: 8, rec: 4 }, 10);
  ok('Verlustfirma bekommt schlechte Note', loss.total < 40 && loss.flags.length >= 2, `${loss.total} ${loss.flags.join(', ')}`);
  const great = scoreFund({ fpe: 14, peg: 0.8, rev: 0.25, eg: 0.3, mar: 0.25, roe: 0.3, de: 0.2, cr: 2, fcf: 5e9, mcap: 1e11, tgt: 150, na: 20, rec: 1.6, beta: 0.9 }, 100);
  ok('Starke Firma bekommt gute Note', great.total >= 75, String(great.total));
  const v = combineVerdict(great, 'bullish', 4, { rsi: 55 });
  ok('Gesamturteil: gute Firma + Aufwärtstrend = Starke Kaufidee', v.level === 'great', v.label);
  const v2 = combineVerdict(loss, 'bearish', -3);
  ok('Gesamturteil: schlecht + bärisch = Meiden', v2.level === 'avoid', v2.label);
  ok('Gesamturteil ohne Fundament kein Absturz', combineVerdict(null, 'neutral', 0).label.length > 0);
}

// ---- Risiko-Regler ----
{
  ok('Risiko 50 = bisheriges Verhalten (Day)', near(dayRisk(50).share, 0.2, 1e-9) && dayRisk(50).maxPositions === 5 && near(dayRisk(50).dayLoss, 0.015, 1e-9));
  ok('Risiko 50 = bisheriges Verhalten (Langzeit)', longRisk(50).positions === 8 && near(longRisk(50).stopLoss, 0.15, 1e-9) && longRisk(50).minRs === 70);
  ok('Risiko 50 = bisheriges Verhalten (Gold)', near(goldRisk(50).riskPerTrade, 0.01, 1e-9));
  ok('Risiko 0 → nichts investierbar', dayRisk(0).maxInvested === 0 && longRisk(0).maxInvested === 0 && goldRisk(0).maxInvested === 0);
  ok('Werte außerhalb 0–100 werden begrenzt', dayRisk(250).share === dayRisk(100).share && dayRisk(-5).share === dayRisk(0).share);
  ok('Beschreibung für alle Bots', ['day', 'long', 'gold'].every((k) => describeRisk(k as any, 73).lines.length > 0));
}

// ---- Formatierung ----
ok('Formatierer geben bei NaN keinen Text „NaN" aus', !fmtNum(NaN).includes('NaN') && !fmtPct(NaN).includes('NaN') && !fmtMoney(Infinity).includes('Infinity'));

console.log(fails === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fails} Prüfung(en) FEHLGESCHLAGEN.`);
process.exit(fails === 0 ? 0 : 1);
