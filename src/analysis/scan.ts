import { SCAN_URL } from '../config';
import { getChart, getEurUsd, pool } from '../api/yahoo';
import { ScanRow } from '../types';

let cache: { t: number; generatedAt: number; rows: ScanRow[] } | null = null;

/** Lädt die täglich berechnete Liste aller ausgewerteten Aktien (~4.000) vom Server */
export async function fetchScan(force = false): Promise<{ generatedAt: number; rows: ScanRow[] }> {
  if (!force && cache && Date.now() - cache.t < 30 * 60_000) return cache;
  const res = await fetch(`${SCAN_URL}?t=${Math.floor(Date.now() / 300_000)}`);
  if (res.status === 404) throw new Error('Scanner-Daten noch nicht vorhanden. Auf GitHub den Workflow „Ranking berechnen" einmal starten.');
  if (!res.ok) throw new Error(`Scanner-Daten nicht erreichbar (HTTP ${res.status})`);
  const j = await res.json();
  const fx = await getEurUsd();
  const f: string[] = j.fields;
  const ix = (k: string) => f.indexOf(k);
  const rows: ScanRow[] = (j.rows as any[][]).map((r) => {
    const cur = r[ix('currency')];
    return {
      symbol: r[ix('symbol')],
      name: r[ix('name')],
      liq: r[ix('liq')],
      price: cur === 'EUR' ? r[ix('price')] : r[ix('price')] / fx,
      currency: cur,
      rs: r[ix('rs')],
      rsi: r[ix('rsi')],
      hi52: r[ix('hi52')],
      vol: r[ix('vol')],
      m1: r[ix('m1')],
      m6: r[ix('m6')],
      m12: r[ix('m12')],
      score: r[ix('score')],
      sigma: r[ix('sigma')],
      up: r[ix('up')] === 1,
      earnings: r[ix('earnings')] || undefined,
    };
  });
  cache = { t: Date.now(), generatedAt: j.generatedAt, rows };
  return cache;
}

export interface Preset {
  key: string;
  label: string;
  icon: string;
  desc: string;
  filter: (r: ScanRow) => boolean;
  sort: (a: ScanRow, b: ScanRow) => number;
}

const daysTo = (d?: string) => (d ? (Date.parse(`${d}T21:00:00Z`) - Date.now()) / 86400_000 : null);

export const PRESETS: Preset[] = [
  {
    key: 'breakout',
    label: 'Ausbruch',
    icon: 'rocket',
    desc: 'Nahe am 52-Wochen-Hoch (max. 3 % darunter), Handelsvolumen deutlich erhöht, Aufwärtstrend und starke Relative Stärke. Klassisches Ausbruchsmuster.',
    filter: (r) => r.hi52 > -0.03 && r.vol >= 1.3 && r.up && r.rs >= 70,
    sort: (a, b) => b.rs - a.rs,
  },
  {
    key: 'strong',
    label: 'Stärkste',
    icon: 'flame',
    desc: 'Relative Stärke ab 90: Diese Aktien laufen besser als 90 % aller anderen – im Backtest die erfolgreichste Kennzahl.',
    filter: (r) => r.rs >= 90 && r.up,
    sort: (a, b) => b.rs - a.rs || b.m6 - a.m6,
  },
  {
    key: 'dip',
    label: 'Rücksetzer',
    icon: 'trending-down',
    desc: 'Überverkauft (RSI unter 35), aber im langfristigen Aufwärtstrend und solide Relative Stärke. Mögliche Erholung nach kurzer Schwäche.',
    filter: (r) => r.rsi <= 35 && r.up && r.rs >= 50,
    sort: (a, b) => a.rsi - b.rsi,
  },
  {
    key: 'volume',
    label: 'Volumen',
    icon: 'pulse',
    desc: 'Ungewöhnlich hohes Handelsvolumen (mind. 2,5-fach des Schnitts) – hier passiert gerade etwas (News, Zahlen, Großinvestoren). Nicht jede Bewegung ist positiv!',
    filter: (r) => r.vol >= 2.5 && r.liq !== 'micro',
    sort: (a, b) => b.vol - a.vol,
  },
  {
    key: 'steady',
    label: 'Solide',
    icon: 'shield-checkmark',
    desc: 'Sehr guter Signal-Score (≥ 4), ruhiger Verlauf (Schwankung unter 35 %), große oder mittlere Werte, über der 200-Tage-Linie.',
    filter: (r) => r.score >= 4 && r.sigma < 0.35 && r.up && (r.liq === 'large' || r.liq === 'mid'),
    sort: (a, b) => b.rs - a.rs,
  },
  {
    key: 'earnings',
    label: 'Zahlen',
    icon: 'calendar',
    desc: 'Quartalszahlen in den nächsten 7 Tagen. Kurse springen dabei oft stark – gut zum Beobachten, riskant zum Halten. Die Bots meiden diese Aktien.',
    filter: (r) => {
      const d = daysTo(r.earnings);
      return d != null && d > -1 && d <= 7 && r.liq !== 'micro';
    },
    sort: (a, b) => (a.earnings ?? '').localeCompare(b.earnings ?? '') || b.rs - a.rs,
  },
];

// ---------- Sektor-Stärke (Branchen-ETFs) ----------

export const SECTORS = [
  { symbol: 'XLK', name: 'Technologie' },
  { symbol: 'XLC', name: 'Kommunikation' },
  { symbol: 'XLY', name: 'Zyklischer Konsum' },
  { symbol: 'XLF', name: 'Finanzen' },
  { symbol: 'XLI', name: 'Industrie' },
  { symbol: 'XLV', name: 'Gesundheit' },
  { symbol: 'XLE', name: 'Energie' },
  { symbol: 'XLB', name: 'Rohstoffe' },
  { symbol: 'XLP', name: 'Basiskonsum' },
  { symbol: 'XLU', name: 'Versorger' },
  { symbol: 'XLRE', name: 'Immobilien' },
];

export interface SectorRow {
  symbol: string;
  name: string;
  m1: number;
  m3: number;
  m6: number;
}

export async function fetchSectors(): Promise<SectorRow[]> {
  const res = await pool(SECTORS, 4, async (s) => {
    const d = await getChart(s.symbol, '1y', '1d', 600_000);
    const c = d.candles.map((x) => x.c);
    const last = c[c.length - 1];
    const back = (n: number) => (c.length > n ? last / c[c.length - 1 - n] - 1 : NaN);
    return { ...s, m1: back(21), m3: back(63), m6: back(126) } as SectorRow;
  });
  return res.filter((x): x is SectorRow => !!x).sort((a, b) => b.m3 - a.m3);
}
