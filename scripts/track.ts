/**
 * Prognose-Zeugnis: Speichert täglich die 30-Tage-Prognosen des Modells und prüft sie nach 30 Tagen gegen die Wirklichkeit.
 *   data/predictions.json  offene Prognosen (noch nicht 30 Tage alt)
 *   data/track.json        Auswertung: Kalibrierung, Top-Auswahl vs. Durchschnitt, Trefferquoten der Spannen
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { scenarioFor } from '../src/analysis/model';

interface Pred {
  d: string; // Datum der Prognose
  s: string; // Symbol
  p: number; // Kurs bei Prognose
  pp: number; // Wahrscheinlichkeit für Gewinn
  b: number; // Basisszenario
  hi: number; // Bullisch
  lo: number; // Bärisch
  g: 'top' | 'base'; // top = vom Modell empfohlen, base = zufällige Vergleichsgruppe
}

interface Group {
  n: number;
  sum: number;
  pos: number;
}

interface Track {
  generatedAt: number;
  since: string | null; // erster Prognosetag
  openCount: number;
  resolved: number;
  groups: { top: Group; base: Group };
  calib: { lo: number; hi: number; n: number; wins: number; avgPred: number }[]; // Kalibrierung der Gewinnwahrscheinlichkeit
  coverage: { n: number; aboveBull: number; belowBear: number }; // sollte je ca. 16 % sein
}

const DAY = 86400_000;
const BINS = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01];

const emptyTrack = (): Track => ({
  generatedAt: 0,
  since: null,
  openCount: 0,
  resolved: 0,
  groups: { top: { n: 0, sum: 0, pos: 0 }, base: { n: 0, sum: 0, pos: 0 } },
  calib: BINS.slice(0, -1).map((lo, i) => ({ lo, hi: BINS[i + 1], n: 0, wins: 0, avgPred: 0 })),
  coverage: { n: 0, aboveBull: 0, belowBear: 0 },
});

interface Cand {
  symbol: string;
  price: number;
  expected: number;
  score: number;
  vol: number;
  rankKey: number;
  liq: string;
}

/** Wird von buildRanking aufgerufen: alle ausgewerteten Aktien mit aktuellem Kurs (Heute) */
export function updateTrack(all: Cand[], today = new Date()) {
  const todayKey = today.toISOString().slice(0, 10);
  let open: Pred[] = existsSync('data/predictions.json') ? JSON.parse(readFileSync('data/predictions.json', 'utf8')) : [];
  const track: Track = existsSync('data/track.json') ? { ...emptyTrack(), ...JSON.parse(readFileSync('data/track.json', 'utf8')) } : emptyTrack();
  const price = new Map(all.map((x) => [x.symbol, x.price]));

  // 1) Fällige Prognosen (≥ 30 Tage alt) auswerten
  const still: Pred[] = [];
  for (const p of open) {
    const age = (Date.parse(todayKey) - Date.parse(p.d)) / DAY;
    if (age < 30) {
      still.push(p);
      continue;
    }
    const now = price.get(p.s);
    if (!now || age > 60) continue; // Aktie nicht mehr vorhanden oder zu alt → verwerfen
    const actual = now / p.p - 1;
    const g = track.groups[p.g];
    g.n++;
    g.sum += actual;
    if (actual > 0) g.pos++;
    if (p.g === 'top') {
      const bin = track.calib.find((c) => p.pp >= c.lo && p.pp < c.hi)!;
      bin.avgPred = (bin.avgPred * bin.n + p.pp) / (bin.n + 1);
      bin.n++;
      if (actual > 0) bin.wins++;
      track.coverage.n++;
      if (actual > p.hi) track.coverage.aboveBull++;
      if (actual < p.lo) track.coverage.belowBear++;
    }
    track.resolved++;
  }
  open = still;

  // 2) Neue Prognosen für heute (nur einmal pro Tag): Top 20 des Rankings + 40 zufällige Vergleichsaktien
  if (!open.some((p) => p.d === todayKey)) {
    const mk = (x: Cand, g: 'top' | 'base'): Pred => {
      const sc = scenarioFor(x, 30 / 365);
      return { d: todayKey, s: x.symbol, p: x.price, pp: Math.round(sc.probProfit * 1000) / 1000, b: Math.round(sc.base * 10000) / 10000, hi: Math.round(sc.bull * 10000) / 10000, lo: Math.round(sc.bear * 10000) / 10000, g };
    };
    const liquid = all.filter((x) => x.liq === 'large' || x.liq === 'mid');
    const top = [...liquid].sort((a, b) => b.rankKey - a.rankKey).slice(0, 20);
    const topSet = new Set(top.map((x) => x.symbol));
    // Vergleichsgruppe: gleichmäßig verteilte Stichprobe der übrigen liquiden Aktien (deterministisch nach Tag)
    const rest = liquid.filter((x) => !topSet.has(x.symbol));
    const offset = Number(todayKey.replace(/-/g, '')) % 7;
    const base = rest.filter((_, i) => (i + offset) % Math.max(1, Math.floor(rest.length / 40)) === 0).slice(0, 40);
    open.push(...top.map((x) => mk(x, 'top')), ...base.map((x) => mk(x, 'base')));
    track.since ??= todayKey;
  }

  track.openCount = open.length;
  track.generatedAt = Date.now();
  writeFileSync('data/predictions.json', JSON.stringify(open));
  writeFileSync('data/track.json', JSON.stringify(track));
  console.log(`Prognose-Zeugnis: ${open.length} offen, ${track.resolved} ausgewertet`);
}
