import AsyncStorage from '@react-native-async-storage/async-storage';
import { NewsItem } from '../types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEC_UA = 'TraderApp private-use contact-not-provided'; // die SEC verlangt einen erkennbaren Namen im User-Agent

const POS = ['surge', 'soar', 'jump', 'rally', 'beat', 'record', 'upgrade', 'gain', 'rise', 'growth', 'profit', 'strong', 'bullish', 'outperform', 'buy', 'raises', 'tops', 'climb',
  'steigt', 'steigen', 'rekord', 'gewinn', 'plus', 'kaufempfehlung', 'hochgestuft', 'erholt', 'kursplus', 'wachstum', 'übertrifft', 'rally', 'zulegen', 'springt', 'hebt'];
const NEG = ['plunge', 'drop', 'fall', 'slump', 'miss', 'downgrade', 'loss', 'weak', 'bearish', 'lawsuit', 'probe', 'cut', 'warn', 'crash', 'fear', 'sell', 'tumble', 'slide', 'recall',
  'fällt', 'fallen', 'verlust', 'minus', 'abgestuft', 'einbruch', 'warnung', 'klage', 'kursminus', 'schwach', 'crash', 'gewinnwarnung', 'verfehlt', 'bricht ein', 'senkt', 'rutscht'];

export function sentiment(title: string): number {
  const s = title.toLowerCase();
  let v = 0;
  POS.forEach((w) => { if (s.includes(w)) v++; });
  NEG.forEach((w) => { if (s.includes(w)) v--; });
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

// ---------- Quellen (alle kostenlos, ohne Konto) ----------

export interface NewsSource {
  id: string;
  name: string;
  lang: 'de' | 'en';
  url: string;
  note?: string;
  official?: boolean;
}

export const NEWS_SOURCES: NewsSource[] = [
  // Deutsch
  { id: 'tagesschau', name: 'Tagesschau Wirtschaft', lang: 'de', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml' },
  { id: 'handelsblatt', name: 'Handelsblatt', lang: 'de', url: 'https://www.handelsblatt.com/contentexport/feed/finanzen' },
  { id: 'faz', name: 'FAZ Finanzen', lang: 'de', url: 'https://www.faz.net/rss/aktuell/finanzen/' },
  { id: 'spiegel', name: 'Spiegel Wirtschaft', lang: 'de', url: 'https://www.spiegel.de/wirtschaft/index.rss' },
  { id: 'manager', name: 'Manager Magazin', lang: 'de', url: 'https://www.manager-magazin.de/finanzen/index.rss' },
  { id: 'ntv', name: 'ntv Wirtschaft', lang: 'de', url: 'https://www.n-tv.de/wirtschaft/rss' },
  { id: 'finanzen', name: 'finanzen.net', lang: 'de', url: 'https://www.finanzen.net/rss/news' },
  { id: 'gnews-de', name: 'Google News Börse', lang: 'de', url: 'https://news.google.com/rss/search?q=B%C3%B6rse+Aktien&hl=de&gl=DE&ceid=DE:de' },
  // Englisch
  { id: 'cnbc', name: 'CNBC Markets', lang: 'en', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664' },
  { id: 'cnbc-top', name: 'CNBC Top News', lang: 'en', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { id: 'marketwatch', name: 'MarketWatch', lang: 'en', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { id: 'seekingalpha', name: 'Seeking Alpha', lang: 'en', url: 'https://seekingalpha.com/market_currents.xml' },
  { id: 'investing', name: 'Investing.com', lang: 'en', url: 'https://www.investing.com/rss/news_25.rss' },
  { id: 'yahoo', name: 'Yahoo Finance', lang: 'en', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EGDAXI,%5EIXIC&region=US&lang=en-US' },
  { id: 'reuters', name: 'Reuters (über Google)', lang: 'en', url: 'https://news.google.com/rss/search?q=site:reuters.com+markets&hl=en-US&gl=US&ceid=US:en' },
  { id: 'globenewswire', name: 'GlobeNewswire (Firmenmeldungen)', lang: 'en', url: 'https://www.globenewswire.com/RssFeed/subjectcode/27-Earnings%20Releases%20and%20Operating%20Results/feedTitle/GlobeNewswire%20-%20Earnings%20Releases', note: 'offizielle Quartalszahlen-Mitteilungen', official: true },
];

const KEY = 'news-disabled-v1';
let disabledCache: string[] | null = null;

export async function getDisabledSources(): Promise<string[]> {
  if (disabledCache) return disabledCache;
  try {
    disabledCache = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]');
  } catch {
    disabledCache = [];
  }
  return disabledCache!;
}

export async function setSourceEnabled(id: string, enabled: boolean) {
  const cur = new Set(await getDisabledSources());
  if (enabled) cur.delete(id);
  else cur.add(id);
  disabledCache = [...cur];
  await AsyncStorage.setItem(KEY, JSON.stringify(disabledCache)).catch(() => {});
}

// ---------- Einlesen ----------

const unesc = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? unesc(m[1]) : '';
};

function parseRss(xml: string, source: string, lang: 'de' | 'en', official?: boolean): NewsItem[] {
  const items: NewsItem[] = [];
  const isGoogle = source.startsWith('Google') || source.startsWith('Reuters');
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    let title = tag(m[1], 'title');
    const link = tag(m[1], 'link');
    const date = Date.parse(tag(m[1], 'pubDate') || tag(m[1], 'dc:date'));
    let src = tag(m[1], 'source') || source;
    const dash = title.lastIndexOf(' - ');
    if (dash > 20 && isGoogle) {
      src = title.slice(dash + 3);
      title = title.slice(0, dash);
    }
    if (!title || !link) continue;
    items.push({ title, link, source: src, t: isNaN(date) ? Date.now() : date, sentiment: sentiment(title), lang, official });
  }
  return items;
}

function parseAtom(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const re = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const link = (m[1].match(/<link[^>]*href="([^"]+)"/i) || [])[1] ?? '';
    const date = Date.parse(tag(m[1], 'updated') || tag(m[1], 'published'));
    const summary = tag(m[1], 'summary');
    const itemsTxt = [...summary.matchAll(/Item\s+(\d\.\d\d)/g)].map((x) => x[1]);
    const label: Record<string, string> = {
      '2.02': 'Quartalszahlen veröffentlicht',
      '1.01': 'Wichtiger Vertrag abgeschlossen',
      '5.02': 'Wechsel im Vorstand/Aufsichtsrat',
      '8.01': 'Sonstige Mitteilung',
      '7.01': 'Mitteilung an Anleger',
      '9.01': 'Anlagen/Unterlagen',
      '2.03': 'Neue Schulden aufgenommen',
      '3.02': 'Neue Aktien ausgegeben',
      '1.05': 'Cybersicherheits-Vorfall',
      '4.02': 'Bilanzen müssen korrigiert werden (Warnsignal)',
    };
    const what = itemsTxt.filter((x) => x !== '9.01').map((x) => label[x] ?? `Punkt ${x}`);
    const title = `SEC-Pflichtmeldung (8-K): ${what.length ? what.join(', ') : 'Mitteilung'}`;
    if (!link) continue;
    items.push({ title, link, source: 'SEC (offiziell)', t: isNaN(date) ? Date.now() : date, sentiment: itemsTxt.includes('4.02') || itemsTxt.includes('1.05') ? -1 : 0, lang: 'en', official: true });
  }
  return items;
}

async function fetchText(url: string, headers: Record<string, string> = {}, timeoutMs = 10000): Promise<string> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*', ...headers }, signal: ctrl?.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const feed = async (s: NewsSource) => parseRss(await fetchText(s.url), s.name, s.lang, s.official).slice(0, 14);

function merge(lists: NewsItem[][], max: number): NewsItem[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .sort((a, b) => b.t - a.t)
    .filter((n) => {
      const k = n.title.toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 55);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

/** Allgemeine Börsen-News aus allen eingeschalteten Quellen */
export async function getMarketNews(): Promise<NewsItem[]> {
  const off = new Set(await getDisabledSources());
  const sources = NEWS_SOURCES.filter((s) => !off.has(s.id));
  if (!sources.length) throw new Error('Alle News-Quellen sind ausgeschaltet (Mehr → Einstellungen → News-Quellen).');
  const res = await Promise.allSettled(sources.map(feed));
  const lists = res.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled').map((r) => r.value);
  if (!lists.length) throw new Error('News konnten nicht geladen werden');
  return merge(lists, 90);
}

// ---------- pro Aktie ----------

let cikMap: Map<string, number> | null = null;
const CIK_KEY = 'sec-cik-v1';

async function cikOf(symbol: string): Promise<number | null> {
  if (!cikMap) {
    try {
      const cached = await AsyncStorage.getItem(CIK_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        if (Date.now() - c.t < 7 * 86400_000) cikMap = new Map(c.rows);
      }
    } catch {
      /* neu laden */
    }
  }
  if (!cikMap) {
    const j = JSON.parse(await fetchText('https://www.sec.gov/files/company_tickers.json', { 'User-Agent': SEC_UA, Accept: 'application/json' }, 20000));
    const rows: [string, number][] = Object.values(j as Record<string, any>).map((x: any) => [String(x.ticker).toUpperCase(), Number(x.cik_str)]);
    cikMap = new Map(rows);
    AsyncStorage.setItem(CIK_KEY, JSON.stringify({ t: Date.now(), rows })).catch(() => {});
  }
  return cikMap.get(symbol.toUpperCase()) ?? null;
}

/** News zu einer einzelnen Aktie: Yahoo, Seeking Alpha, Google (DE + EN) und – für US-Aktien – offizielle SEC-Meldungen */
export async function getStockNews(symbol: string, name: string): Promise<NewsItem[]> {
  const clean = name.replace(/\b(inc|corp|corporation|ag|se|plc|ltd|co|company|holdings)\b\.?/gi, '').replace(/[,.]/g, ' ').trim();
  const plain = symbol.split('.')[0];
  const isUS = !symbol.includes('.');
  const jobs: Promise<NewsItem[]>[] = [
    fetchText(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`).then((x) => parseRss(x, 'Yahoo Finance', 'en')),
    fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(clean + ' Aktie')}&hl=de&gl=DE&ceid=DE:de`).then((x) => parseRss(x, 'Google News', 'de').slice(0, 15)),
    fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(plain + ' stock when:14d')}&hl=en-US&gl=US&ceid=US:en`).then((x) => parseRss(x, 'Google News', 'en').slice(0, 15)),
  ];
  if (isUS) {
    jobs.push(fetchText(`https://seekingalpha.com/api/sa/combined/${encodeURIComponent(plain)}.xml`).then((x) => parseRss(x, 'Seeking Alpha', 'en').slice(0, 15)));
    jobs.push(
      cikOf(symbol).then(async (cik) => {
        if (!cik) return [];
        const x = await fetchText(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(cik).padStart(10, '0')}&type=8-K&dateb=&owner=include&count=8&output=atom`, { 'User-Agent': SEC_UA });
        return parseAtom(x, 'SEC');
      }),
    );
  }
  const res = await Promise.allSettled(jobs);
  const lists = res.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled').map((r) => r.value);
  const main = merge(lists, 40);
  // Offizielle Pflichtmeldungen (SEC) sind selten, aber wichtig: die 3 neuesten immer mit aufnehmen, auch wenn sie älter sind
  const official = lists
    .flat()
    .filter((n) => n.official)
    .sort((a, b) => b.t - a.t)
    .slice(0, 3)
    .filter((n) => !main.some((m) => m.link === n.link));
  return [...main, ...official].sort((a, b) => b.t - a.t);
}
