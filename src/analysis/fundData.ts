import { fetchFundamentals, Fund, unpackFund } from '../api/fundamentals';
import { FUNDAMENTALS_URL } from '../config';

export interface SectorStat {
  n: number;
  pe: number | null; // Median KGV
  mar: number | null; // Median Nettomarge
  rev: number | null; // Median Umsatzwachstum
  roe: number | null;
}

interface FundCache {
  t: number;
  generatedAt: number;
  map: Map<string, Fund>;
  sectors: Record<string, SectorStat>;
}

let cache: FundCache | null = null;

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

async function loadServer(): Promise<FundCache | null> {
  if (cache && Date.now() - cache.t < 60 * 60_000) return cache;
  try {
    const res = await fetch(`${FUNDAMENTALS_URL}?t=${Math.floor(Date.now() / 600_000)}`);
    if (!res.ok) return cache;
    const j = await res.json();
    const map = new Map<string, Fund>();
    const bySec: Record<string, Fund[]> = {};
    Object.entries(j.rows as Record<string, any[]>).forEach(([sym, arr]) => {
      const f = unpackFund(arr);
      map.set(sym, f);
      if (f.sec) (bySec[f.sec] ??= []).push(f);
    });
    const sectors: Record<string, SectorStat> = {};
    Object.entries(bySec).forEach(([sec, list]) => {
      sectors[sec] = {
        n: list.length,
        pe: median(list.map((f) => f.fpe ?? f.pe).filter((v): v is number => v != null && v > 0 && v < 200)),
        mar: median(list.map((f) => f.mar).filter((v): v is number => v != null)),
        rev: median(list.map((f) => f.rev).filter((v): v is number => v != null)),
        roe: median(list.map((f) => f.roe).filter((v): v is number => v != null)),
      };
    });
    cache = { t: Date.now(), generatedAt: j.generatedAt, map, sectors };
    return cache;
  } catch {
    return cache;
  }
}

export interface FundResult {
  fund: Fund | null;
  sector: SectorStat | null;
  source: 'server' | 'live' | 'none';
  generatedAt?: number;
}

/** Fundamentaldaten einer Aktie: erst aus der täglichen Server-Datei, sonst (falls das Handy es kann) live von Yahoo */
export async function getFund(symbol: string): Promise<FundResult> {
  const c = await loadServer();
  const f = c?.map.get(symbol);
  if (f) return { fund: f, sector: (f.sec && c!.sectors[f.sec]) || null, source: 'server', generatedAt: c!.generatedAt };
  try {
    const live = await fetchFundamentals(symbol);
    if (live) return { fund: live, sector: (live.sec && c?.sectors[live.sec]) || null, source: 'live' };
  } catch {
    /* Handy darf die Yahoo-Sitzung nicht aufbauen → keine Daten */
  }
  return { fund: null, sector: null, source: 'none' };
}
