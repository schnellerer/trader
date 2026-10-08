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
}

export interface Trade {
  id: string;
  t: number;
  symbol: string;
  name: string;
  side: 'KAUF' | 'VERKAUF';
  qty: number;
  price: number; // EUR
  fee: number;
  reason: string;
  pnl?: number;
  pnlPct?: number;
}

export interface BotState {
  cash: number;
  startCapital: number;
  positions: Position[];
  trades: Trade[];
  equity: { t: number; v: number }[];
  lastRun: number | null;
  lastLog: string;
  createdAt: number;
}
