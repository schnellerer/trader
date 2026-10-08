import { getEurUsd } from '../api/yahoo';
import { RankItem } from '../types';

/** Macht aus der Server-Datei ranking.json Einträge mit Preisen in EUR (genutzt von App und Bot-Server). */
export async function toRankItems(json: any): Promise<RankItem[]> {
  const fx = await getEurUsd();
  return (json.items as RankItem[]).map((r) => ({ ...r, price: r.currency === 'EUR' ? r.price : r.price / fx }));
}
