/**
 * Fundamentaldaten von Yahoo Finance (inoffiziell, kostenlos). Läuft auf dem Server (Node) und – soweit das Handy
 * Cookies erlaubt – als Notlösung in der App.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface Fund {
  pe?: number; // KGV (letzte 12 Monate)
  fpe?: number; // erwartetes KGV
  peg?: number;
  pb?: number; // Kurs/Buchwert
  ps?: number; // Kurs/Umsatz
  rev?: number; // Umsatzwachstum (Jahr zu Vorjahr)
  eg?: number; // Gewinnwachstum
  epsNext?: number; // erwartetes Gewinnwachstum nächstes Jahr
  mar?: number; // Nettomarge
  opm?: number; // operative Marge
  roe?: number;
  de?: number; // Verschuldung / Eigenkapital (1 = 100 %)
  cr?: number; // Liquidität (current ratio)
  fcf?: number; // freier Cashflow (absolut)
  mcap?: number;
  div?: number; // Dividendenrendite (0.02 = 2 %)
  pay?: number; // Ausschüttungsquote
  beta?: number;
  tgt?: number; // mittleres Analysten-Kursziel
  tlo?: number;
  thi?: number;
  rec?: number; // Empfehlung 1 (starker Kauf) … 5 (Verkauf)
  na?: number; // Anzahl Analysten
  sec?: string;
  ind?: string;
  price?: number;
  cur?: string;
}

export const FUND_FIELDS: (keyof Fund)[] = ['pe', 'fpe', 'peg', 'pb', 'ps', 'rev', 'eg', 'epsNext', 'mar', 'opm', 'roe', 'de', 'cr', 'fcf', 'mcap', 'div', 'pay', 'beta', 'tgt', 'tlo', 'thi', 'rec', 'na', 'sec', 'ind', 'price', 'cur'];

let session: { cookie: string; crumb: string; t: number } | null = null;

async function getSession(force = false) {
  if (session && !force && Date.now() - session.t < 20 * 60_000) return session;
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' as any });
  const h: any = r1.headers;
  const list: string[] = h.getSetCookie?.() ?? (h.get('set-cookie') ? [h.get('set-cookie')] : []);
  const cookie = list.map((c) => c.split(';')[0]).join('; ');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) } });
  const crumb = await r2.text();
  if (!r2.ok || !crumb || crumb.includes('<')) throw new Error('Yahoo-Sitzung nicht verfügbar');
  session = { cookie, crumb, t: Date.now() };
  return session;
}

const raw = (x: any): number | undefined => {
  const v = typeof x === 'number' ? x : x?.raw;
  return typeof v === 'number' && isFinite(v) ? v : undefined;
};

const MODULES = 'financialData,defaultKeyStatistics,summaryDetail,earningsTrend,assetProfile,price';

export async function fetchFundamentals(symbol: string, retried = false): Promise<Fund | null> {
  const s = await getSession(retried);
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(s.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(s.cookie ? { Cookie: s.cookie } : {}) } });
  if ((res.status === 401 || res.status === 403) && !retried) return fetchFundamentals(symbol, true);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fundamentaldaten nicht erreichbar (HTTP ${res.status})`);
  const j: any = await res.json();
  const r = j?.quoteSummary?.result?.[0];
  if (!r) return null;
  if (r.price?.quoteType && r.price.quoteType !== 'EQUITY') return null; // ETFs, Indizes, Krypto haben keine Unternehmenskennzahlen
  const fd = r.financialData ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const sd = r.summaryDetail ?? {};
  const trend: any[] = r.earningsTrend?.trend ?? [];
  const next = trend.find((t) => t.period === '+1y');
  const de = raw(fd.debtToEquity);
  const f: Fund = {
    pe: raw(sd.trailingPE),
    fpe: raw(sd.forwardPE) ?? raw(ks.forwardPE),
    peg: raw(ks.pegRatio),
    pb: raw(ks.priceToBook),
    ps: raw(sd.priceToSalesTrailing12Months),
    rev: raw(fd.revenueGrowth),
    eg: raw(fd.earningsGrowth),
    epsNext: raw(next?.earningsEstimate?.growth) ?? raw(next?.growth),
    mar: raw(fd.profitMargins),
    opm: raw(fd.operatingMargins),
    roe: raw(fd.returnOnEquity),
    de: de != null ? de / 100 : undefined,
    cr: raw(fd.currentRatio),
    fcf: raw(fd.freeCashflow),
    mcap: raw(sd.marketCap) ?? raw(r.price?.marketCap),
    div: raw(sd.dividendYield),
    pay: raw(sd.payoutRatio),
    beta: raw(sd.beta),
    tgt: raw(fd.targetMeanPrice),
    tlo: raw(fd.targetLowPrice),
    thi: raw(fd.targetHighPrice),
    rec: raw(fd.recommendationMean),
    na: raw(fd.numberOfAnalystOpinions),
    sec: r.assetProfile?.sector,
    ind: r.assetProfile?.industry,
    price: raw(fd.currentPrice) ?? raw(r.price?.regularMarketPrice),
    cur: r.price?.currency ?? fd.financialCurrency,
  };
  // leere Ergebnisse (z. B. ETFs, Indizes) als „keine Daten" behandeln
  const has = FUND_FIELDS.some((k) => k !== 'sec' && k !== 'ind' && k !== 'price' && k !== 'cur' && f[k] != null);
  return has ? f : null;
}

export const packFund = (f: Fund) => FUND_FIELDS.map((k) => (f[k] == null ? null : typeof f[k] === 'number' ? Math.round((f[k] as number) * 10000) / 10000 : f[k]));
export const unpackFund = (a: any[]): Fund => {
  const f: any = {};
  FUND_FIELDS.forEach((k, i) => {
    if (a[i] != null) f[k] = a[i];
  });
  return f as Fund;
};
