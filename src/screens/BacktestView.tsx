import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BACKTEST_URL } from '../config';
import Chart from '../components/Chart';
import { PctText } from '../components/Rows';
import { Card, ErrorBox, Loading, SectionTitle, Stat } from '../components/UI';
import { fmtDate, fmtNum, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { colors, signColor, space } from '../theme';
import TrackView from './TrackView';

interface Res {
  key: string;
  name: string;
  desc: string;
  totalReturn: number;
  cagr: number;
  maxDD: number;
  sharpe: number;
  winMonths: number;
  cashShare: number;
  equity: [number, number][];
  trades?: number;
  winRate?: number;
}

interface Backtest {
  generatedAt: number;
  stocks: { from: number; to: number; years: number; results: Res[] };
  gold: { from: number; to: number; bot: Res; hold: Res } | null;
  notes: string[];
}

async function load(): Promise<Backtest | null> {
  const r = await fetch(`${BACKTEST_URL}?t=${Math.floor(Date.now() / 300_000)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Backtest nicht erreichbar (HTTP ${r.status})`);
  return r.json();
}

const LIVE_KEY = 'mom_trend'; // Strategie, nach der der Langzeit-Bot aktuell kauft

export default function BacktestView() {
  const bt = useAsync(load, []);
  if (bt.loading && !bt.data) return <Loading text="Backtest wird geladen …" />;
  if (bt.error && !bt.data) return <ErrorBox text={bt.error} onRetry={bt.reload} />;
  if (!bt.data)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Noch keine Backtest-Daten. Auf GitHub den Workflow „Backtest berechnen" einmal starten (er läuft danach jeden Sonntag).</Text>
      </Card>
    );

  const b = bt.data;
  const spx = b.stocks.results.find((r) => r.key === 'spx')!;
  const ew = b.stocks.results.find((r) => r.key === 'universe')!;
  const strategies = b.stocks.results.filter((r) => r.key !== 'spx' && r.key !== 'universe');
  const best = [...strategies].sort((x, y) => y.cagr - x.cagr)[0];

  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.title}>Beweis statt Hoffnung</Text>
        <Text style={[s.muted, { marginTop: 6, lineHeight: 19 }]}>
          Ein Backtest lässt jede Strategie über die Vergangenheit laufen – und zwar so, als wüsste sie zum jeweiligen Tag nur, was damals bekannt war. So sieht man vorher, ob eine Idee überhaupt taugt. Aktien: {fmtNum(b.stocks.years, 1)} Jahre ({fmtDate(b.stocks.from)} bis {fmtDate(b.stocks.to)}), monatliche Umschichtung, 0,05 % Gebühr pro Order.
        </Text>
      </Card>

      <Card style={{ marginTop: space.m, backgroundColor: colors.card2 }}>
        <Text style={s.title}>Das Fazit in Klartext</Text>
        <Text style={[s.text, { marginTop: 6 }]}>
          • Beste Aktien-Strategie: „{best.name}" mit {fmtPct(best.cagr, 1)} pro Jahr – der S&P 500 schaffte {fmtPct(spx.cagr, 1)}.{'\n'}
          • Achtung Hindsight: Schon „alle 44 Aktien gleichgewichtet" kommt auf {fmtPct(ew.cagr, 1)}, weil das Universum aus heutigen Gewinnern besteht. Echte Vorteile zeigen sich nur gegenüber DIESEM Maßstab.{'\n'}
          • Marktampel und Relative-Stärke-Filter haben in diesem Test die Rendite eher gesenkt als erhöht – deshalb bremst die Ampel den Langzeit-Bot nicht.{'\n'}
          {b.gold
            ? `• Gold-Bot: ${fmtPct(b.gold.bot.totalReturn, 1)} in ${Math.round((b.gold.to - b.gold.from) / 86400_000)} Tagen (${b.gold.bot.trades} Trades, Trefferquote ${fmtPct(b.gold.bot.winRate ?? 0, 0, false)}). Das ist kein belegter Vorteil – der Bot ist im Spiel, damit du siehst, wie schwer Gold-Trading ist.`
            : ''}
        </Text>
      </Card>

      <SectionTitle>Aktien-Strategien</SectionTitle>
      {[...strategies, ew, spx].map((r) => (
        <ResultCard key={r.key} r={r} spx={spx} live={r.key === LIVE_KEY} bench={r.key === 'spx' || r.key === 'universe'} />
      ))}

      {b.gold ? (
        <>
          <SectionTitle>Gold-Bot</SectionTitle>
          <ResultCard r={b.gold.bot} spx={b.gold.hold} live bench={false} compareLabel="Gold halten" />
          <ResultCard r={b.gold.hold} spx={b.gold.hold} live={false} bench />
        </>
      ) : null}

      <TrackView />

      <SectionTitle>Grenzen des Tests</SectionTitle>
      <Card>
        {b.notes.map((n, i) => (
          <Text key={i} style={[s.muted, { lineHeight: 18, marginBottom: 8 }]}>
            • {n}
          </Text>
        ))}
        <Text style={s.muted}>Stand der Berechnung: {fmtDate(b.generatedAt)}. Vergangene Ergebnisse sind keine Garantie für die Zukunft.</Text>
      </Card>
    </>
  );
}

function ResultCard({ r, spx, live, bench, compareLabel = 'S&P 500' }: { r: Res; spx: Res; live: boolean; bench: boolean; compareLabel?: string }) {
  const series = r.equity.map(([t, v]) => ({ t, v }));
  const diff = r.totalReturn - spx.totalReturn;
  return (
    <Card style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{r.name}</Text>
          {live ? (
            <View style={s.live}>
              <Text style={s.liveText}>wird vom Bot genutzt</Text>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <PctText v={r.totalReturn} digits={0} style={{ fontSize: 20, fontWeight: '800' }} />
          <Text style={s.muted}>gesamt</Text>
        </View>
      </View>
      <View style={{ marginVertical: 8 }}>
        <Chart data={series} height={70} minimal color={bench ? colors.muted : undefined} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {r.key.startsWith('gold') ? null : <Stat label="pro Jahr" value={fmtPct(r.cagr, 1)} color={signColor(r.cagr)} />}
        <Stat label="größter Rückgang" value={fmtPct(r.maxDD, 0, false)} color={colors.red} />
        {r.key.startsWith('gold') ? null : <Stat label="Sharpe (Rendite/Risiko)" value={fmtNum(r.sharpe, 2)} />}
        {r.key.startsWith('gold') ? null : <Stat label="Monate im Plus" value={fmtPct(r.winMonths, 0, false)} />}
        {r.trades != null ? <Stat label="Trades" value={String(r.trades)} /> : null}
        {r.winRate != null ? <Stat label="Trefferquote" value={fmtPct(r.winRate, 0, false)} /> : null}
        {r.cashShare > 0.02 ? <Stat label="Zeit in Cash" value={fmtPct(r.cashShare, 0, false)} /> : null}
      </View>
      {!bench ? (
        <Text style={[s.muted, { marginTop: 4 }]}>
          {diff >= 0 ? 'Besser' : 'Schlechter'} als {compareLabel}: {fmtPct(diff, 0)}-Punkte
        </Text>
      ) : null}
      <Text style={[s.muted, { marginTop: 6, lineHeight: 17 }]}>{r.desc}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  text: { color: colors.text, fontSize: 13, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 12 },
  live: { alignSelf: 'flex-start', backgroundColor: colors.accentBg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  liveText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
});
