import { getChart, pool, toEur } from '../api/yahoo';
import { RANKING_URL } from '../config';
import { toRankItems } from './rankingData';
import { RankItem, RankingMeta } from '../types';
import { pctChange, sma } from './indicators';
import { assessBias, biasLabel, driftStats, expectedReturn } from './model';
import { UNIVERSE } from './universe';

let cache: { t: number; items: RankItem[]; meta: RankingMeta } | null = null;
let running: Promise<RankItem[]> | null = null;

export const cachedRanking = () => cache;
export const rankingMeta = () => cache?.meta ?? null;

/** Fertiges Ranking vom Server (täglich per GitHub Actions berechnet, ~6.000 US-Aktien inkl. Small Caps) */
async function remoteRanking(): Promise<{ items: RankItem[]; meta: RankingMeta }> {
  if (!RANKING_URL) throw new Error('kein Server konfiguriert');
  const res = await fetch(`${RANKING_URL}?t=${Math.floor(Date.now() / 600_000)}`);
  if (!res.ok) throw new Error(`Ranking-Server nicht erreichbar (HTTP ${res.status})`);
  const j = await res.json();
  const items = await toRankItems(j);
  if (!items.length) throw new Error('Ranking-Datei ist leer');
  return { items, meta: { source: 'server', generatedAt: j.generatedAt, analyzed: j.analyzed, counts: j.counts } };
}

async function localRanking(onProgress?: (done: number, total: number) => void): Promise<{ items: RankItem[]; meta: RankingMeta }> {
  let done = 0;
  const res = await pool(UNIVERSE, 5, async (symbol) => {
    const d = await getChart(symbol, '2y', '1d', 10 * 60_000);
    onProgress?.(++done, UNIVERSE.length);
    if (d.candles.length < 200) throw new Error('zu wenig Daten');
    const closes = d.candles.map((c) => c.c);
    const stats = driftStats(closes, 252);
    const { bias, score, signals } = assessBias(d.candles, 0);
    const expected = expectedReturn(stats, score, 1);
    const m6 = pctChange(closes, 126);
    const s200 = sma(closes, 200);
    const price = await toEur(d.meta.price, d.meta.currency);
    const pos = signals.filter((s) => s.value > 0).map((s) => s.text);
    const neg = signals.filter((s) => s.value < 0).map((s) => s.text);
    const explanation =
      `Erwartete 12-Monats-Rendite (Basis): ${(expected * 100).toFixed(1).replace('.', ',')} % bei ${(stats.vol * 100).toFixed(0)} % Schwankung.\n` +
      `Grundlage: langfristiger Markt-Schnitt (7 % p.a.), gedämpft mit der eigenen Kurshistorie (2 Jahre: ${(stats.rawDrift * 100).toFixed(0)} % p.a.) und einem Trend-Zuschlag von ${(0.02 * Math.max(-4, Math.min(4, score)) * 100).toFixed(0)} %-Punkten.\n` +
      (pos.length ? `Dafür spricht: ${pos.join('; ')}.\n` : '') +
      (neg.length ? `Dagegen spricht: ${neg.join('; ')}.\n` : '') +
      `Einstufung: ${biasLabel(bias)} (Score ${score}).`;
    const item: RankItem = {
      symbol,
      name: d.meta.name,
      currency: d.meta.currency,
      price,
      expected,
      vol: stats.vol,
      score,
      bias,
      aboveSma200: isFinite(s200) ? closes[closes.length - 1] > s200 : isFinite(m6) && m6 > 0,
      signals,
      explanation,
      rankKey: expected / (0.5 + stats.vol),
    };
    return item;
  });
  const items = res.filter((x): x is RankItem => !!x).sort((a, b) => b.rankKey - a.rankKey);
  if (!items.length) throw new Error('Ranking konnte nicht berechnet werden (keine Kursdaten)');
  return { items, meta: { source: 'lokal', generatedAt: Date.now(), analyzed: items.length } };
}

export function getRanking(force = false, onProgress?: (done: number, total: number) => void): Promise<RankItem[]> {
  if (!force && cache && Date.now() - cache.t < 30 * 60_000) return Promise.resolve(cache.items);
  if (running) return running;
  running = (async () => {
    let r;
    try {
      r = await remoteRanking();
    } catch {
      r = await localRanking(onProgress); // Fallback: nur die 44 festen Aktien
    }
    cache = { t: Date.now(), items: r.items, meta: r.meta };
    return r.items;
  })().finally(() => {
    running = null;
  });
  return running;
}
