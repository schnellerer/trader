import { Fund } from '../api/fundamentals';
import { Bias, Candle } from '../types';
import { atr, rsi, sma } from './indicators';

export interface Plan {
  price: number;
  timing: 'now' | 'wait' | 'no';
  timingTitle: string;
  timingText: string;
  entryZone: [number, number] | null; // bevorzugte Einstiegszone bei „warten"
  stop: number;
  stopPct: number;
  t1: number; // Ziel 1: 2 × Risiko
  t2: number; // Ziel 2: Analysten-Kursziel bzw. 3 × Risiko
  t2Label: string;
  rr1: number;
  rr2: number;
  atr: number;
  extended: boolean;
  rsi: number;
  notes: string[];
}

/**
 * Konkreter Handelsplan aus Chart (Tageskerzen) und – falls vorhanden – Fundamentaldaten.
 * Stop: unter dem letzten Zwischentief, aber nicht enger als 1,2 und nicht weiter als 3,5 × ATR.
 * Ziele: 2 × Risiko (Ziel 1) und Analysten-Kursziel (Ziel 2).
 */
export function buildPlan(daily: Candle[], bias: Bias, fund?: Fund | null): Plan | null {
  if (daily.length < 60) return null;
  const closes = daily.map((c) => c.c);
  const price = closes[closes.length - 1];
  const a = atr(daily, 14);
  if (!isFinite(a) || a <= 0) return null;
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const swing = Math.min(...daily.slice(-15).map((c) => c.l)) - 0.25 * a;
  const stop = Math.min(price - 1.2 * a, Math.max(swing, price - 3.5 * a));
  const risk = price - stop;
  const t1 = price + 2 * risk;
  const analyst = fund?.tgt && fund.tgt > price * 1.02 ? fund.tgt : null;
  const t2 = analyst ?? price + 3 * risk;
  const ext50 = isFinite(s50) ? price / s50 - 1 : 0;
  const extended = ext50 > 0.15 || r > 72;
  const notes: string[] = [];

  let timing: Plan['timing'] = 'now';
  let title = 'Einstieg jetzt vertretbar';
  let text = 'Trend intakt, der Kurs ist nicht überdehnt. Mit Stop-Loss und passender Positionsgröße einsteigen.';
  let zone: Plan['entryZone'] = null;
  if (isFinite(s200) && price < s200) {
    timing = 'no';
    title = 'Kein Einstieg – Aufwärtstrend fehlt';
    text = `Der Kurs liegt unter der 200-Tage-Linie (${s200.toFixed(2)}). Gegen den langfristigen Trend zu kaufen ist riskant. Warte, bis der Kurs sie zurückerobert.`;
  } else if (bias === 'bearish') {
    timing = 'no';
    title = 'Kein Einstieg – Chart bärisch';
    text = 'Mehrere Trend- und Momentum-Signale sprechen gegen steigende Kurse. Besser abwarten.';
  } else if (extended) {
    timing = 'wait';
    title = 'Auf Rücksetzer warten';
    text = `Der Kurs ist ${ext50 > 0.15 ? `${(ext50 * 100).toFixed(0)} % über seiner 50-Tage-Linie` : `überkauft (RSI ${r.toFixed(0)})`}. Ein Rücksetzer in die Zone zwischen 20- und 50-Tage-Linie wäre der bessere Einstieg.`;
    zone = isFinite(s20) && isFinite(s50) ? [Math.min(s20, s50), Math.max(s20, s50)] : null;
  } else if (bias === 'neutral') {
    timing = 'wait';
    title = 'Abwarten – Chart ohne klaren Trend';
    text = 'Es gibt keinen klaren Aufwärtstrend. Besser auf eine Bestätigung (Ausbruch über das letzte Hoch) warten.';
  }
  if (risk / price > 0.12) notes.push(`Der Stop liegt ${((risk / price) * 100).toFixed(0)} % unter dem Kurs – die Aktie schwankt stark. Kleine Position wählen.`);
  if (analyst && analyst > t1 * 1.6) notes.push('Das Analysten-Kursziel ist sehr weit entfernt – realistischer ist erst Ziel 1.');
  if (fund?.tgt && fund.tgt < price) notes.push('Das Analysten-Kursziel liegt UNTER dem aktuellen Kurs – Analysten sehen die Aktie als teuer.');

  return {
    price,
    timing,
    timingTitle: title,
    timingText: text,
    entryZone: zone,
    stop,
    stopPct: risk / price,
    t1,
    t2,
    t2Label: analyst ? 'Analysten-Kursziel' : '3 × Risiko',
    rr1: 2,
    rr2: (t2 - price) / risk,
    atr: a,
    extended,
    rsi: r,
    notes,
  };
}
