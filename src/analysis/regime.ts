import { getChart } from '../api/yahoo';
import { sma } from './indicators';

export type RegimeState = 'green' | 'yellow' | 'red';

export interface Regime {
  state: RegimeState;
  spx: number;
  sma50: number;
  sma200: number;
  vix: number;
  title: string;
  text: string;
}

/**
 * Marktampel: Wie gesund ist der Gesamtmarkt?
 *  grün:  S&P 500 über der 200-Tage-Linie, 50- über 200-Tage-Linie und Angstindex (VIX) unter 25
 *  rot:   S&P 500 unter der 200-Tage-Linie oder VIX über 32
 *  gelb:  alles dazwischen
 * Hintergrund: Die meisten Aktien fallen mit dem Markt. In roten Phasen kaufen die Bots nichts Neues.
 */
export async function marketRegime(): Promise<Regime> {
  const [spx, vix] = await Promise.all([getChart('^GSPC', '2y', '1d', 300_000), getChart('^VIX', '1mo', '1d', 300_000)]);
  const closes = spx.candles.map((c) => c.c);
  const last = closes[closes.length - 1];
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const v = vix.meta.price;
  let state: RegimeState = 'yellow';
  if (last < s200 || v > 32) state = 'red';
  else if (last > s200 && s50 > s200 && v < 25) state = 'green';
  const fmt = (x: number) => x.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const text =
    state === 'green'
      ? `Der S&P 500 (${fmt(last)}) liegt über seiner 200-Tage-Linie (${fmt(s200)}), der Trend ist intakt und der Angstindex VIX ist mit ${v.toFixed(1).replace('.', ',')} niedrig. Gute Bedingungen für Käufe.`
      : state === 'red'
      ? `Der S&P 500 (${fmt(last)}) liegt ${last < s200 ? `unter` : 'über'} seiner 200-Tage-Linie (${fmt(s200)}) bzw. der VIX ist mit ${v.toFixed(1).replace('.', ',')} hoch. Die meisten Aktien fallen in solchen Phasen mit – die Bots kaufen nichts Neues.`
      : `Gemischtes Bild: Der S&P 500 (${fmt(last)}) ist über der 200-Tage-Linie (${fmt(s200)}), aber Trend oder VIX (${v.toFixed(1).replace('.', ',')}) sind nicht eindeutig gut. Die Bots handeln vorsichtiger.`;
  return {
    state,
    spx: last,
    sma50: s50,
    sma200: s200,
    vix: v,
    title: state === 'green' ? 'Marktampel: Grün' : state === 'red' ? 'Marktampel: Rot' : 'Marktampel: Gelb',
    text,
  };
}
