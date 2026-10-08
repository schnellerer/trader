import { NewsItem } from '../types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const POS = ['surge', 'soar', 'jump', 'rally', 'beat', 'record', 'upgrade', 'gain', 'rise', 'growth', 'profit', 'strong', 'bullish', 'outperform', 'buy',
  'steigt', 'steigen', 'rekord', 'gewinn', 'plus', 'kaufempfehlung', 'hochgestuft', 'erholt', 'kursplus', 'wachstum', 'übertrifft', 'rally'];
const NEG = ['plunge', 'drop', 'fall', 'slump', 'miss', 'downgrade', 'loss', 'weak', 'bearish', 'lawsuit', 'probe', 'cut', 'warn', 'crash', 'fear', 'sell',
  'fällt', 'fallen', 'verlust', 'minus', 'abgestuft', 'einbruch', 'warnung', 'klage', 'kursminus', 'schwach', 'crash', 'gewinnwarnung', 'verfehlt'];

export function sentiment(title: string): number {
  const s = title.toLowerCase();
  let v = 0;
  POS.forEach((w) => { if (s.includes(w)) v++; });
  NEG.forEach((w) => { if (s.includes(w)) v--; });
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

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

function parseRss(xml: string, defaultSource: string): NewsItem[] {
  const items: NewsItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    let title = tag(m[1], 'title');
    const link = tag(m[1], 'link');
    const date = Date.parse(tag(m[1], 'pubDate'));
    let source = tag(m[1], 'source') || defaultSource;
    const dash = title.lastIndexOf(' - ');
    if (dash > 20 && defaultSource.startsWith('Google')) {
      source = title.slice(dash + 3);
      title = title.slice(0, dash);
    }
    if (!title || !link) continue;
    items.push({ title, link, source, t: isNaN(date) ? Date.now() : date, sentiment: sentiment(title) });
  }
  return items;
}

async function feed(url: string, source: string): Promise<NewsItem[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseRss(await res.text(), source);
}

function merge(lists: NewsItem[][], max: number): NewsItem[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .sort((a, b) => b.t - a.t)
    .filter((n) => {
      const k = n.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

/** Allgemeine Börsen-News (alles kostenlos über öffentliche RSS-Feeds) */
export async function getMarketNews(): Promise<NewsItem[]> {
  const res = await Promise.allSettled([
    feed('https://news.google.com/rss/search?q=B%C3%B6rse+Aktien&hl=de&gl=DE&ceid=DE:de', 'Google News'),
    feed('https://news.google.com/rss/search?q=stock+market+today&hl=en-US&gl=US&ceid=US:en', 'Google News'),
    feed('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EGDAXI,%5EIXIC&region=US&lang=en-US', 'Yahoo Finance'),
    feed('https://www.tagesschau.de/wirtschaft/index~rss2.xml', 'Tagesschau'),
    feed('https://www.handelsblatt.com/contentexport/feed/finanzen', 'Handelsblatt'),
  ]);
  const lists = res.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled').map((r) => r.value);
  if (!lists.length) throw new Error('News konnten nicht geladen werden');
  return merge(lists, 60);
}

/** News zu einer einzelnen Aktie */
export async function getStockNews(symbol: string, name: string): Promise<NewsItem[]> {
  const q = encodeURIComponent(`${name.replace(/\b(inc|corp|corporation|ag|se|plc|ltd)\b\.?/gi, '').trim()} Aktie`);
  const res = await Promise.allSettled([
    feed(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`, 'Yahoo Finance'),
    feed(`https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`, 'Google News'),
    feed(`https://news.google.com/rss/search?q=${encodeURIComponent(symbol.split('.')[0] + ' stock')}&hl=en-US&gl=US&ceid=US:en`, 'Google News'),
  ]);
  const lists = res.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled').map((r) => r.value);
  return merge(lists, 30);
}
