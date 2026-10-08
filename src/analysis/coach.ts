import { fmtMoney, fmtPct } from '../format';
import { BotState, Trade } from '../types';
import { equityOf } from '../bots/sim';

export interface Finding {
  level: 'good' | 'warn' | 'bad' | 'info';
  title: string;
  text: string;
}

export interface CoachReport {
  stars: number; // 0 = noch nicht bewertbar
  label: string;
  findings: Finding[];
  stats: {
    closed: number;
    winRate: number;
    avgWin: number; // Durchschnitt der Gewinn-Trades (Rendite)
    avgLoss: number; // Durchschnitt der Verlust-Trades (Rendite, negativ)
    payoff: number; // Ø Gewinn / Ø Verlust
    expectancy: number; // erwartete Rendite pro Trade
    holdWin?: number; // Ø Haltedauer Gewinner (ms)
    holdLoss?: number;
  };
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const dur = (ms: number) => (ms < 3600_000 ? `${Math.round(ms / 60_000)} Min.` : ms < 2 * 86400_000 ? `${(ms / 3600_000).toFixed(1).replace('.', ',')} Std.` : `${(ms / 86400_000).toFixed(1).replace('.', ',')} Tage`);

/** Regelbasierte Analyse typischer Fehler – kein Zauber, jede Aussage ist nachrechenbar */
export function analyzeCoach(b: BotState): CoachReport {
  const closed = b.trades.filter((t) => t.pnl != null && t.pnlPct != null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const winRate = closed.length ? wins.length / closed.length : 0;
  const avgWin = mean(wins.map((t) => t.pnlPct!));
  const avgLoss = mean(losses.map((t) => t.pnlPct!));
  const payoff = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : avgWin > 0 ? 99 : 0;
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
  const hw = wins.filter((t) => t.heldMs != null).map((t) => t.heldMs!);
  const hl = losses.filter((t) => t.heldMs != null).map((t) => t.heldMs!);
  const stats = { closed: closed.length, winRate, avgWin, avgLoss, payoff, expectancy, holdWin: hw.length ? mean(hw) : undefined, holdLoss: hl.length ? mean(hl) : undefined };
  const f: Finding[] = [];

  if (closed.length < 5) {
    f.push({ level: 'info', title: 'Noch zu wenig Daten', text: `Erst ${closed.length} abgeschlossene Trades. Für ein belastbares Urteil brauchst du mindestens 20. Bis dahin: kleine Positionen, immer mit Stop-Loss.` });
  } else {
    f.push({
      level: expectancy > 0 ? 'good' : 'bad',
      title: expectancy > 0 ? 'Positive Erwartung pro Trade' : 'Negative Erwartung pro Trade',
      text: `Im Schnitt bringt ein Trade ${fmtPct(expectancy, 2)} (Trefferquote ${fmtPct(winRate, 0, false)}, Ø Gewinn ${fmtPct(avgWin, 1)}, Ø Verlust ${fmtPct(avgLoss, 1)}). ${
        expectancy > 0 ? 'Solange das so bleibt, arbeitet die Mathematik für dich.' : 'Auf Dauer verlierst du so Geld – egal wie sich einzelne Trades anfühlen.'
      }`,
    });
    if (payoff < 1 && winRate < 0.6)
      f.push({ level: 'bad', title: 'Verluste größer als Gewinne', text: `Dein Ø Verlust (${fmtPct(avgLoss, 1)}) ist größer als dein Ø Gewinn (${fmtPct(avgWin, 1)}) bei nur ${fmtPct(winRate, 0, false)} Treffern. Tipp: Verluste früher begrenzen (Stop-Loss ca. 5–8 %) und Gewinne laufen lassen.` });
    else if (payoff >= 1.5) f.push({ level: 'good', title: 'Gutes Chance-Risiko-Verhältnis', text: `Dein Ø Gewinn ist ${payoff.toFixed(1).replace('.', ',')}-mal so groß wie dein Ø Verlust. So können auch 40 % Treffer reichen.` });
    if (stats.holdWin != null && stats.holdLoss != null && wins.length >= 3 && losses.length >= 3 && stats.holdLoss > 1.5 * stats.holdWin)
      f.push({ level: 'bad', title: 'Du hältst Verlierer länger als Gewinner', text: `Gewinner verkaufst du nach Ø ${dur(stats.holdWin)}, Verlierer hältst du Ø ${dur(stats.holdLoss)}. Das ist der häufigste Anfängerfehler („Disposition-Effekt"): Man hofft, dass Verluste zurückkommen. Tipp: Vorab einen Stop festlegen und ihn einhalten.` });
    if (avgWin > 0 && avgLoss < 0 && avgWin < 0.5 * Math.abs(avgLoss))
      f.push({ level: 'warn', title: 'Gewinne zu früh mitgenommen', text: `Dein Ø Gewinn (${fmtPct(avgWin, 1)}) ist sehr klein gegenüber deinem Ø Verlust (${fmtPct(avgLoss, 1)}). Versuche, Gewinne mit einem nachgezogenen Stop länger laufen zu lassen.` });
    const worst = [...closed].sort((a, c) => a.pnlPct! - c.pnlPct!)[0];
    if (worst && worst.pnlPct! < -0.1) f.push({ level: 'warn', title: 'Ein Verlust über 10 %', text: `${worst.symbol}: ${fmtPct(worst.pnlPct!, 1)} (${fmtMoney(worst.pnl!)}). Ein einzelner großer Verlust braucht danach +${(((1 / (1 + worst.pnlPct!)) - 1) * 100).toFixed(0)} % zum Ausgleich. Ein fester Stop-Loss hätte das begrenzt.` });
  }

  // Depot-Struktur (auch ohne abgeschlossene Trades sinnvoll)
  const eq = equityOf(b);
  if (b.positions.length) {
    const top = [...b.positions].sort((a, c) => c.qty * c.lastPrice - a.qty * a.lastPrice)[0];
    const share = (top.qty * top.lastPrice) / eq;
    if (share > 0.35) f.push({ level: 'warn', title: 'Zu viel in einer Aktie', text: `${top.symbol} macht ${fmtPct(share, 0, false)} deines Depots aus. Profis begrenzen eine Position meist auf 10–20 %, damit ein Ausreißer nicht alles zerstört.` });
    if (b.positions.length > 12) f.push({ level: 'info', title: 'Sehr breit gestreut', text: `${b.positions.length} Positionen sind schwer im Blick zu behalten. 5 bis 10 reichen für gute Streuung.` });
  }
  const cashShare = b.cash / eq;
  if (b.positions.length && cashShare < 0.03) f.push({ level: 'warn', title: 'Kein Cash-Puffer', text: 'Du bist fast voll investiert. Ohne Puffer kannst du keine Chancen nutzen und musst bei Rückschlägen eventuell zu schlechten Preisen verkaufen.' });
  if (cashShare > 0.85 && b.trades.length > 0) f.push({ level: 'info', title: 'Viel Cash', text: `${fmtPct(cashShare, 0, false)} liegen ungenutzt. Das schützt, aber bringt keine Rendite – okay, wenn du bewusst auf gute Gelegenheiten wartest.` });

  // Handelshäufigkeit & Gebühren
  if (b.trades.length >= 6) {
    const days = new Set(b.trades.map((t: Trade) => new Date(t.t).toDateString())).size;
    const perDay = b.trades.length / Math.max(1, days);
    const fees = b.trades.reduce((s, t) => s + t.fee, 0);
    const gross = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    if (perDay > 8) f.push({ level: 'warn', title: 'Sehr viele Trades', text: `Ø ${perDay.toFixed(1).replace('.', ',')} Trades pro Handelstag. Häufiges Handeln kostet Gebühren und führt oft zu Kurzschlussentscheidungen.` });
    if (gross > 0 && fees > 0.25 * gross) f.push({ level: 'warn', title: 'Gebühren fressen Gewinne', text: `Gebühren (${fmtMoney(fees)}) machen ${fmtPct(fees / gross, 0, false)} deiner Brutto-Gewinne aus. Weniger, dafür überlegtere Trades helfen.` });
  }

  // Verlustserie
  const lastThree = closed.slice(0, 3);
  if (lastThree.length === 3 && lastThree.every((t) => (t.pnl ?? 0) <= 0))
    f.push({ level: 'warn', title: '3 Verluste in Folge', text: 'Nach einer Serie neigen Menschen zu „Rache-Trades" mit größeren Einsätzen. Besser: eine Pause, kleinere Positionen, Plan prüfen.' });

  // Bewertung
  let stars = 0;
  let label = 'Noch nicht bewertbar';
  if (closed.length >= 5) {
    stars = 3;
    if (expectancy > 0 && closed.length >= 10) stars++;
    if (payoff >= 1.2 && expectancy > 0) stars++;
    stars -= f.filter((x) => x.level === 'bad').length;
    stars -= f.filter((x) => x.level === 'warn').length >= 2 ? 1 : 0;
    stars = Math.max(1, Math.min(5, stars));
    label = ['', 'Viel Luft nach oben', 'Ausbaufähig', 'Solide', 'Gut', 'Sehr stark'][stars];
  }
  return { stars, label, findings: f, stats };
}

/** Wochenbilanz der letzten 7 Tage */
export function weekSummary(b: BotState, now = Date.now()) {
  const since = now - 7 * 86400_000;
  const trades = b.trades.filter((t) => t.t >= since);
  const closed = trades.filter((t) => t.pnl != null);
  const before = [...b.equity].reverse().find((e) => e.t <= since)?.v ?? b.equity[0]?.v ?? b.startCapital;
  const change = equityOf(b) - before;
  const best = [...closed].sort((a, c) => (c.pnl ?? 0) - (a.pnl ?? 0))[0];
  const worst = [...closed].sort((a, c) => (a.pnl ?? 0) - (c.pnl ?? 0))[0];
  return { trades: trades.length, closed: closed.length, change, pct: before > 0 ? change / before : 0, best, worst };
}
