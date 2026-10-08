import { BotState } from '../types';
import { mean, normCdf, stdev } from './indicators';

export interface LuckResult {
  enough: boolean;
  basis: 'trades' | 'days' | 'none';
  n: number;
  pLuck: number; // Wahrscheinlichkeit, dass ein Null-Können-Trader mindestens so gut wäre
  verdict: string;
  level: 'good' | 'warn' | 'info';
  note: string;
}

/** Stabiler Zufallsgenerator (damit die Anzeige nicht flackert) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * „Glück oder Können?" – Zufallstest.
 *  Mit ≥ 10 abgeschlossenen Trades: Bootstrap. Die Trade-Renditen werden um ihren Mittelwert verschoben (= Trader ohne Können),
 *  dann 4.000-mal gezogen. Anteil der Ziehungen, die den tatsächlichen Durchschnitt erreichen = pLuck.
 *  Sonst (≥ 5 Tage Verlauf): t-Test der Tagesrenditen.
 */
export function luckTest(b: BotState): LuckResult {
  const rets = b.trades.filter((t) => t.pnlPct != null).map((t) => t.pnlPct!);
  if (rets.length >= 10) {
    const m = mean(rets);
    const centered = rets.map((r) => r - m);
    const rand = rng(rets.length * 7919 + Math.round(m * 1e6));
    let hits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0; k < centered.length; k++) s += centered[Math.floor(rand() * centered.length)];
      if (s / centered.length >= m) hits++;
    }
    return describe(hits / N, rets.length, 'trades', `${rets.length} abgeschlossene Trades`);
  }
  // Tagesrenditen aus dem Depotverlauf
  const byDay = new Map<string, number>();
  b.equity.forEach((e) => byDay.set(new Date(e.t).toISOString().slice(0, 10), e.v));
  const vals = [...byDay.values()];
  const dr: number[] = [];
  for (let i = 1; i < vals.length; i++) dr.push(vals[i] / vals[i - 1] - 1);
  if (dr.length < 5) return { enough: false, basis: 'none', n: dr.length, pLuck: 1, verdict: 'Noch zu früh', level: 'info', note: 'Für den Zufallstest braucht es mindestens 10 abgeschlossene Trades oder 5 Handelstage Verlauf.' };
  const sd = stdev(dr);
  if (sd === 0) return { enough: false, basis: 'days', n: dr.length, pLuck: 1, verdict: 'Keine Schwankung', level: 'info', note: 'Das Depot hat sich noch nicht bewegt.' };
  const z = mean(dr) / (sd / Math.sqrt(dr.length));
  return describe(1 - normCdf(z), dr.length, 'days', `${dr.length} Tage Verlauf`);
}

function describe(p: number, n: number, basis: 'trades' | 'days', what: string): LuckResult {
  const small = (basis === 'trades' ? n < 30 : n < 20);
  let verdict: string;
  let level: LuckResult['level'];
  if (p < 0.05) {
    verdict = 'Mit Zufall kaum zu erklären';
    level = 'good';
  } else if (p < 0.2) {
    verdict = 'Eher Können als Glück – aber unsicher';
    level = 'info';
  } else if (p < 0.5) {
    verdict = 'Kann gut Zufall sein';
    level = 'warn';
  } else {
    verdict = 'Von Zufall nicht zu unterscheiden';
    level = 'warn';
  }
  return {
    enough: true,
    basis,
    n,
    pLuck: p,
    verdict,
    level,
    note:
      `Auf Basis von ${what}: In ${(p * 100).toFixed(0)} % von 4.000 Zufalls-Durchläufen (Trader ohne Können, gleiche Trade-Größen) wäre das Ergebnis mindestens so gut gewesen.` +
      (small ? ' Achtung: Die Datenbasis ist noch klein – das Urteil kann sich schnell ändern. Seriös wird es ab ca. 30 Trades.' : ''),
  };
}
