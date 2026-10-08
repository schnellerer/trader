import { fmtPct } from '../format';
import { BotState, LearnState, SymStat, Trade } from '../types';
import { equityOf } from './sim';

/**
 * „Lernen" aus den eigenen Trades – nachvollziehbare Regeln, kein Black-Box-Modell:
 *  - Verlustserie bei einer Aktie → Aktie wird für den Tag (bzw. mehrere Tage) gesperrt
 *  - schlechte Trefferquote bei einer Aktie → längere Sperre, gute Quote → höheres Gewicht
 *  - Handelsstunden mit schlechter Bilanz werden gemieden
 *  - mehrere Verluste in Folge → „strenger Modus" (höhere Einstiegshürden, halbe Positionsgröße)
 *  - Tages-Verlustlimit: nach −1,5 % Tagesverlust keine neuen Trades mehr
 */
const DAY_MS = 86400_000;

export const learnOf = (b: BotState): LearnState => (b.learn ??= { symbols: {}, hours: {} });

function lesson(b: BotState, text: string) {
  (b.lessons ??= []).unshift({ t: Date.now(), text });
  if (b.lessons.length > 40) b.lessons.length = 40;
}

const endOfToday = (now: number) => {
  const d = new Date(now);
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
};

/** Wertet einen abgeschlossenen Trade aus und passt die Regeln an. */
export function learnFrom(b: BotState, t: Trade, now = Date.now()) {
  if (t.pnl == null) return;
  const L = learnOf(b);
  const win = t.pnl > 0;
  const st: SymStat = (L.symbols[t.symbol] ??= { n: 0, w: 0, pnlPct: 0, streak: 0, banUntil: 0 });
  st.n++;
  if (win) st.w++;
  st.pnlPct += t.pnlPct ?? 0;
  st.streak = win ? 0 : st.streak + 1;

  const hour = String(new Date(t.t).getUTCHours());
  const h = (L.hours[hour] ??= { n: 0, w: 0 });
  h.n++;
  if (win) h.w++;

  if (!win && st.streak >= 2) {
    st.banUntil = endOfToday(now);
    lesson(b, `${t.symbol}: ${st.streak} Verluste in Folge (zuletzt ${fmtPct(t.pnlPct ?? 0, 2)}) → für heute gesperrt. Grund war: ${t.reason.slice(0, 90)}…`);
  }
  if (st.n >= 5 && st.w / st.n < 0.35) {
    st.banUntil = Math.max(st.banUntil, now + 3 * DAY_MS);
    lesson(b, `${t.symbol}: nur ${st.w} von ${st.n} Trades im Plus (${((st.w / st.n) * 100).toFixed(0)} %) → 3 Tage gesperrt.`);
  }
  if (st.n >= 5 && st.w / st.n >= 0.6 && win) {
    lesson(b, `${t.symbol} läuft gut: ${st.w} von ${st.n} Trades im Plus → bekommt mehr Gewicht bei künftigen Signalen.`);
  }
  if (h.n >= 6 && h.w / h.n < 0.3 && !win) {
    lesson(b, `Handelsstunde ${hour}:00 UTC: nur ${h.w} von ${h.n} Gewinnen → in dieser Stunde wird nicht mehr eröffnet.`);
  }
}

export const isBanned = (b: BotState, symbol: string, now = Date.now()) => (learnOf(b).symbols[symbol]?.banUntil ?? 0) > now;

export function badHour(b: BotState, now = Date.now()) {
  const h = learnOf(b).hours[String(new Date(now).getUTCHours())];
  return !!h && h.n >= 6 && h.w / h.n < 0.3;
}

/** Gewichtung eines Signals anhand der bisherigen Erfahrung mit dieser Aktie (0,5 – 1,3) */
export function symbolWeight(b: BotState, symbol: string): number {
  const s = learnOf(b).symbols[symbol];
  if (!s || s.n < 3) return 1;
  const rate = s.w / s.n;
  return Math.max(0.5, Math.min(1.3, 0.5 + rate * 1.0));
}

/** Strenger Modus: ≥4 Verluste unter den letzten 5 abgeschlossenen Trades */
export function strictMode(b: BotState): boolean {
  const last = b.trades.filter((t) => t.pnl != null).slice(0, 5);
  return last.length >= 5 && last.filter((t) => (t.pnl ?? 0) <= 0).length >= 4;
}

/** Tages-Verlustlimit: heute realisiert/bewertet mehr als 1,5 % verloren? */
export function dayLossLocked(b: BotState, now = Date.now(), limit = 0.015): boolean {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const before = [...b.equity].reverse().find((e) => e.t < start)?.v ?? b.startCapital;
  return (equityOf(b) - before) / before < -limit;
}
