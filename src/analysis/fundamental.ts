import { Bias } from '../types';
import { Fund } from '../api/fundamentals';

export interface Component {
  key: 'value' | 'growth' | 'quality' | 'safety' | 'analysts';
  label: string;
  score: number; // 0–100
  level: 'good' | 'ok' | 'bad' | 'na';
  lines: { text: string; v: number }[]; // v: +1 gut, 0 neutral, −1 schlecht
}

export interface FundScore {
  total: number; // 0–100
  grade: string;
  components: Component[];
  flags: string[];
  upside: number | null; // Abstand zum Analysten-Kursziel
}

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d).replace('.', ',')} %`;
const num = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const to100 = (s: number) => Math.round(((clamp(s, -2, 2) + 2) / 4) * 100);
const lvl = (s: number): Component['level'] => (s >= 60 ? 'good' : s >= 40 ? 'ok' : 'bad');

/**
 * Bewertet ein Unternehmen aus Bewertung, Wachstum, Qualität, Bilanz und Analysten-Meinung.
 * Alle Schwellen sind grobe Faustregeln aus der Praxis – keine Wissenschaft. Branchen unterscheiden sich stark
 * (Banken haben z. B. immer hohe „Verschuldung").
 */
export function scoreFund(f: Fund, price?: number): FundScore {
  const price_ = price ?? f.price;
  const financial = /financ|bank|insur|real estate/i.test(`${f.sec ?? ''} ${f.ind ?? ''}`);
  const comps: Component[] = [];
  const flags: string[] = [];

  // ---- Bewertung ----
  {
    const lines: Component['lines'] = [];
    let s = 0;
    let n = 0;
    const pe = f.fpe && f.fpe > 0 ? f.fpe : f.pe && f.pe > 0 ? f.pe : undefined;
    if (pe != null) {
      const v = pe < 12 ? 2 : pe < 20 ? 1 : pe < 30 ? 0 : pe < 45 ? -1 : -2;
      s += v;
      n++;
      lines.push({ text: `KGV ${num(pe)}${f.fpe ? ' (erwartet)' : ''} – ${v >= 1 ? 'günstig bis fair bewertet' : v === 0 ? 'durchschnittlich bis leicht teuer' : 'teuer'}. Der breite Markt liegt langfristig bei ca. 16–22.`, v: Math.sign(v) });
    } else if (f.mar != null && f.mar < 0) {
      // nur bei belegbarem Verlust (negative Marge) – fehlende Daten werden NICHT als Verlust gewertet
      s -= 1;
      n++;
      lines.push({ text: 'Kein KGV, weil das Unternehmen aktuell keinen Gewinn macht – die Bewertung ist reine Hoffnung auf künftige Gewinne.', v: -1 });
      flags.push('Verlustbringend');
    }
    if (f.peg != null && f.peg > 0) {
      const v = f.peg < 1 ? 1 : f.peg < 2 ? 0 : -1;
      s += v;
      n++;
      lines.push({ text: `PEG ${num(f.peg, 2)} (KGV im Verhältnis zum Gewinnwachstum) – ${f.peg < 1 ? 'Wachstum ist günstig eingepreist' : f.peg < 2 ? 'angemessen' : 'Wachstum ist teuer bezahlt'}.`, v });
    }
    if (f.pb != null && f.pb > 0 && !financial) {
      const v = f.pb < 1.5 ? 1 : f.pb < 6 ? 0 : -1;
      s += v * 0.5;
      lines.push({ text: `Kurs/Buchwert ${num(f.pb)} – ${f.pb < 1.5 ? 'nahe am Substanzwert' : f.pb < 6 ? 'üblich' : 'weit über dem Buchwert (typisch für Wachstums-/Marken-Firmen)'}.`, v });
    }
    if (n === 0) comps.push({ key: 'value', label: 'Bewertung', score: 50, level: 'na', lines: [{ text: 'Keine Bewertungsdaten verfügbar.', v: 0 }] });
    else {
      const sc = to100(s / Math.max(1, n));
      comps.push({ key: 'value', label: 'Bewertung', score: sc, level: lvl(sc), lines });
    }
  }

  // ---- Wachstum ----
  {
    const lines: Component['lines'] = [];
    let s = 0;
    let n = 0;
    const g = (name: string, v: number | undefined, hi: number, mid: number) => {
      if (v == null) return;
      const sc = v > hi ? 2 : v > mid ? 1 : v > 0 ? 0 : v > -0.1 ? -1 : -2;
      s += sc;
      n++;
      lines.push({ text: `${name} ${v >= 0 ? '+' : ''}${pct(v)} – ${sc >= 1 ? 'starkes Wachstum' : sc === 0 ? 'moderat' : 'rückläufig'}.`, v: Math.sign(sc) });
      if (sc <= -1 && name.startsWith('Umsatz')) flags.push('Umsatz schrumpft');
    };
    g('Umsatzwachstum', f.rev, 0.2, 0.08);
    g('Gewinnwachstum', f.eg, 0.25, 0.08);
    g('Erwartetes Gewinnwachstum nächstes Jahr', f.epsNext, 0.2, 0.08);
    if (n === 0) comps.push({ key: 'growth', label: 'Wachstum', score: 50, level: 'na', lines: [{ text: 'Keine Wachstumsdaten verfügbar.', v: 0 }] });
    else {
      const sc = to100(s / n);
      comps.push({ key: 'growth', label: 'Wachstum', score: sc, level: lvl(sc), lines });
    }
  }

  // ---- Qualität ----
  {
    const lines: Component['lines'] = [];
    let s = 0;
    let n = 0;
    if (f.mar != null) {
      const v = f.mar > 0.2 ? 2 : f.mar > 0.1 ? 1 : f.mar > 0.03 ? 0 : f.mar > 0 ? -1 : -2;
      s += v;
      n++;
      lines.push({ text: `Nettomarge ${pct(f.mar)} – ${v >= 1 ? 'sehr profitabel' : v === 0 ? 'solide' : v === -1 ? 'dünn' : 'verlustbringend'}. Von 100 € Umsatz bleiben ${num(f.mar * 100, 0)} € Gewinn.`, v: Math.sign(v) });
    }
    if (f.roe != null) {
      const v = f.roe > 0.2 ? 1 : f.roe > 0.08 ? 0 : -1;
      s += v;
      n++;
      lines.push({ text: `Eigenkapitalrendite ${pct(f.roe)} – ${v > 0 ? 'hoch (gutes Geschäftsmodell oder viel Fremdkapital)' : v === 0 ? 'okay' : 'schwach'}.`, v });
    }
    if (f.fcf != null && f.mcap) {
      const y = f.fcf / f.mcap;
      const v = y > 0.04 ? 1 : y > 0 ? 0 : -1;
      s += v;
      n++;
      lines.push({ text: `Freier Cashflow ${f.fcf >= 0 ? 'positiv' : 'negativ'} (${pct(y, 1)} der Marktkapitalisierung) – ${v > 0 ? 'das Unternehmen erwirtschaftet reichlich Bargeld' : v === 0 ? 'knapp positiv' : 'es verbrennt Geld'}.`, v });
      if (v < 0) flags.push('Negativer Cashflow');
    }
    if (n === 0) comps.push({ key: 'quality', label: 'Qualität', score: 50, level: 'na', lines: [{ text: 'Keine Qualitätsdaten verfügbar.', v: 0 }] });
    else {
      const sc = to100(s / n);
      comps.push({ key: 'quality', label: 'Qualität', score: sc, level: lvl(sc), lines });
    }
  }

  // ---- Bilanz / Sicherheit ----
  {
    const lines: Component['lines'] = [];
    let s = 0;
    let n = 0;
    if (f.de != null && !financial) {
      const v = f.de < 0.5 ? 1 : f.de < 1.5 ? 0 : f.de < 3 ? -1 : -2;
      s += v;
      n++;
      lines.push({ text: `Verschuldung/Eigenkapital ${num(f.de, 2)} – ${v > 0 ? 'wenig Schulden' : v === 0 ? 'normal' : 'hoch verschuldet'}.`, v: Math.sign(v) });
      if (v <= -1) flags.push('Hohe Verschuldung');
    }
    if (f.cr != null && !financial) {
      const v = f.cr > 1.5 ? 1 : f.cr >= 1 ? 0 : -1;
      s += v;
      n++;
      lines.push({ text: `Liquidität (Current Ratio) ${num(f.cr, 2)} – ${v > 0 ? 'kurzfristige Rechnungen gut gedeckt' : v === 0 ? 'ausreichend' : 'knapp: kurzfristige Schulden übersteigen das Umlaufvermögen'}.`, v });
    }
    if (f.beta != null) {
      const v = f.beta < 0.9 ? 1 : f.beta < 1.3 ? 0 : -1;
      s += v * 0.5;
      lines.push({ text: `Beta ${num(f.beta, 2)} – ${f.beta < 0.9 ? 'schwankt weniger als der Markt' : f.beta < 1.3 ? 'schwankt etwa wie der Markt' : 'schwankt deutlich stärker als der Markt'}.`, v });
    }
    if (f.mcap != null && f.mcap < 2e9) flags.push('Kleines Unternehmen (unter 2 Mrd.)');
    if (f.div != null && f.div > 0 && f.pay != null && f.pay > 1) flags.push('Dividende übersteigt den Gewinn');
    if (n === 0 && f.beta == null) comps.push({ key: 'safety', label: 'Bilanz & Risiko', score: 50, level: 'na', lines: [{ text: financial ? 'Bei Banken/Versicherern sind Schulden-Kennzahlen nicht aussagekräftig.' : 'Keine Bilanzdaten verfügbar.', v: 0 }] });
    else {
      const sc = to100(s / Math.max(1, n + (f.beta != null ? 0.5 : 0)));
      comps.push({ key: 'safety', label: 'Bilanz & Risiko', score: sc, level: lvl(sc), lines });
    }
  }

  // ---- Analysten ----
  let upside: number | null = null;
  {
    const lines: Component['lines'] = [];
    let s = 0;
    let n = 0;
    if (f.tgt != null && price_ && (f.na ?? 0) >= 3) {
      upside = f.tgt / price_ - 1;
      const v = upside > 0.2 ? 2 : upside > 0.08 ? 1 : upside > -0.03 ? 0 : upside > -0.12 ? -1 : -2;
      s += v;
      n++;
      lines.push({ text: `Kursziel der Analysten Ø ${num(f.tgt, 2)} (${upside >= 0 ? '+' : ''}${pct(upside)} zum Kurs; Spanne ${f.tlo != null ? num(f.tlo, 0) : '?'}–${f.thi != null ? num(f.thi, 0) : '?'}, ${f.na} Analysten).`, v: Math.sign(v) });
      if (upside < -0.03) flags.push('Kurs über dem Analysten-Kursziel');
    }
    if (f.rec != null && (f.na ?? 0) >= 3) {
      const v = f.rec < 2 ? 1 : f.rec <= 2.8 ? 0 : -1;
      s += v;
      n++;
      lines.push({ text: `Empfehlung ${num(f.rec, 1)} auf einer Skala von 1 (starker Kauf) bis 5 (Verkauf) – ${f.rec < 2 ? 'überwiegend Kauf' : f.rec <= 2.8 ? 'eher Halten' : 'eher skeptisch'}.`, v });
    }
    if (n === 0) comps.push({ key: 'analysts', label: 'Analysten', score: 50, level: 'na', lines: [{ text: 'Zu wenige Analysten-Einschätzungen (ab 3 aussagekräftig).', v: 0 }] });
    else {
      const sc = to100(s / n);
      comps.push({ key: 'analysts', label: 'Analysten', score: sc, level: lvl(sc), lines });
    }
  }

  const w = { value: 0.25, growth: 0.25, quality: 0.25, safety: 0.1, analysts: 0.15 } as const;
  let tw = 0;
  let sum = 0;
  comps.forEach((c) => {
    if (c.level === 'na') return;
    tw += w[c.key];
    sum += c.score * w[c.key];
  });
  const total = tw > 0 ? Math.round(sum / tw) : 50;
  const grade = total >= 75 ? 'A' : total >= 62 ? 'B' : total >= 48 ? 'C' : total >= 35 ? 'D' : 'E';
  return { total, grade, components: comps, flags, upside };
}

export const gradeText = (g: string) =>
  ({ A: 'Hervorragend', B: 'Gut', C: 'Durchschnitt', D: 'Schwach', E: 'Kritisch' } as Record<string, string>)[g] ?? '';

// ---------- Gesamturteil: Fundament × Chart ----------

export interface Verdict {
  label: string;
  level: 'great' | 'good' | 'wait' | 'speculative' | 'avoid';
  headline: string;
  reasons: string[];
}

export function combineVerdict(fund: FundScore | null, techBias: Bias, techScore: number, extra?: { extended?: boolean; rsi?: number; earningsSoon?: boolean }): Verdict {
  const reasons: string[] = [];
  const tech = techBias === 'bullish' ? 'Chart bullisch' : techBias === 'bearish' ? 'Chart bärisch' : 'Chart neutral';
  if (extra?.earningsSoon) reasons.push('Quartalszahlen stehen kurz bevor – Kurse springen dabei oft stark; sinnvoll ist, das Ergebnis abzuwarten.');
  if (extra?.extended) reasons.push('Der Kurs ist weit über seinen Durchschnitten gelaufen – ein Rücksetzer wäre ein besserer Einstieg.');
  if (!fund) {
    return {
      label: techBias === 'bullish' ? 'Nur Chart-Signal' : techBias === 'bearish' ? 'Chart schwach' : 'Unklar',
      level: techBias === 'bullish' ? 'wait' : techBias === 'bearish' ? 'avoid' : 'wait',
      headline: `${tech}. Fundamentaldaten fehlen – ohne sie ist das Urteil unvollständig.`,
      reasons: [...reasons, 'Für diese Aktie liegen keine Fundamentaldaten vor (z. B. ETF, Index oder zu klein). Entscheide vorsichtig und mit kleiner Position.'],
    };
  }
  const f = fund.total;
  reasons.push(`Fundament ${f}/100 (Note ${fund.grade}: ${gradeText(fund.grade)}), ${tech} (Score ${techScore > 0 ? '+' : ''}${techScore}).`);
  fund.flags.forEach((x) => reasons.push(`Achtung: ${x}.`));
  if (f >= 62 && techBias === 'bullish') {
    const ok = !extra?.extended && !extra?.earningsSoon && (extra?.rsi ?? 50) < 75;
    return {
      label: ok ? 'Starke Kaufidee' : 'Gute Firma im Aufwärtstrend – Einstieg abwarten',
      level: ok ? 'great' : 'wait',
      headline: ok ? 'Solides Unternehmen UND intakter Aufwärtstrend – die stärkste Kombination.' : 'Fundament und Trend passen, aber der Zeitpunkt ist gerade nicht ideal (überdehnt oder Zahlen voraus).',
      reasons,
    };
  }
  if (f >= 62) return { label: 'Gute Firma – Timing abwarten', level: 'wait', headline: 'Das Unternehmen überzeugt, der Chart noch nicht. Auf Trendbestätigung oder einen Rücksetzer warten.', reasons };
  if (f >= 48 && techBias === 'bullish') return { label: 'Trend ja, Fundament mittel', level: 'good', headline: 'Der Chart läuft, das Unternehmen ist Durchschnitt. Nur kleine Position und Stop-Loss.', reasons };
  if (f >= 48) return { label: 'Abwarten', level: 'wait', headline: 'Weder Fundament noch Chart überzeugen. Es gibt Besseres.', reasons };
  if (techBias === 'bullish') return { label: 'Spekulativ', level: 'speculative', headline: 'Der Kurs steigt, aber das Fundament ist schwach. Das ist Momentum ohne Substanz – riskant, nur mit kleinem Einsatz.', reasons };
  return { label: 'Meiden', level: 'avoid', headline: 'Schwaches Fundament und schwacher Chart. Kein Grund zu kaufen.', reasons };
}
