/**
 * Handelsdurchgang der Papertrading-Bots auf dem GitHub-Server.
 *   MODE=auto | day | long | gold | all | reset    (reset: Bots mit START_CAPITAL neu starten)
 *   DATA_DIR=<Ordner mit bots.json>   (Standard: ./botdata)
 *   START_CAPITAL=10000
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stepDayBot } from '../src/bots/dayBot';
import { stepGoldBot } from '../src/bots/goldBot';
import { stepLongBot } from '../src/bots/longBot';
import { newBot } from '../src/bots/sim';
import { toRankItems } from '../src/analysis/rankingData';
import { BotState } from '../src/types';

interface BotsFile {
  updatedAt: number;
  startCapital: number;
  day: BotState;
  long: BotState;
  gold: BotState;
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

  let failed = false;
  if (runGold) {
    try {
      data.gold = await stepGoldBot(data.gold);
      console.log('Gold-Bot:', data.gold.lastLog);
    } catch (e: any) {
      failed = true;
      console.error('Gold-Bot Fehler:', e?.message);
    }
  }
  if (runDay) {
    try {
      data.day = await stepDayBot(data.day);
      console.log('Day-Bot:', data.day.lastLog);
    } catch (e: any) {
      failed = true;
      console.error('Day-Bot Fehler:', e?.message);
    }
  }
  if (runLong) {
    try {
      const ranking = await toRankItems(JSON.parse(readFileSync('data/ranking.json', 'utf8')));
      data.long = await stepLongBot(data.long, ranking);
      console.log('Langzeit-Bot:', data.long.lastLog);
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
