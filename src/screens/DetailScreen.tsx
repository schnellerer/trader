import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzeStock } from '../analysis/analyze';
import { getFund } from '../analysis/fundData';
import { combineVerdict, scoreFund } from '../analysis/fundamental';
import { buildPlan } from '../analysis/tradePlan';
import { equityOf } from '../bots/sim';
import DividendPanel from '../components/DividendPanel';
import { FundTab, PlanTab, VerdictCard } from '../components/StockPanels';
import { biasLabel, horizonLabel } from '../analysis/model';
import { getChart, RANGES, RangeKey } from '../api/yahoo';
import Chart, { Pt } from '../components/Chart';
import { NewsRow, PctText } from '../components/Rows';
import { BiasBadge, Card, Disclaimer, ErrorBox, Loading, SectionTitle, Segmented, Stat } from '../components/UI';
import { currencySymbol, fmtDateTime, fmtNum, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { getState, toggleWatch, useStore } from '../store';
import { colors, signColor, space } from '../theme';

type Tab = 'overview' | 'fund' | 'dividend' | 'plan' | 'analysis' | 'scenarios' | 'news';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Überblick' },
  { key: 'fund', label: 'Fundament' },
  { key: 'dividend', label: 'Dividende' },
  { key: 'plan', label: 'Trade-Plan' },
  { key: 'analysis', label: 'Chart' },
  { key: 'scenarios', label: 'Szenarien' },
  { key: 'news', label: 'News' },
];

export default function DetailScreen() {
  const nav = useNavigation<any>();
  const { symbol, tab: startTab } = useRoute<any>().params;
  const insets = useSafeAreaInsets();
  const watched = useStore((s) => s.watchlist.includes(symbol));
  const [tab, setTab] = useState<Tab>((startTab as Tab) ?? 'overview');
  const [range, setRange] = useState<RangeKey>('1J');
  const [scrub, setScrub] = useState<Pt | null>(null);
  const [horizon, setHorizon] = useState(30 / 365);

  const chart = useAsync(() => getChart(symbol, RANGES[range].range, RANGES[range].interval), [symbol, range]);
  const an = useAsync(() => analyzeStock(symbol), [symbol]);
  const fundRes = useAsync(() => getFund(symbol), [symbol]);

  const meta = chart.data?.meta ?? an.data?.meta;
  const fscore = useMemo(() => (fundRes.data?.fund ? scoreFund(fundRes.data.fund, meta?.price) : null), [fundRes.data, meta?.price]);
  const plan = useMemo(() => (an.data ? buildPlan(an.data.daily, an.data.bias, fundRes.data?.fund) : null), [an.data, fundRes.data]);
  const verdict = useMemo(
    () => (an.data && !fundRes.loading ? combineVerdict(fscore, an.data.bias, an.data.score, { extended: plan?.extended, rsi: plan?.rsi }) : null),
    [an.data, fscore, plan, fundRes.loading],
  );
  const cur = currencySymbol(meta?.currency);
  const series: Pt[] = useMemo(() => chart.data?.candles.map((c) => ({ t: c.t, v: c.c })) ?? [], [chart.data]);
  const first = series[0]?.v ?? 0;
  const shown = scrub?.v ?? series[series.length - 1]?.v ?? meta?.price ?? 0;
  const periodChg = first ? shown / first - 1 : 0;

  useEffect(() => setScrub(null), [range]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 4 }}>
      <View style={s.top}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={s.sym}>{symbol}</Text>
          <Text style={s.name} numberOfLines={1}>{meta?.name ?? ' '}</Text>
        </View>
        <Pressable onPress={() => toggleWatch(symbol)} hitSlop={12}>
          <Ionicons name={watched ? 'star' : 'star-outline'} size={24} color={watched ? colors.amber : colors.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 60 }} scrollEnabled={!scrub}>
        {chart.error && !chart.data ? (
          <ErrorBox text={chart.error} onRetry={chart.reload} />
        ) : (
          <>
            <Text style={s.price}>{fmtNum(shown)} {cur}</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', height: 20 }}>
              <PctText v={periodChg} />
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {scrub ? fmtDateTime(scrub.t) : `Zeitraum ${range}`}
              </Text>
            </View>
            <View style={{ marginTop: 12 }}>
              {chart.loading && !chart.data ? <View style={{ height: 220 }}><Loading /></View> : <Chart data={series} height={220} onScrub={setScrub} />}
            </View>
            <View style={s.ranges}>
              {(Object.keys(RANGES) as RangeKey[]).map((r) => (
                <Pressable key={r} onPress={() => setRange(r)} style={[s.rangeItem, range === r && { backgroundColor: colors.card2 }]}>
                  <Text style={[s.rangeText, range === r && { color: colors.text }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <VerdictCard verdict={verdict} fund={fscore} bias={an.data?.bias ?? null} loading={an.loading || fundRes.loading} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l, marginTop: space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: 8 }}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tabChip, tab === t.key && s.tabChipActive]}>
              <Text style={[s.tabText, tab === t.key && { color: colors.onAccent }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'fund' && <FundTab res={fundRes.data} score={fscore} loading={fundRes.loading} />}
        {tab === 'dividend' && (fundRes.loading && !fundRes.data ? <Loading text="Kennzahlen werden geladen …" /> : <DividendPanel symbol={symbol} fund={fundRes.data?.fund ?? null} fundScore={fscore?.total ?? null} cur={cur || '$'} price={meta?.price} />)}
        {tab === 'plan' && (
          <PlanTab plan={plan} cur={cur} symbol={symbol} defaultCapital={getState().me ? equityOf(getState().me!) : 10000} onDuell={() => nav.navigate('Tabs', { screen: 'Training', params: { symbol, ts: Date.now() } })} />
        )}

        {tab === 'overview' && (
          <Card style={{ marginTop: space.l }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Stat label="Aktueller Kurs" value={`${fmtNum(meta?.price ?? 0)} ${cur}`} />
              <Stat label="Vortag" value={`${fmtNum(meta?.prevClose ?? 0)} ${cur}`} />
              <Stat label="52-Wochen-Hoch" value={meta?.high52 ? `${fmtNum(meta.high52)} ${cur}` : '–'} />
              <Stat label="52-Wochen-Tief" value={meta?.low52 ? `${fmtNum(meta.low52)} ${cur}` : '–'} />
              <Stat label="Börse" value={meta?.exchange || '–'} />
              <Stat label="Währung" value={meta?.currency || '–'} />
              <Stat label="Schwankung (p.a.)" value={an.data ? fmtPct(an.data.vol, 0, false) : '…'} />
              <Stat label="Historie" value={an.data ? `${an.data.historyYears.toFixed(1).replace('.', ',')} Jahre` : '…'} />
            </View>
          </Card>
        )}

        {tab !== 'overview' && tab !== 'fund' && an.loading && !an.data && <Loading text="Aktie wird analysiert …" />}
        {tab !== 'overview' && tab !== 'fund' && an.error && !an.data && <ErrorBox text={an.error} onRetry={an.reload} />}

        {tab === 'analysis' && an.data && (
          <>
            <Card style={{ marginTop: space.l }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={s.muted}>Gesamteinschätzung</Text>
                  <View style={{ marginTop: 6 }}><BiasBadge bias={an.data.bias} /></View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.muted}>Signal-Score</Text>
                  <Text style={[s.big, { color: signColor(an.data.score) }]}>{an.data.score > 0 ? '+' : ''}{an.data.score}</Text>
                </View>
              </View>
              <Text style={[s.muted, { marginTop: 12, lineHeight: 18 }]}>
                {an.data.bias === 'bullish'
                  ? 'Mehrere Trend- und Momentum-Signale sprechen aktuell für steigende Kurse.'
                  : an.data.bias === 'bearish'
                  ? 'Mehrere Trend- und Momentum-Signale sprechen aktuell für fallende Kurse.'
                  : 'Die Signale sind gemischt – kein klarer Trend erkennbar.'}
              </Text>
            </Card>
            <SectionTitle>Begründung</SectionTitle>
            <Card style={{ paddingVertical: 6 }}>
              {an.data.signals.map((sg, i) => (
                <View key={i} style={[s.sigRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Ionicons
                    name={sg.value > 0 ? 'arrow-up-circle' : sg.value < 0 ? 'arrow-down-circle' : 'ellipse-outline'}
                    size={20}
                    color={sg.value > 0 ? colors.green : sg.value < 0 ? colors.red : colors.muted}
                  />
                  <Text style={s.sigText}>{sg.text}</Text>
                </View>
              ))}
            </Card>
            <Disclaimer />
          </>
        )}

        {tab === 'scenarios' && an.data && (
          <>
            <View style={{ marginTop: space.l }}>
              <Segmented
                value={String(horizon)}
                onChange={(k) => setHorizon(Number(k))}
                options={an.data.scenarios.map((x) => ({ key: String(x.years), label: horizonLabel(x.years, true) }))}
              />
            </View>
            {an.data.scenarios
              .filter((x) => String(x.years) === String(horizon))
              .map((x) => (
                <View key={x.years}>
                  <Scenario label="Bullisch" sub="gute Entwicklung (oberer Bereich)" v={x.bull} icon="rocket" color={colors.green} bg={colors.greenBg} />
                  <Scenario label="Basis" sub="wahrscheinlichste Entwicklung (Median)" v={x.base} icon="analytics" color={colors.accent} bg={colors.accentBg} />
                  <Scenario label="Bärisch" sub="schlechte Entwicklung (unterer Bereich)" v={x.bear} icon="warning" color={colors.red} bg={colors.redBg} />
                  <Card style={{ marginTop: 10 }}>
                    <Text style={s.muted}>Modell-Wahrscheinlichkeit für Gewinn nach {horizonLabel(x.years)}</Text>
                    <Text style={[s.big, { color: x.probProfit >= 0.5 ? colors.green : colors.red }]}>{(x.probProfit * 100).toFixed(0)} %</Text>
                  </Card>
                </View>
              ))}
            <Card style={{ marginTop: 10 }}>
              <Text style={s.muted}>So entstehen die Zahlen</Text>
              <Text style={s.expl}>
                Grundlage ist die Schwankung der Aktie ({fmtPct(an.data.vol, 0, false)} p.a.) aus {an.data.historyYears.toFixed(1).replace('.', ',')} Jahren Historie. Die erwartete Rendite ({fmtPct(an.data.drift, 1)} p.a.) ist stark Richtung langfristigem Marktschnitt (7 %) gedämpft, weil vergangene Gewinne wenig über die Zukunft verraten. Kurzfristig (1 Jahr) fließt die aktuelle Einstufung „{biasLabel(an.data.bias)}" als Zuschlag ein. Bullisch/Bärisch entsprechen dem oberen/unteren Rand eines typischen Schwankungsbereichs (±1 Standardabweichung) – es kann auch deutlich besser oder schlechter kommen.
              </Text>
            </Card>
            <Disclaimer />
          </>
        )}

        {tab === 'news' && an.data && (
          <View style={{ marginTop: space.m }}>
            <Card style={{ marginBottom: 8 }}>
              <Text style={s.muted}>News-Stimmung (letzte Meldungen)</Text>
              <Text style={[s.big, { color: signColor(an.data.newsSentiment) }]}>
                {an.data.newsSentiment > 0.15 ? 'Positiv' : an.data.newsSentiment < -0.15 ? 'Negativ' : 'Neutral'}
              </Text>
              <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>Einfache Schlagzeilen-Analyse, nur ein grober Hinweis.</Text>
            </Card>
            {an.data.news.length === 0 ? <Text style={s.muted}>Keine News gefunden.</Text> : an.data.news.map((n, i) => <NewsRow key={i} n={n} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Scenario({ label, sub, v, icon, color, bg }: { label: string; sub: string; v: number; icon: string; color: string; bg: string }) {
  return (
    <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{sub}</Text>
      </View>
      <Text style={{ color: signColor(v), fontSize: 20, fontWeight: '800' }}>{fmtPct(v, 0)}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.m, paddingBottom: space.s },
  sym: { color: colors.text, fontSize: 18, fontWeight: '700' },
  name: { color: colors.muted, fontSize: 12 },
  price: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 4 },
  ranges: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  tabChip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9 },
  tabChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  rangeItem: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99 },
  rangeText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12 },
  big: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  sigRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sigText: { color: colors.text, fontSize: 14, flex: 1, lineHeight: 19 },
  expl: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
