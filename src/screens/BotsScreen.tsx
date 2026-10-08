import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { botStats, dailySummaries, DaySummary, isShort, posPct, posPnl } from '../bots/sim';
import { fetchBots } from '../bots/remote';
import Chart, { Pt } from '../components/Chart';
import { PctText } from '../components/Rows';
import { Button, Card, ErrorBox, Loading, Screen, SectionTitle, Segmented, Stat } from '../components/UI';
import { BOTS_PAGE } from '../config';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtPct, timeAgo } from '../format';
import { useAsync } from '../hooks';
import { BotState, Trade } from '../types';
import { colors, signColor, space } from '../theme';

type Which = 'day' | 'long' | 'gold';
type Sub = 'overview' | 'today' | 'positions' | 'trades' | 'days' | 'learn';

const GOAL = 0.3;

const DESC: Record<Which, string> = {
  day: 'Handelt innerhalb des Tages auf 1-Minuten-Kerzen (Trend, VWAP, Momentum, Volumen), mit Stop-Loss und Gewinnziel, und schließt abends alles. Lernt aus eigenen Fehlern. Läuft auf dem Server etwa alle 5 Minuten zu den Börsenzeiten – auch bei geschlossener App.',
  long: 'Kauft die am besten bewerteten großen und mittleren Aktien des Rankings, streut auf 8 Positionen und hält Wochen bis Monate. Läuft auf dem Server täglich – auch bei geschlossener App.',
  gold: 'Handelt Gold (XAU/USD) auf 5-Minuten-Kerzen mit klassischen Strategien: Breakout, Pullback im Trend und Range-Trading. Long und Short, Stop-Loss 2,5 × ATR, Ziel 2:1, max. 1 % Risiko pro Trade, kein Hebel. Läuft auf dem Server laufend Mo–Fr.',
};

export default function BotsScreen() {
  const [which, setWhich] = useState<Which>('day');
  const [sub, setSub] = useState<Sub>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const data = useAsync(fetchBots, []);
  const bot = data.data ? data.data[which] ?? null : null;

  // Die Bots laufen auf dem Server – die App holt nur den neuesten Stand (jede Minute)
  useEffect(() => {
    const h = setInterval(() => data.reload(), 60_000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const intraday = which !== 'long';
  const subOptions: { key: Sub; label: string }[] = intraday
    ? [
        { key: 'overview', label: 'Übersicht' },
        { key: 'today', label: 'Heute' },
        { key: 'positions', label: 'Offen' },
        { key: 'trades', label: 'Trades' },
        { key: 'days', label: 'Tage' },
        ...(which === 'day' ? [{ key: 'learn' as Sub, label: 'Lernen' }] : []),
      ]
    : [
        { key: 'overview', label: 'Übersicht' },
        { key: 'positions', label: 'Positionen' },
        { key: 'trades', label: 'Trades' },
      ];

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
            { key: 'day', label: 'Day-Trading' },
            { key: 'long', label: 'Langzeit' },
            { key: 'gold', label: 'Gold' },
          ]}
        />
        <Text style={s.desc}>{DESC[which]}</Text>

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
        {data.data && !bot ? (
          <Card style={{ marginTop: space.l }}>
            <Text style={s.muted}>Dieser Bot startet mit dem nächsten Server-Lauf (spätestens in ein paar Minuten, Mo–Fr). Danach nach unten ziehen.</Text>
          </Card>
        ) : null}

        {bot ? (
          <>
            <View style={{ marginTop: space.m }}>
              <Segmented value={subOptions.some((o) => o.key === sub) ? sub : 'overview'} onChange={setSub} options={subOptions} />
            </View>

            {sub === 'overview' && <Overview bot={bot} intraday={intraday} onToday={() => setSub('today')} />}
            {sub === 'today' && <TodayTab bot={bot} />}
            {sub === 'positions' && <Positions bot={bot} />}
            {sub === 'trades' && <Trades bot={bot} />}
            {sub === 'days' && <DaysTab bot={bot} />}
            {sub === 'learn' && <LearnTab bot={bot} />}

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

function Stars({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= n ? 'star' : 'star-outline'} size={16} color={i <= n ? colors.amber : colors.border} />
      ))}
    </View>
  );
}

/** Tagesbilanz mit Rating – zeigt immer, was heute gehandelt wurde und wie viel Gewinn/Verlust entstanden ist */
function TodayCard({ day, onPress }: { day: DaySummary; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={{ marginTop: space.l }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.cardTitle}>{day.isToday ? 'Heute' : fmtDate(day.start)}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Stars n={day.stars} />
            <Text style={[s.muted, { marginTop: 2 }]}>Tagesrating: {day.label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
          <Text style={[s.big, { color: signColor(day.change) }]}>
            {day.change >= 0 ? '+' : ''}{fmtMoney(day.change)}
          </Text>
          <PctText v={day.pct} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
          <Stat label="Trades heute" value={String(day.trades.length)} />
          <Stat label="Abgeschlossen" value={`${day.wins} Gewinne · ${day.losses} Verluste`} />
          <Stat label="Realisiert" value={`${day.realized >= 0 ? '+' : ''}${fmtMoney(day.realized)}`} color={signColor(day.realized)} />
          <Stat label="Offene Positionen" value={`${day.change - day.realized >= 0 ? '+' : ''}${fmtMoney(day.change - day.realized)}`} color={signColor(day.change - day.realized)} />
        </View>
        {day.trades.length === 0 ? <Text style={s.muted}>Heute noch kein Trade.</Text> : null}
      </Card>
    </Pressable>
  );
}

function Overview({ bot, intraday, onToday }: { bot: BotState; intraday: boolean; onToday: () => void }) {
  const st = botStats(bot);
  const [scrub, setScrub] = useState<Pt | null>(null);
  const data = useMemo(() => bot.equity.map((e) => ({ t: e.t, v: e.v })), [bot.equity]);
  const days = useMemo(() => dailySummaries(bot), [bot]);
  const shown = scrub?.v ?? st.equity;
  const goalProgress = Math.max(0, Math.min(1, st.monthPct / GOAL));
  return (
    <>
      {intraday ? <TodayCard day={days.find((d) => d.isToday)!} onPress={onToday} /> : null}
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

function TodayTab({ bot }: { bot: BotState }) {
  const day = useMemo(() => dailySummaries(bot).find((d) => d.isToday)!, [bot]);
  return (
    <>
      <TodayCard day={day} />
      <SectionTitle>Alle Trades von heute</SectionTitle>
      {day.trades.length === 0 ? (
        <Card>
          <Text style={s.muted}>Noch kein Trade heute. Sobald der Bot ein Signal findet, erscheint er hier mit Begründung.</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {day.trades.map((t) => (
            <TradeCard key={t.id} t={t} />
          ))}
        </View>
      )}
    </>
  );
}

function DaysTab({ bot }: { bot: BotState }) {
  const days = useMemo(() => dailySummaries(bot), [bot]);
  return (
    <View style={{ marginTop: space.l, gap: 10 }}>
      {days.map((d) => (
        <Card key={d.key} style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={s.sym}>{d.isToday ? 'Heute' : fmtDate(d.start)}</Text>
              <Text style={s.muted}>
                {d.trades.length} Trades · {d.wins} Gewinne · {d.losses} Verluste
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: signColor(d.change), fontWeight: '800', fontSize: 16 }}>
                {d.change >= 0 ? '+' : ''}{fmtMoney(d.change)}
              </Text>
              <PctText v={d.pct} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Stars n={d.stars} />
            <Text style={s.muted}>{d.label}</Text>
          </View>
        </Card>
      ))}
      <Text style={s.muted}>
        Rating: ★★★★★ ab +1 % Tagesplus, ★★★★ ab +0,3 %, ★★★ ab 0 %, ★★ bis −0,5 %, ★ darunter. Ohne Trades kein Rating.
      </Text>
    </View>
  );
}

function LearnTab({ bot }: { bot: BotState }) {
  const learn = bot.learn;
  const now = Date.now();
  const syms = Object.entries(learn?.symbols ?? {}).sort((a, b) => b[1].n - a[1].n);
  const lessons = bot.lessons ?? [];
  const last5 = bot.trades.filter((t) => t.pnl != null).slice(0, 5);
  const strict = last5.length >= 5 && last5.filter((t) => (t.pnl ?? 0) <= 0).length >= 4;
  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.cardTitle}>So lernt der Bot</Text>
        <Text style={[s.muted, { marginTop: 6, lineHeight: 18 }]}>
          Kein Zauber, sondern nachvollziehbare Regeln aus den eigenen Trades:{'\n'}
          • 2 Verluste in Folge bei einer Aktie → für heute gesperrt{'\n'}
          • unter 35 % Trefferquote (ab 5 Trades) → 3 Tage gesperrt{'\n'}
          • gute Trefferquote → mehr Gewicht, schlechte → kleinere Position{'\n'}
          • Handelsstunden mit schlechter Bilanz werden gemieden{'\n'}
          • 4 Verluste in den letzten 5 Trades → „strenger Modus" (höhere Hürden, halbe Größe){'\n'}
          • Tagesverlust über 1,5 % → heute keine neuen Trades
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <Ionicons name={strict ? 'shield-checkmark' : 'speedometer-outline'} size={18} color={strict ? colors.amber : colors.green} />
          <Text style={{ color: strict ? colors.amber : colors.green, fontWeight: '700' }}>{strict ? 'Strenger Modus aktiv' : 'Normalmodus'}</Text>
        </View>
      </Card>

      <SectionTitle>Gelernte Lektionen</SectionTitle>
      {lessons.length === 0 ? (
        <Card>
          <Text style={s.muted}>Noch keine. Lektionen entstehen, sobald der Bot Verlustserien oder auffällige Muster erkennt.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 6 }}>
          {lessons.map((l, i) => (
            <View key={i} style={[{ paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={s.muted}>{fmtDateTime(l.t)}</Text>
              <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{l.text}</Text>
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>Erfahrung pro Aktie</SectionTitle>
      {syms.length === 0 ? (
        <Card>
          <Text style={s.muted}>Noch keine abgeschlossenen Trades.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 6 }}>
          {syms.map(([sym, st], i) => (
            <View key={sym} style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[s.sym, { width: 70 }]}>{sym}</Text>
              <Text style={[s.muted, { flex: 1 }]}>
                {st.w}/{st.n} Gewinne · {fmtPct(st.w / st.n, 0, false)}
                {st.banUntil > now ? ' · gesperrt' : ''}
              </Text>
              <PctText v={st.pnlPct} />
            </View>
          ))}
        </Card>
      )}
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
        const pnl = posPct(p);
        const pnlEur = posPnl(p);
        const short = isShort(p);
        const opened = bot.trades.find((t) => t.symbol === p.symbol && (t.side === 'KAUF' || t.side === 'SHORT'));
        return (
          <Card key={p.symbol}>
            <Pressable onPress={() => nav.navigate('Detail', { symbol: p.symbol })}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.sym}>{p.symbol}</Text>
                    <View style={[s.side, { backgroundColor: short ? colors.redBg : colors.greenBg, paddingVertical: 2 }]}>
                      <Text style={{ color: short ? colors.red : colors.green, fontWeight: '800', fontSize: 10 }}>{short ? 'SHORT' : 'LONG'}</Text>
                    </View>
                  </View>
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
                {p.stop != null ? <Stat label="Stop-Loss" value={fmtMoney(p.stop)} color={colors.red} /> : null}
                {p.target != null ? <Stat label="Gewinnziel" value={fmtMoney(p.target)} color={colors.green} /> : null}
              </View>
              {opened ? <Text style={[s.muted, { lineHeight: 17 }]}>Warum eröffnet: {opened.reason}</Text> : null}
            </Pressable>
          </Card>
        );
      })}
    </View>
  );
}

function TradeCard({ t }: { t: Trade }) {
  const [open, setOpen] = useState(false);
  const opening = t.side === 'KAUF' || t.side === 'SHORT';
  const good = (t.pnl ?? 0) >= 0;
  return (
    <Card style={{ padding: 14 }}>
      <Pressable onPress={() => setOpen(!open)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[s.side, { backgroundColor: opening ? colors.accentBg : good ? colors.greenBg : colors.redBg }]}>
            <Text style={{ color: opening ? colors.accent : good ? colors.green : colors.red, fontWeight: '800', fontSize: 11 }}>{t.side}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.sym}>{t.symbol}</Text>
            <Text style={s.muted}>{fmtDateTime(t.t)} · {fmtNum(t.qty, 3)} Stk. à {fmtMoney(t.price)}</Text>
          </View>
          {!opening && t.pnl != null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: signColor(t.pnl), fontWeight: '800' }}>{t.pnl >= 0 ? '+' : ''}{fmtMoney(t.pnl)}</Text>
              <PctText v={t.pnlPct ?? 0} />
            </View>
          ) : (
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          )}
        </View>
        <Text style={s.reason} numberOfLines={open ? undefined : 2}>{t.reason}</Text>
      </Pressable>
    </Card>
  );
}

function Trades({ bot }: { bot: BotState }) {
  if (!bot.trades.length)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Noch keine Trades. Sobald der Bot ein Signal findet, erscheint der Trade hier – inklusive Begründung.</Text>
      </Card>
    );
  return (
    <View style={{ marginTop: space.l, gap: 10 }}>
      {bot.trades.slice(0, 100).map((t) => (
        <TradeCard key={t.id} t={t} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  desc: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: space.m },
  muted: { color: colors.muted, fontSize: 12 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  big: { fontSize: 26, fontWeight: '800' },
  value: { color: colors.text, fontSize: 32, fontWeight: '800', marginVertical: 2 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: colors.card2, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  sym: { color: colors.text, fontWeight: '700', fontSize: 15 },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  side: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  reason: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  log: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 16 },
});
