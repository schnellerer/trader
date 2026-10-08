import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { botStats } from '../bots/sim';
import { fetchBots } from '../bots/remote';
import Chart, { Pt } from '../components/Chart';
import { PctText } from '../components/Rows';
import { Button, Card, ErrorBox, Loading, Screen, SectionTitle, Segmented, Stat } from '../components/UI';
import { BOTS_PAGE } from '../config';
import { fmtDateTime, fmtMoney, fmtNum, fmtPct, timeAgo } from '../format';
import { useAsync } from '../hooks';
import { BotState, Trade } from '../types';
import { colors, signColor, space } from '../theme';

type Which = 'day' | 'long';
type Sub = 'overview' | 'positions' | 'trades';

const GOAL = 0.3;

export default function BotsScreen() {
  const [which, setWhich] = useState<Which>('day');
  const [sub, setSub] = useState<Sub>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const data = useAsync(fetchBots, []);
  const bot = data.data ? data.data[which] : null;

  // Die Bots laufen auf dem Server – die App holt nur den neuesten Stand (jede Minute)
  useEffect(() => {
    const h = setInterval(() => data.reload(), 60_000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen title="Trading-Bots" subtitle="Papertrading mit Spielgeld – jeder Trade wird begründet">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await data.reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <Segmented
          value={which}
          onChange={(w) => {
            setWhich(w);
            setSub('overview');
          }}
          options={[
            { key: 'day', label: 'Day-Trading-Bot' },
            { key: 'long', label: 'Langzeit-Bot' },
          ]}
        />
        <Text style={s.desc}>
          {which === 'day'
            ? 'Handelt kurzfristig innerhalb des Tages (5-Minuten-Kurse, VWAP + RSI), mit engem Stop-Loss, und schließt abends alles. Läuft auf dem Server alle ca. 5 Minuten zu den Börsenzeiten – auch bei geschlossener App.'
            : 'Kauft die am besten bewerteten Aktien des Rankings, streut auf 8 Positionen und hält Wochen bis Monate. Läuft auf dem Server täglich nach dem Ranking – auch bei geschlossener App.'}
        </Text>

        {data.loading && !data.data ? <Loading text="Bot-Stand wird geladen …" /> : null}
        {data.error && !data.data ? <ErrorBox text={data.error} onRetry={data.reload} /> : null}
        {data.data === null && !data.loading && !data.error ? (
          <Card style={{ marginTop: space.l }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Die Bots haben noch nicht gehandelt</Text>
            <Text style={[s.muted, { marginTop: 6, lineHeight: 18 }]}>
              Der erste Durchgang startet automatisch zur nächsten Börsenzeit (Mo–Fr). Du kannst ihn auch sofort auf GitHub starten: Workflow „Bots handeln" → „Run workflow".
            </Text>
            <Button label="GitHub-Seite öffnen" icon="open-outline" kind="ghost" onPress={() => Linking.openURL(BOTS_PAGE)} />
          </Card>
        ) : null}

        {bot ? (
          <>
            <View style={{ marginTop: space.m }}>
              <Segmented
                value={sub}
                onChange={setSub}
                options={[
                  { key: 'overview', label: 'Übersicht' },
                  { key: 'positions', label: 'Positionen' },
                  { key: 'trades', label: 'Trades' },
                ]}
              />
            </View>

            {sub === 'overview' && <Overview bot={bot} />}
            {sub === 'positions' && <Positions bot={bot} />}
            {sub === 'trades' && <Trades bot={bot} />}

            <Text style={s.log}>
              Letzter Bot-Lauf: {bot.lastRun ? `${fmtDateTime(bot.lastRun)} (${timeAgo(bot.lastRun)})` : '–'} · {bot.lastLog}
              {'\n'}Ansicht aktualisiert sich jede Minute, zum Neuladen nach unten ziehen.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Overview({ bot }: { bot: BotState }) {
  const st = botStats(bot);
  const [scrub, setScrub] = useState<Pt | null>(null);
  const data = useMemo(() => bot.equity.map((e) => ({ t: e.t, v: e.v })), [bot.equity]);
  const shown = scrub?.v ?? st.equity;
  const goalProgress = Math.max(0, Math.min(1, st.monthPct / GOAL));
  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Gesamtwert</Text>
        <Text style={s.value}>{fmtMoney(shown)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ color: signColor(st.pnl), fontWeight: '700' }}>
            {st.pnl >= 0 ? '+' : ''}{fmtMoney(st.pnl)}
          </Text>
          <PctText v={st.pnlPct} />
          <Text style={s.muted}>{scrub ? fmtDateTime(scrub.t) : 'seit Start'}</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <Chart data={data} height={150} baseline={bot.startCapital} onScrub={setScrub} />
        </View>
      </Card>

      <SectionTitle>Ziel: +30 % im Monat</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.muted}>Letzte 30 Tage</Text>
          <Text style={{ color: signColor(st.monthPct), fontWeight: '700' }}>{fmtPct(st.monthPct)}</Text>
        </View>
        <View style={s.barBg}>
          <View style={[s.barFill, { width: `${goalProgress * 100}%`, backgroundColor: st.monthPct >= GOAL ? colors.green : colors.accent }]} />
        </View>
        <Text style={[s.muted, { marginTop: 8, lineHeight: 17 }]}>
          {st.monthPct >= GOAL ? 'Ziel erreicht – aber Vorsicht: Das ist über Monate kaum haltbar.' : 'Das Ziel ist sehr ambitioniert; die Werte hier zeigen ehrlich, wie sich der Bot tatsächlich schlägt.'}
        </Text>
      </Card>

      <SectionTitle>Kennzahlen</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Stat label="Startkapital" value={fmtMoney(bot.startCapital)} />
          <Stat label="Freies Geld (Cash)" value={fmtMoney(bot.cash)} />
          <Stat label="Abgeschlossene Trades" value={String(st.closed)} />
          <Stat label="Trefferquote" value={st.closed ? fmtPct(st.winRate, 0, false) : '–'} />
          <Stat label="Bester Trade" value={st.best ? `${st.best.symbol} ${fmtPct(st.best.pnlPct ?? 0)}` : '–'} color={colors.green} />
          <Stat label="Schlechtester Trade" value={st.worst ? `${st.worst.symbol} ${fmtPct(st.worst.pnlPct ?? 0)}` : '–'} color={colors.red} />
          <Stat label="Gebühren (simuliert)" value={fmtMoney(st.fees)} />
          <Stat label="Offene Positionen" value={String(bot.positions.length)} />
        </View>
      </Card>
    </>
  );
}

function Positions({ bot }: { bot: BotState }) {
  const nav = useNavigation<any>();
  if (!bot.positions.length)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Aktuell keine offenen Positionen.</Text>
      </Card>
    );
  return (
    <View style={{ marginTop: space.l, gap: 10 }}>
      {bot.positions.map((p) => {
        const pnl = p.lastPrice / p.avgPrice - 1;
        const pnlEur = p.qty * (p.lastPrice - p.avgPrice);
        const lastBuy = bot.trades.find((t) => t.symbol === p.symbol && t.side === 'KAUF');
        return (
          <Card key={p.symbol}>
            <Pressable onPress={() => nav.navigate('Detail', { symbol: p.symbol })}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sym}>{p.symbol}</Text>
                  <Text style={s.muted} numberOfLines={1}>{p.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: signColor(pnlEur), fontWeight: '800', fontSize: 16 }}>
                    {pnlEur >= 0 ? '+' : ''}{fmtMoney(pnlEur)}
                  </Text>
                  <PctText v={pnl} />
                </View>
              </View>
              <View style={s.posGrid}>
                <Stat label="Stück" value={fmtNum(p.qty, 3)} />
                <Stat label="Einstand" value={fmtMoney(p.avgPrice)} />
                <Stat label="Aktuell" value={fmtMoney(p.lastPrice)} />
                <Stat label="Wert" value={fmtMoney(p.qty * p.lastPrice)} />
              </View>
              {lastBuy ? <Text style={[s.muted, { lineHeight: 17 }]}>Warum gekauft: {lastBuy.reason}</Text> : null}
            </Pressable>
          </Card>
        );
      })}
    </View>
  );
}

function Trades({ bot }: { bot: BotState }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!bot.trades.length)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Noch keine Trades. Sobald der Bot ein Signal findet, erscheint der Trade hier – inklusive Begründung.</Text>
      </Card>
    );
  return (
    <View style={{ marginTop: space.l, gap: 10 }}>
      {bot.trades.slice(0, 100).map((t: Trade) => {
        const isOpen = open === t.id;
        const buy = t.side === 'KAUF';
        return (
          <Card key={t.id} style={{ padding: 14 }}>
            <Pressable onPress={() => setOpen(isOpen ? null : t.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.side, { backgroundColor: buy ? colors.accentBg : t.pnl! >= 0 ? colors.greenBg : colors.redBg }]}>
                  <Text style={{ color: buy ? colors.accent : t.pnl! >= 0 ? colors.green : colors.red, fontWeight: '800', fontSize: 11 }}>{t.side}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.sym}>{t.symbol}</Text>
                  <Text style={s.muted}>{fmtDateTime(t.t)} · {fmtNum(t.qty, 3)} Stk. à {fmtMoney(t.price)}</Text>
                </View>
                {!buy && t.pnl != null ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: signColor(t.pnl), fontWeight: '800' }}>{t.pnl >= 0 ? '+' : ''}{fmtMoney(t.pnl)}</Text>
                    <PctText v={t.pnlPct ?? 0} />
                  </View>
                ) : (
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                )}
              </View>
              {isOpen || true ? <Text style={s.reason} numberOfLines={isOpen ? undefined : 2}>{t.reason}</Text> : null}
            </Pressable>
          </Card>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  desc: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: space.m },
  muted: { color: colors.muted, fontSize: 12 },
  value: { color: colors.text, fontSize: 32, fontWeight: '800', marginVertical: 2 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: colors.card2, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  sym: { color: colors.text, fontWeight: '700', fontSize: 15 },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  side: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  reason: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  log: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 16 },
});
