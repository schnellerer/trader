/**
 * Handelsdurchgang der Papertrading-Bots auf dem GitHub-Server.
 *   MODE=auto | day | long | gold | all | reset    (reset: Bots mit START_CAPITAL neu starten)
 *   DATA_DIR=<Ordner mit bots.json>   (Standard: ./botdata)
 *   START_CAPITAL=10000
 *   NTFY_TOPIC=<geheimer Name>        (optional: Handy-Benachrichtigungen über ntfy.sh)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { marketRegime, Regime } from '../src/analysis/regime';
import { BotCtx } from '../src/bots/ctx';
import { stepDayBot } from '../src/bots/dayBot';
import { stepGoldBot } from '../src/bots/goldBot';
import { stepLongBot } from '../src/bots/longBot';
import { newBot } from '../src/bots/sim';
import { toRankItems } from '../src/analysis/rankingData';
import { BotState } from '../src/types';
import { notify } from './notify';

interface BotsFile {
  updatedAt: number;
  startCapital: number;
  day: BotState;
  long: BotState;
  gold: BotState;
  regime?: Regime;
  regimeAt?: number;
}

const dir = process.env.DATA_DIR || 'botdata';
const file = `${dir}/bots.json`;
// auto = Zeitplan entscheidet (Day-Bot zu Börsenzeiten, Gold laufend, Langzeit-Bot mittags/abends); sonst day | long | gold | all
const mode = process.env.MODE || 'auto';
const capital = Number(process.env.START_CAPITAL || 10000);

function load(): BotsFile {
  if (existsSync(file)) {
    const d = JSON.parse(readFileSync(file, 'utf8')) as BotsFile;
    d.gold ??= newBot(d.startCapital); // ältere Dateien ohne Gold-Bot
    return d;
  }
  return { updatedAt: Date.now(), startCapital: capital, day: newBot(capital), long: newBot(capital), gold: newBot(capital) };
}

function save(d: BotsFile) {
  mkdirSync(dir, { recursive: true });
  d.updatedAt = Date.now();
  writeFileSync(file, JSON.stringify(d));
}

/** Neue Trades eines Bots als Handy-Nachricht melden */
async function tell(name: string, before: BotState, after: BotState) {
  const fresh = after.trades.slice(0, Math.max(0, after.trades.length - before.trades.length)).reverse();
  for (const t of fresh) {
    const pnl = t.pnl != null ? ` ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} €` : '';
    await notify(`${name}: ${t.side} ${t.symbol}`, `${t.qty.toFixed(3)} Stk. à ${t.price.toFixed(2)} €${pnl}\n${t.reason.slice(0, 200)}`, t.pnl != null && t.pnl < 0 ? 4 : 3);
  }
}

async function main() {
  let data = load();

  if (mode === 'reset') {
    if (!isFinite(capital) || capital < 100) throw new Error('Ungültiges Startkapital');
    data = { updatedAt: Date.now(), startCapital: capital, day: newBot(capital), long: newBot(capital), gold: newBot(capital) };
    save(data);
    console.log(`Bots mit ${capital} € neu gestartet.`);
    return;
  }

  const hour = new Date().getUTCHours();
  const age = (b: BotState) => Date.now() - (b.lastRun ?? 0);
  const all = mode === 'all' || mode === 'both';
  const runDay = all || mode === 'day' || (mode === 'auto' && hour >= 6 && hour <= 21);
  const runGold = all || mode === 'gold' || (mode === 'auto' && age(data.gold) > 3 * 60_000);
  const runLong = all || mode === 'long' || (mode === 'auto' && (hour === 15 || hour === 23) && age(data.long) > 6 * 3600_000);

  // Marktampel (alle 10 Minuten neu berechnen) und Quartalszahlen-Termine
  const ctx: BotCtx = {};
  try {
    if (!data.regime || Date.now() - (data.regimeAt ?? 0) > 10 * 60_000) {
      const old = data.regime?.state;
      data.regime = await marketRegime();
      data.regimeAt = Date.now();
      if (old && old !== data.regime.state) await notify(data.regime.title, data.regime.text, data.regime.state === 'red' ? 5 : 3);
      console.log('Marktampel:', data.regime.state);
    }
    ctx.regime = data.regime;
  } catch (e: any) {
    console.warn('Marktampel nicht verfügbar:', e?.message);
    ctx.regime = data.regime;
  }
  try {
    ctx.earnings = JSON.parse(readFileSync('data/earnings.json', 'utf8')).map;
  } catch {
    /* ohne Earnings-Termine weiter */
  }

  let failed = false;
  if (runGold) {
    try {
      const before = data.gold;
      data.gold = await stepGoldBot(data.gold);
      console.log('Gold-Bot:', data.gold.lastLog);
      await tell('Gold-Bot', before, data.gold);
    } catch (e: any) {
      failed = true;
      console.error('Gold-Bot Fehler:', e?.message);
    }
  }
  if (runDay) {
    try {
      const before = data.day;
      data.day = await stepDayBot(data.day, ctx);
      console.log('Day-Bot:', data.day.lastLog);
      await tell('Day-Bot', before, data.day);
    } catch (e: any) {
      failed = true;
      console.error('Day-Bot Fehler:', e?.message);
    }
  }
  if (runLong) {
    try {
      const before = data.long;
      const ranking = await toRankItems(JSON.parse(readFileSync('data/ranking.json', 'utf8')));
      data.long = await stepLongBot(data.long, ranking, ctx);
      console.log('Langzeit-Bot:', data.long.lastLog);
      await tell('Langzeit-Bot', before, data.long);
    } catch (e: any) {
      failed = true;
      console.error('Langzeit-Bot Fehler:', e?.message);
    }
  }
  save(data);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
