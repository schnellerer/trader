export interface Candle {
  t: number; // ms
  c: number;
  h: number;
  l: number;
  v: number;
}

export interface Meta {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  price: number;
  prevClose: number;
  high52?: number;
  low52?: number;
  periodStart?: number; // ms
  periodEnd?: number; // ms
}

export interface ChartData {
  meta: Meta;
  candles: Candle[];
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  t: number;
  sentiment: number; // -1, 0, 1
}

export type Bias = 'bullish' | 'neutral' | 'bearish';

export interface Signal {
  text: string;
  value: number; // +1 / 0 / -1
}

export interface Scenario {
  years: number;
  bull: number;
  base: number;
  bear: number;
  probProfit: number;
}

export interface Analysis {
  meta: Meta;
  daily: Candle[];
  bias: Bias;
  score: number;
  signals: Signal[];
  scenarios: Scenario[];
  vol: number;
  drift: number;
  historyYears: number;
  news: NewsItem[];
  newsSentiment: number;
}

export interface RankItem {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  expected: number; // erwartete 12M-Rendite (Basis)
  vol: number;
  score: number;
  bias: Bias;
  aboveSma200: boolean;
  signals: Signal[];
  explanation: string;
  rankKey: number;
  liq?: 'large' | 'mid' | 'small' | 'micro'; // Handelsvolumen-Klasse (nur Server-Ranking)
  dollarVol?: number;
  rs?: number; // Relative Stärke 1-99 gegenüber allen ausgewerteten Aktien
  earnings?: string; // nächster Quartalszahlen-Termin (YYYY-MM-DD)
}

/** Zeile aus data/scan.json (alle ausgewerteten Aktien, kompakt) */
export interface ScanRow {
  symbol: string;
  name: string;
  liq: 'large' | 'mid' | 'small' | 'micro';
  price: number; // EUR (App rechnet USD um)
  currency: string;
  rs: number;
  rsi: number;
  hi52: number; // Abstand zum 52-Wochen-Hoch (−0,05 = 5 % darunter)
  vol: number; // Volumen-Schub: 5-Tage-Schnitt / 50-Tage-Schnitt
  m1: number;
  m6: number;
  m12: number;
  score: number;
  sigma: number; // Schwankung p.a.
  up: boolean; // über der 200-Tage-Linie
  earnings?: string;
}

export interface RankingMeta {
  source: 'server' | 'lokal';
  generatedAt: number;
  analyzed: number;
  counts?: Record<string, number>;
}

export interface Position {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number; // EUR
  lastPrice: number; // EUR
  openedAt: number;
  dir?: 1 | -1; // 1 = Long (Standard), -1 = Short
  stop?: number; // Stop-Loss (EUR)
  target?: number; // Gewinnziel (EUR)
  risk?: number; // anfänglicher Stop-Abstand (EUR) = 1R
}

export interface Trade {
  id: string;
  t: number;
  symbol: string;
  name: string;
  side: 'KAUF' | 'VERKAUF' | 'SHORT' | 'COVER';
  qty: number;
  price: number; // EUR
  fee: number;
  reason: string;
  pnl?: number;
  pnlPct?: number;
  heldMs?: number; // Haltedauer (nur bei Verkäufen/Cover)
}

/** Erfahrung des Day-Trading-Bots pro Aktie (Grundlage fürs „Lernen") */
export interface SymStat {
  n: number; // abgeschlossene Trades
  w: number; // davon Gewinne
  pnlPct: number; // Summe der Trade-Renditen
  streak: number; // aktuelle Verlustserie
  banUntil: number; // bis wann gesperrt (ms)
}

export interface LearnState {
  symbols: Record<string, SymStat>;
  hours: Record<string, { n: number; w: number }>; // Handelsstunde (UTC) → Trefferquote
}

export interface Lesson {
  t: number;
  text: string;
}

export interface BotState {
  learn?: LearnState;
  lessons?: Lesson[];
  cash: number;
  startCapital: number;
  positions: Position[];
  trades: Trade[];
  equity: { t: number; v: number }[];
  lastRun: number | null;
  lastLog: string;
  createdAt: number;
}
