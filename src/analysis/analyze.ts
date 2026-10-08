import { getChart } from '../api/yahoo';
import { getStockNews } from '../api/news';
import { Analysis } from '../types';
import { mean } from './indicators';
import { assessBias, buildScenarios, driftStats } from './model';

export async function analyzeStock(symbol: string): Promise<Analysis> {
  const [dailyRes, weeklyRes] = await Promise.all([getChart(symbol, '2y', '1d', 300_000), getChart(symbol, '10y', '1wk', 600_000)]);
  const meta = dailyRes.meta;
  const news = await getStockNews(symbol, meta.name).catch(() => []);
  const recent = news.slice(0, 15);
  const newsSentiment = recent.length ? mean(recent.map((n) => n.sentiment)) : 0;

  const weeklyCloses = weeklyRes.candles.map((c) => c.c);
  const useWeekly = weeklyCloses.length >= 52;
  const stats = useWeekly
    ? driftStats(weeklyCloses, 52)
    : driftStats(dailyRes.candles.map((c) => c.c), 252);
  const { bias, score, signals } = assessBias(dailyRes.candles, newsSentiment);

  return {
    meta,
    daily: dailyRes.candles,
    bias,
    score,
    signals,
    scenarios: buildScenarios(stats, score),
    vol: stats.vol,
    drift: stats.drift,
    historyYears: useWeekly ? weeklyCloses.length / 52 : dailyRes.candles.length / 252,
    news,
    newsSentiment,
  };
}
