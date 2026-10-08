/**
 * Risiko-Regler 0–100 % je Bot. 50 % entspricht dem bisherigen Verhalten der Bots.
 *  0 %   = Bot kauft nichts Neues (nur noch Verkäufe laufen weiter)
 *  <50 % = weniger Geld im Markt, kleinere Positionen, engere Stops, strengere Einstiegsregeln
 *  >50 % = größere/konzentriertere Positionen, weitere Stops, lockerere Einstiegsregeln
 * Der Regler wirkt nur auf neue Käufe; bestehende Positionen laufen mit ihren alten Stops weiter.
 */
export const DEFAULT_RISK = 50;

/** Stückweise lineare Kurve durch die Punkte bei 0 %, 50 % und 100 % */
const pw = (r: number, v0: number, v50: number, v100: number) => (r <= 50 ? v0 + ((v50 - v0) * r) / 50 : v50 + ((v100 - v50) * (r - 50)) / 50);
export const clampRisk = (r: number) => Math.max(0, Math.min(100, Math.round(r)));

/** Wie viel Prozent des Depots höchstens investiert sein dürfen (ab 50 % voll, darunter anteilig) */
export const maxInvested = (r: number) => Math.min(1, clampRisk(r) / 50);

export function dayRisk(rIn: number) {
  const r = clampRisk(rIn);
  return {
    maxInvested: maxInvested(r),
    share: pw(r, 0.1, 0.2, 0.3), // Anteil des Depots pro Trade
    maxPositions: Math.round(pw(r, 2, 5, 8)),
    stopMul: pw(r, 0.7, 1, 1.4), // Faktor auf den Stop-Abstand
    minMom: pw(r, 0.0015, 0.0005, 0.0002), // nötiges 10-Minuten-Momentum
    dayLoss: pw(r, 0.01, 0.015, 0.03), // Tages-Verlustlimit
  };
}

export function longRisk(rIn: number) {
  const r = clampRisk(rIn);
  return {
    maxInvested: maxInvested(r),
    positions: Math.round(pw(r, 12, 8, 5)),
    stopLoss: pw(r, 0.1, 0.15, 0.25),
    minRs: Math.round(pw(r, 85, 70, 55)),
    maxVol: pw(r, 0.35, 0.6, 0.9),
  };
}

export function goldRisk(rIn: number) {
  const r = clampRisk(rIn);
  return {
    maxInvested: maxInvested(r),
    riskPerTrade: pw(r, 0.0025, 0.01, 0.025), // Anteil des Depots, der pro Trade riskiert wird
  };
}

export type BotKey = 'day' | 'long' | 'gold';
const pc = (v: number, d = 0) => `${(v * 100).toFixed(d).replace('.', ',')} %`;

/** Klartext: Was bedeutet diese Einstellung? */
export function describeRisk(bot: BotKey, rIn: number): { title: string; lines: string[] } {
  const r = clampRisk(rIn);
  const title = r === 0 ? 'Pausiert – keine neuen Käufe' : r < 25 ? 'Sehr vorsichtig' : r < 45 ? 'Vorsichtig' : r <= 55 ? 'Standard' : r < 75 ? 'Offensiv' : r < 90 ? 'Sehr offensiv' : 'Maximal aggressiv';
  if (bot === 'day') {
    const d = dayRisk(r);
    return { title, lines: [`Höchstens ${pc(d.maxInvested)} des Depots investiert`, `Pro Trade ${pc(d.share)} des Depots, max. ${d.maxPositions} Positionen`, `Stop-Abstand ×${d.stopMul.toFixed(1).replace('.', ',')}, Tages-Verlustlimit ${pc(d.dayLoss, 1)}`] };
  }
  if (bot === 'long') {
    const l = longRisk(r);
    return { title, lines: [`Höchstens ${pc(l.maxInvested)} des Depots investiert`, `Bis zu ${l.positions} Positionen, Stop-Loss −${pc(l.stopLoss)}`, `Nur Aktien mit Relative Stärke ≥ ${l.minRs} und Schwankung ≤ ${pc(l.maxVol)}`] };
  }
  const g = goldRisk(r);
  return { title, lines: [`Höchstens ${pc(g.maxInvested)} des Depots im Markt`, `Pro Trade wird ${pc(g.riskPerTrade, 2)} des Depots riskiert (bis zum Stop-Loss)`] };
}
