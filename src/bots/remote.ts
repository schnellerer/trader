import { BOTS_API_URL, BOTS_URL } from '../config';
import { BotState } from '../types';

export interface BotsFile {
  updatedAt: number;
  startCapital: number;
  day: BotState;
  long: BotState;
  gold?: BotState; // fehlt in älteren Dateien
}

async function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; data: BotsFile | null }> {
  const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...headers } });
  if (!res.ok) return { status: res.status, data: null };
  return { status: res.status, data: (await res.json()) as BotsFile };
}

/**
 * Lädt den aktuellen Stand der Bots vom GitHub-Server. null = Bots haben noch nicht gelaufen.
 * GitHubs Download-Adresse speichert Dateien bis zu 5 Minuten zwischen (und ignoriert Zusätze hinter dem „?"),
 * deshalb wird bei einem älteren Stand zusätzlich die GitHub-API gefragt und der neuere Stand genommen.
 */
export async function fetchBots(): Promise<BotsFile | null> {
  let raw: { status: number; data: BotsFile | null } = { status: 0, data: null };
  try {
    raw = await get(`${BOTS_URL}?nocache=${Date.now()}`);
  } catch {
    /* weiter mit API */
  }
  const stale = !raw.data || Date.now() - raw.data.updatedAt > 8 * 60_000;
  let api: BotsFile | null = null;
  if (stale) {
    try {
      api = (await get(BOTS_API_URL, { Accept: 'application/vnd.github.raw' })).data;
    } catch {
      /* ignorieren */
    }
  }
  const best = [raw.data, api].filter((x): x is BotsFile => !!x).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (best) return best;
  if (raw.status === 404) return null;
  throw new Error(`Bot-Server nicht erreichbar (HTTP ${raw.status || 'keine Verbindung'})`);
}
