import { DividendEvent } from '../api/yahoo';
import { Fund } from '../api/fundamentals';

export interface DivStats {
  years: { y: number; sum: number }[]; // volle Kalenderjahre, älteste zuerst
  ttm: number; // Summe der letzten 12 Monate
  perYear: number; // typische Zahlungen pro Jahr (1, 2, 4, 12)
  cagr: number | null; // Wachstum der Jahresdividende (bis 5 Jahre)
  streak: number; // Jahre in Folge ohne Kürzung (Jahressumme ≥ 98 % des Vorjahres)
  raises: number; // davon echte Steigerungen
  cut: boolean; // letzte volle Jahressumme deutlich unter dem Vorjahr (≥ 10 % weniger)
  cutYear: number | null; // letztes Jahr mit einer Kürzung (≥ 10 % weniger als im Vorjahr), innerhalb der letzten 6 Jahre
  first: number | null; // erstes Jahr mit Daten
}

/** Kennzahlen zur Dividendenhistorie – reine Rechnung, läuft in der App und auf dem Server */
export function divStats(events: DividendEvent[], now = Date.now()): DivStats {
  const thisYear = new Date(now).getUTCFullYear();
  const byYear = new Map<number, number>();
  events.forEach((e) => {
    const y = new Date(e.t).getUTCFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + e.amount);
  });
  const ttm = events.filter((e) => e.t > now - 365 * 86400_000).reduce((s, e) => s + e.amount, 0);
  const years = [...byYear.entries()]
    .filter(([y]) => y < thisYear) // laufendes Jahr ist unvollständig
    .sort((a, b) => a[0] - b[0])
    .map(([y, sum]) => ({ y, sum }));
  // das erste Jahr ist oft unvollständig (Historie beginnt mitten im Jahr) → für Wachstum weglassen
  const solid = years.length > 2 ? years.slice(1) : years;
  let streak = 0;
  let raises = 0;
  for (let i = solid.length - 1; i > 0; i--) {
    if (solid[i].sum >= solid[i - 1].sum * 0.98) {
      streak++;
      if (solid[i].sum > solid[i - 1].sum * 1.005) raises++;
    } else break;
  }
  let cagr: number | null = null;
  if (solid.length >= 3) {
    const last = solid[solid.length - 1];
    const base = solid[Math.max(0, solid.length - 6)];
    const n = last.y - base.y;
    if (n >= 2 && base.sum > 0) cagr = Math.pow(last.sum / base.sum, 1 / n) - 1;
  }
  const lastTwo = solid.slice(-2);
  const cut = lastTwo.length === 2 && lastTwo[1].sum < lastTwo[0].sum * 0.9;
  let cutYear: number | null = null;
  for (let i = solid.length - 1; i > 0 && solid.length - i <= 6; i--) {
    if (solid[i].sum < solid[i - 1].sum * 0.9) {
      cutYear = solid[i].y;
      break;
    }
  }
  const recent = events.filter((e) => e.t > now - 400 * 86400_000).length;
  const perYear = recent >= 10 ? 12 : recent >= 3 ? 4 : recent === 2 ? 2 : 1;
  return { years, ttm, perYear, cagr, streak, raises, cut, cutYear, first: years.length ? years[0].y : null };
}

export interface DivQuality {
  score: number; // 0–100
  label: string;
  level: 'good' | 'ok' | 'bad';
  lines: { text: string; v: number }[];
  trap: boolean; // möglicher „Dividendenfalle"-Verdacht
}

/**
 * Wie sicher ist die Dividende? Nach Faustregeln: Ausschüttungsquote, Historie, Cashflow, Gesamtqualität der Firma.
 * Eine sehr hohe Rendite ist oft ein Warnsignal: Der Kurs ist gefallen, weil der Markt eine Kürzung erwartet.
 */
export function divQuality(f: Partial<Fund>, st: DivStats | null, fundScore?: number | null): DivQuality {
  const lines: DivQuality['lines'] = [];
  let s = 50;
  const y = f.div ?? 0;
  const reit = /real estate|reit/i.test(`${f.sec ?? ''} ${f.ind ?? ''}`);
  if (f.pay != null && f.pay > 0) {
    if (reit) {
      // Immobilien-Gesellschaften (REITs) schütten gesetzlich fast alles aus und rechnen nach Cashflow (FFO), nicht nach Gewinn
      lines.push({ text: `Ausschüttungsquote ${(f.pay * 100).toFixed(0)} % laut Gewinn – bei Immobilien-Firmen (REITs) nicht aussagekräftig, weil sie nach Cashflow (FFO) ausschütten. Prüfe die FFO-Quote bei der Firma.`, v: 0 });
    } else {
      const v = f.pay <= 0.6 ? 1 : f.pay <= 0.85 ? 0 : -1;
      s += f.pay <= 0.35 ? 12 : f.pay <= 0.6 ? 18 : f.pay <= 0.85 ? 4 : f.pay <= 1 ? -12 : -28;
      lines.push({ text: `Ausschüttungsquote ${(f.pay * 100).toFixed(0)} % – ${f.pay <= 0.6 ? 'komfortabel, es bleibt viel Gewinn im Unternehmen' : f.pay <= 0.85 ? 'hoch, wenig Spielraum' : f.pay <= 1 ? 'fast der ganze Gewinn wird ausgeschüttet' : 'mehr als der ganze Gewinn – nicht dauerhaft haltbar'}.`, v });
    }
  }
  if (st) {
    if (st.streak >= 5) {
      s += 14;
      lines.push({ text: `${st.streak} Jahre in Folge nicht gekürzt${st.raises ? `, davon ${st.raises}× erhöht` : ''} – verlässlicher Zahler.`, v: 1 });
    } else if (st.streak >= 2) {
      s += 5;
      lines.push({ text: `${st.streak} Jahre ohne Kürzung.`, v: 0 });
    }
    if (st.cagr != null) {
      s += st.cagr > 0.06 ? 10 : st.cagr > 0 ? 4 : st.cagr > -0.03 ? -4 : -14;
      lines.push({ text: `Dividendenwachstum ${st.cagr >= 0 ? '+' : ''}${(st.cagr * 100).toFixed(1).replace('.', ',')} % pro Jahr (ca. 5 Jahre).`, v: st.cagr > 0.02 ? 1 : st.cagr < -0.01 ? -1 : 0 });
    }
    if (st.cut) {
      s -= 22;
      lines.push({ text: 'Die Dividende wurde zuletzt gekürzt (Jahressumme mind. 10 % niedriger als im Vorjahr).', v: -1 });
    } else if (st.cutYear != null) {
      s -= 14;
      lines.push({ text: `Die Dividende wurde ${st.cutYear} gekürzt (mind. 10 % weniger als im Vorjahr) – die Firma hat gezeigt, dass sie kürzt, wenn es eng wird.`, v: -1 });
    }
    if (!st.years.length) lines.push({ text: 'Zu wenig Dividendenhistorie für eine Einschätzung.', v: 0 });
  }
  if (f.fcf != null) {
    s += f.fcf > 0 ? 6 : -14;
    lines.push({ text: `Freier Cashflow ${f.fcf > 0 ? 'positiv – die Dividende wird aus echtem Geld bezahlt' : 'negativ – die Dividende wird nicht aus dem laufenden Geschäft bezahlt'}.`, v: f.fcf > 0 ? 1 : -1 });
  }
  if (fundScore != null) {
    s += (fundScore - 50) * 0.3;
    lines.push({ text: `Fundament-Note der Firma ${fundScore}/100.`, v: fundScore >= 62 ? 1 : fundScore < 40 ? -1 : 0 });
  }
  if (y > 0.08) {
    s -= 12;
    lines.push({ text: `Rendite ${(y * 100).toFixed(1).replace('.', ',')} % ist sehr hoch – oft ein Zeichen, dass der Markt eine Kürzung erwartet („Dividendenfalle").`, v: -1 });
  }
  const score = Math.max(0, Math.min(100, Math.round(s)));
  const trap = (y > 0.07 && score < 55) || (!reit && f.pay != null && f.pay > 1) || (st?.cut ?? false);
  const level: DivQuality['level'] = score >= 65 ? 'good' : score >= 45 ? 'ok' : 'bad';
  const label = score >= 80 ? 'Sehr sicher' : score >= 65 ? 'Solide' : score >= 45 ? 'Mittel' : 'Riskant';
  return { score, label, level, lines, trap };
}
