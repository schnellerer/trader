/**
 * Handelsdurchgang der Papertrading-Bots auf dem GitHub-Server.
 *   MODE=day | long | both | reset    (reset: Bots mit START_CAPITAL neu starten)
 *   DATA_DIR=<Ordner mit bots.json>   (Standard: ./botdata)
 *   START_CAPITAL=10000
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stepDayBot } from '../src/bots/dayBot';
import { stepLongBot } from '../src/bots/longBot';
import { newBot } from '../src/bots/sim';
import { toRankItems } from '../src/analysis/rankingData';
import { BotState } from '../src/types';

interface BotsFile {
  updatedAt: number;
  startCapital: number;
  day: BotState;
  long: BotState;
}

const dir = process.env.DATA_DIR || 'botdata';
const file = `${dir}/bots.json`;
const mode = process.env.MODE || 'day';
const capital = Number(process.env.START_CAPITAL || 10000);

function load(): BotsFile {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  return { updatedAt: Date.now(), startCapital: capital, day: newBot(capital), long: newBot(capital) };
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
    data = { updatedAt: Date.now(), startCapital: capital, day: newBot(capital), long: newBot(capital) };
    save(data);
    console.log(`Bots mit ${capital} € neu gestartet.`);
    return;
  }

  let failed = false;
  if (mode === 'day' || mode === 'both') {
    try {
      data.day = await stepDayBot(data.day);
      console.log('Day-Bot:', data.day.lastLog);
    } catch (e: any) {
      failed = true;
      console.error('Day-Bot Fehler:', e?.message);
    }
  }
  if (mode === 'long' || mode === 'both') {
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
