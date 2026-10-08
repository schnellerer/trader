import { BOTS_URL } from '../config';
import { BotState } from '../types';

export interface BotsFile {
  updatedAt: number;
  startCapital: number;
  day: BotState;
  long: BotState;
  gold?: BotState; // fehlt in älteren Dateien
}

/** Lädt den aktuellen Stand der Bots vom GitHub-Server. null = Bots haben noch nicht gelaufen. */
export async function fetchBots(): Promise<BotsFile | null> {
  const res = await fetch(`${BOTS_URL}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Bot-Server nicht erreichbar (HTTP ${res.status})`);
  return res.json();
}
