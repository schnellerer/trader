/**
 * W.A.F – „We Are Fucked"-Score für Deutschland (Satire mit echten Zahlen) → data/waf.json
 *   npx tsx scripts/waf.ts
 * Daten (kostenlos, ohne Konto): Eurostat (Preise, Jobs, Immobilien, BIP), EZB (Zinsen), Yahoo (DAX, Bitcoin), deutsche RSS-Feeds (Schlagzeilen).
 * Höher = schlimmer. Gewichte und Schwellen sind meine Willkür, kein wissenschaftlicher Index.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getChart } from '../src/api/yahoo';
import { decodeEntitiesText } from './wafText';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ES = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';

type Pt = { t: string; v: number };

async function eurostat(dataset: string, query: string): Promise<Pt[]> {
  const r = await fetch(`${ES}${dataset}?${query}&format=JSON&lang=EN`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Eurostat ${dataset}: HTTP ${r.status}`);
  const j: any = await r.json();
  const idx = j.dimension.time.category.index as Record<string, number>;
  return Object.entries(idx)
    .sort((a, b) => a[1] - b[1])
    .map(([t, i]) => ({ t, v: j.value[i] as number }))
    .filter((x) => x.v != null && isFinite(x.v));
}

async function ecb(path: string): Promise<Pt[]> {
  const r = await fetch(`https://data-api.ecb.europa.eu/service/data/${path}?lastNObservations=6&format=csvdata`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`EZB ${path}: HTTP ${r.status}`);
  const lines = (await r.text()).trim().split('\n');
  const hdr = lines[0].split(',');
  const iv = hdr.indexOf('OBS_VALUE');
  const it = hdr.indexOf('TIME_PERIOD');
  return lines.slice(1).map((l) => ({ t: l.split(',')[it], v: Number(l.split(',')[iv]) })).filter((x) => isFinite(x.v));
}

const lerp = (v: number, lo: number, hi: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
const avg = (a: { s: number; w: number }[]) => a.reduce((s, x) => s + x.s * x.w, 0) / (a.reduce((s, x) => s + x.w, 0) || 1);
const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const mon = (t: string) => {
  const m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][Number(m[2]) - 1]} ${m[1]}`;
  const q = t.match(/^(\d{4})-Q(\d)$/);
  return q ? `Q${q[2]}/${q[1]}` : t;
};

interface Item {
  label: string;
  value: string;
  note: string;
  date: string;
  score: number;
}
interface Comp {
  key: string;
  title: string;
  icon: string;
  weight: number;
  score: number;
  items: Item[];
  line: string;
}

const STRESS = ['krise', 'krieg', 'streit', 'skandal', 'rücktritt', 'angriff', 'zoll', 'zölle', 'eskalation', 'pleite', 'insolvenz', 'rezession', 'sanktion', 'anschlag', 'terror', 'tote', 'tod ', 'krach', 'chaos', 'blockade', 'kürzung', 'stellenabbau', 'entlassung', 'wut ', 'protest', 'droht', 'drohung', 'warnt', 'warnung', 'versagen', 'absturz', 'einbruch', 'notstand', 'haushaltsloch', 'streik', 'spionage', 'attacke', 'bedroht', 'verlust', 'schock', 'eklat', 'zoff', 'abbau'];
const FEEDS: [string, string][] = [
  ['Tagesschau Inland', 'https://www.tagesschau.de/inland/index~rss2.xml'],
  ['Tagesschau Ausland', 'https://www.tagesschau.de/ausland/index~rss2.xml'],
  ['Spiegel Politik', 'https://www.spiegel.de/politik/index.rss'],
  ['ntv Politik', 'https://www.n-tv.de/politik/rss'],
  ['FAZ Politik', 'https://www.faz.net/rss/aktuell/politik/'],
  ['Zeit Politik', 'https://newsfeed.zeit.de/politik/index'],
];

async function headlines() {
  const res = await Promise.allSettled(
    FEEDS.map(async ([src, url]) => {
      const x = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
      return [...x.matchAll(/<item[ >][\s\S]*?<\/item>/gi)]
        .map((m) => ({
          title: decodeEntitiesText((m[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ?? ''),
          link: decodeEntitiesText((m[0].match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] ?? ''),
          source: src,
        }))
        .filter((h) => h.title)
        .slice(0, 20);
    }),
  );
  return res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function main() {
  const comps: Comp[] = [];
  const warnings: string[] = [];
  const safe = async <T>(name: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (e: any) {
      warnings.push(`${name}: ${e?.message}`);
      return null;
    }
  };
  const last = (a: Pt[] | null) => (a && a.length ? a[a.length - 1] : null);

  const [infl, food, energy, rent, youth, unemp, hpi, gdp, mort, leit] = await Promise.all([
    safe('Inflation', eurostat('prc_hicp_manr', 'geo=DE&coicop=CP00&unit=RCH_A&sinceTimePeriod=2025-01')),
    safe('Nahrung', eurostat('prc_hicp_manr', 'geo=DE&coicop=CP011&unit=RCH_A&sinceTimePeriod=2025-01')),
    safe('Energie', eurostat('prc_hicp_manr', 'geo=DE&coicop=NRG&unit=RCH_A&sinceTimePeriod=2025-01')),
    safe('Mieten', eurostat('prc_hicp_manr', 'geo=DE&coicop=CP041&unit=RCH_A&sinceTimePeriod=2025-01')),
    safe('Jugend', eurostat('une_rt_m', 'geo=DE&age=Y_LT25&sex=T&unit=PC_ACT&s_adj=SA&sinceTimePeriod=2025-01')),
    safe('Arbeitslos', eurostat('une_rt_m', 'geo=DE&age=TOTAL&sex=T&unit=PC_ACT&s_adj=SA&sinceTimePeriod=2025-01')),
    safe('Immobilien', eurostat('prc_hpi_q', 'geo=DE&purchase=TOTAL&unit=RCH_A&sinceTimePeriod=2024-Q1')),
    safe('BIP', eurostat('namq_10_gdp', 'geo=DE&na_item=B1GQ&unit=CLV_PCH_PRE&s_adj=SCA&sinceTimePeriod=2024-Q1')),
    safe('Hypothek', ecb('MIR/M.DE.B.A2C.P.R.A.2250.EUR.N')),
    safe('Leitzins', ecb('FM/B.U2.EUR.4F.KR.MRR_FR.LEV')),
  ]);

  // 1) Preise im Alltag
  {
    const items: Item[] = [];
    const a = last(infl), f = last(food), e = last(energy);
    if (a) items.push({ label: 'Inflation insgesamt', value: `${fmt(a.v)} %`, note: 'Preissteigerung zum Vorjahr', date: mon(a.t), score: lerp(a.v, 1.5, 7) });
    if (f) items.push({ label: 'Lebensmittel', value: `${fmt(f.v)} %`, note: 'Preissteigerung zum Vorjahr', date: mon(f.t), score: lerp(f.v, 1, 10) });
    if (e) items.push({ label: 'Energie (Strom, Heizen, Sprit)', value: `${fmt(e.v)} %`, note: 'Preisänderung zum Vorjahr', date: mon(e.t), score: lerp(e.v, 0, 15) });
    if (items.length) {
      const s = avg(items.map((x, i) => ({ s: x.score, w: [0.5, 0.25, 0.25][i] ?? 0.25 })));
      comps.push({ key: 'prices', title: 'Preise im Alltag', icon: 'cart', weight: 0.2, score: s, items, line: s < 25 ? 'Der Einkaufswagen tut noch nicht weh.' : s < 55 ? 'Alles wird spürbar teurer, aber es geht noch.' : 'Der Wocheneinkauf fühlt sich an wie ein Kredit.' });
    }
  }
  // 2) Wohnen
  {
    const items: Item[] = [];
    const r = last(rent), m = last(mort), h = last(hpi);
    if (r) items.push({ label: 'Mieten', value: `${fmt(r.v)} %`, note: 'Mietsteigerung zum Vorjahr', date: mon(r.t), score: lerp(r.v, 1, 8) });
    if (m) items.push({ label: 'Hypothekenzins (5–10 Jahre fest)', value: `${fmt(m.v, 2)} %`, note: 'Zinsen für ein Haus-Darlehen', date: mon(m.t), score: lerp(m.v, 2, 6) });
    if (h) items.push({ label: 'Immobilienpreise', value: `${h.v >= 0 ? '+' : ''}${fmt(h.v)} %`, note: 'Preisänderung zum Vorjahr', date: mon(h.t), score: lerp(Math.max(0, h.v), 0, 10) });
    if (items.length) {
      const s = avg(items.map((x, i) => ({ s: x.score, w: [0.4, 0.4, 0.2][i] ?? 0.3 })));
      comps.push({ key: 'housing', title: 'Wohnen', icon: 'home', weight: 0.2, score: s, items, line: s < 25 ? 'Wohnen geht gerade.' : s < 55 ? 'Eigentum ist Fantasie, Miete wird teurer.' : 'Eine Wohnung zu finden ist ein Hauptgewinn ohne Gewinn.' });
    }
  }
  // 3) Job & Zukunft
  {
    const items: Item[] = [];
    const y = last(youth), u = last(unemp), g = last(gdp);
    if (y) items.push({ label: 'Jugendarbeitslosigkeit (unter 25)', value: `${fmt(y.v)} %`, note: 'Anteil ohne Job', date: mon(y.t), score: lerp(y.v, 4, 14) });
    if (u) items.push({ label: 'Arbeitslosigkeit insgesamt', value: `${fmt(u.v)} %`, note: 'Anteil ohne Job', date: mon(u.t), score: lerp(u.v, 3, 9) });
    if (g) items.push({ label: 'Wirtschaftswachstum (Quartal)', value: `${g.v >= 0 ? '+' : ''}${fmt(g.v)} %`, note: 'gegenüber dem Vorquartal', date: mon(g.t), score: lerp(-g.v, -0.5, 0.5) });
    if (items.length) {
      const s = avg(items.map((x, i) => ({ s: x.score, w: [0.45, 0.25, 0.3][i] ?? 0.3 })));
      comps.push({ key: 'jobs', title: 'Job & Zukunft', icon: 'briefcase', weight: 0.2, score: s, items, line: s < 25 ? 'Jobs gibt es, die Wirtschaft läuft.' : s < 55 ? 'Die Wirtschaft schleppt sich, aber noch stehen Türen offen.' : 'Bewerbungen schreiben wird zum Vollzeitjob.' });
    }
  }
  // 4) Märkte (DAX)
  const dax = await safe('DAX', getChart('^GDAXI', '1y', '1d', 0));
  if (dax && dax.candles.length > 200) {
    const c = dax.candles.map((x) => x.c);
    const hi = Math.max(...c);
    const px = c[c.length - 1];
    const dd = px / hi - 1;
    const s200 = c.slice(-200).reduce((s, x) => s + x, 0) / 200;
    const rets = c.slice(-21).map((v, i, a) => (i ? Math.log(v / a[i - 1]) : 0)).slice(1);
    const vol = Math.sqrt(rets.reduce((s, x) => s + x * x, 0) / rets.length) * Math.sqrt(252) * 100;
    const items: Item[] = [
      { label: 'DAX zum Jahreshoch', value: `${fmt(dd * 100)} %`, note: 'Abstand zum höchsten Stand der letzten 12 Monate', date: 'heute', score: lerp(-dd, 0, 0.25) },
      { label: 'DAX gegen 200-Tage-Linie', value: `${px >= s200 ? '+' : ''}${fmt((px / s200 - 1) * 100)} %`, note: px >= s200 ? 'über dem langfristigen Trend' : 'unter dem langfristigen Trend', date: 'heute', score: lerp(-(px / s200 - 1), 0, 0.1) },
      { label: 'Schwankung (20 Tage)', value: `${fmt(vol, 0)} %`, note: 'hochgerechnet auf ein Jahr', date: 'heute', score: lerp(vol, 10, 35) },
    ];
    const s = avg(items.map((x, i) => ({ s: x.score, w: [0.5, 0.2, 0.3][i] })));
    comps.push({ key: 'market', title: 'Börse (DAX)', icon: 'trending-down', weight: 0.15, score: s, items, line: s < 25 ? 'Die Börse feiert, du hast vermutlich nichts drin.' : s < 55 ? 'Normales Börsenwetter, kein Grund zur Panik.' : 'Der DAX hat sich entschieden, dir den Tag zu ruinieren.' });
  }
  // 5) Politik & Schlagzeilen
  const heads = (await safe('Schlagzeilen', headlines())) ?? [];
  if (heads.length >= 20) {
    const hit = heads.map((h) => ({ ...h, n: STRESS.filter((k) => h.title.toLowerCase().includes(k)).length })).filter((h) => h.n > 0);
    const share = hit.length / heads.length;
    const s = lerp(share, 0.1, 0.4);
    const top = [...hit].sort((a, b) => b.n - a.n).slice(0, 5);
    comps.push({
      key: 'politics',
      title: 'Politik & Schlagzeilen',
      icon: 'newspaper',
      weight: 0.15,
      score: s,
      items: [{ label: 'Anteil Krisen-Schlagzeilen', value: `${fmt(share * 100, 0)} %`, note: `${hit.length} von ${heads.length} aktuellen Politik-Schlagzeilen enthalten Krisen-Wörter (Krieg, Streit, Skandal, Rezession …)`, date: 'heute', score: s }],
      line: s < 25 ? 'Ungewöhnlich ruhig in den Nachrichten. Verdächtig.' : s < 55 ? 'Nachrichten wie immer: genug Drama für jeden Tag.' : 'Die Nachrichten lesen sich wie ein Katastrophenfilm.',
    });
    (globalThis as any).__top = top.map((h) => ({ title: h.title, source: h.source, link: h.link }));
  }
  // 6) Krypto
  const btc = await safe('Bitcoin', getChart('BTC-EUR', '1y', '1d', 0));
  if (btc && btc.candles.length > 100) {
    const c = btc.candles.map((x) => x.c);
    const dd = c[c.length - 1] / Math.max(...c) - 1;
    const s = lerp(-dd, 0, 0.5);
    comps.push({
      key: 'crypto',
      title: 'Krypto-Frust',
      icon: 'logo-bitcoin',
      weight: 0.1,
      score: s,
      items: [{ label: 'Bitcoin zum Jahreshoch', value: `${fmt(dd * 100)} %`, note: `aktuell ca. ${Math.round(c[c.length - 1]).toLocaleString('de-DE')} €`, date: 'heute', score: s }],
      line: s < 25 ? 'Die Coin-Gruppe im Chat ist unerträglich zufrieden.' : s < 55 ? 'HODL-Gesichter werden etwas blasser.' : 'Der Gruppenchat schweigt. Man hört nur noch Memes.',
    });
  }

  if (comps.length < 3) throw new Error('Zu wenige Datenquellen erreichbar: ' + warnings.join('; '));
  const tw = comps.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / tw);

  const levels = [
    { max: 20, label: 'Läuft eigentlich ganz okay', line: 'Selten gesehen. Genieß es, bevor jemand was merkt.' },
    { max: 40, label: 'Ein bisschen fucked', line: 'Nervig, aber machbar. Wie ein Montag, der nie endet.' },
    { max: 60, label: 'Es wird eng', line: 'Nicht Weltuntergang, aber du merkst es bei jedem Kontoauszug.' },
    { max: 80, label: 'We are fucked', line: 'Jetzt wird es ernst. Netflix kündigen hilft nicht mehr.' },
    { max: 101, label: 'Maximal fucked', line: 'Matratze kaufen, Nudeln horten, Notgroschen aufstocken.' },
  ];
  const lv = levels.find((l) => score < l.max)!;

  mkdirSync('data', { recursive: true });
  let hist: { d: string; s: number }[] = [];
  if (existsSync('data/waf.json')) {
    try {
      hist = JSON.parse(readFileSync('data/waf.json', 'utf8')).history ?? [];
    } catch {
      /* neue Historie */
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  hist = hist.filter((h) => h.d !== today).concat({ d: today, s: score }).slice(-400);
  const daysAgo = (n: number) => {
    const t = Date.parse(today) - n * 86400_000;
    const h = [...hist].reverse().find((x) => Date.parse(x.d) <= t);
    return h ? h.s : null;
  };
  const out = {
    generatedAt: Date.now(),
    score,
    label: lv.label,
    line: lv.line,
    prev: { week: daysAgo(7), month: daysAgo(30) },
    components: comps.map((c) => ({ ...c, score: Math.round(c.score), items: c.items.map((i) => ({ ...i, score: Math.round(i.score) })) })),
    headlines: (globalThis as any).__top ?? [],
    history: hist,
    warnings,
  };
  writeFileSync('data/waf.json', JSON.stringify(out));
  console.log(`W.A.F-Score: ${score} (${lv.label})`);
  comps.forEach((c) => console.log(`  ${c.title.padEnd(26)} ${String(Math.round(c.score)).padStart(3)}  (Gewicht ${c.weight * 100} %)  ${c.items.map((i) => `${i.label}: ${i.value}`).join(' | ')}`));
  if (warnings.length) console.log('Warnungen:', warnings.join(' | '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
