import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getChart, pool, searchSymbols, toEur } from '../api/yahoo';
import { equityOf, FEE_RATE, posPct, posPnl } from '../bots/sim';
import { fetchBots } from '../bots/remote';
import Chart from '../components/Chart';
import { PctText } from '../components/Rows';
import { Button, Card, Disclaimer, Loading, Screen, SectionTitle, Segmented, Stat } from '../components/UI';
import { fmtMoney, fmtNum, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { endGame, getState, playerBuy, playerSell, refreshPlayerPrices, startGame, useStore } from '../store';
import { BotState, SearchHit } from '../types';
import { colors, radius, signColor, space } from '../theme';
import { TradeCard } from './BotsScreen';
import CoachView from './CoachView';

type Sub = 'rank' | 'trade' | 'depot' | 'log' | 'coach';

let handledTs: number | undefined; // zuletzt übernommene Kaufidee (damit sie beim Zurückwechseln nicht erneut öffnet)

interface Quote {
  symbol: string;
  name: string;
  priceEur: number;
  nativePrice: number;
  currency: string;
  chg: number;
}

async function loadQuote(symbol: string): Promise<Quote> {
  const d = await getChart(symbol, '5d', '1d', 20_000);
  if (d.meta.currency !== 'USD' && d.meta.currency !== 'EUR') throw new Error(`Währung ${d.meta.currency} wird im Spiel nicht unterstützt (nur USD/EUR).`);
  const prev = d.candles.length > 1 ? d.candles[d.candles.length - 2].c : d.meta.prevClose;
  return {
    symbol: d.meta.symbol,
    name: d.meta.name,
    priceEur: await toEur(d.meta.price, d.meta.currency),
    nativePrice: d.meta.price,
    currency: d.meta.currency,
    chg: prev ? d.meta.price / prev - 1 : 0,
  };
}

/** Rendite eines Bots seit einem Zeitpunkt (Vergleich fair ab deinem Spielstart) */
function returnSince(bot: BotState, since: number): number {
  const ref = [...bot.equity].reverse().find((e) => e.t <= since) ?? bot.equity[0];
  const base = ref?.v ?? bot.startCapital;
  return base > 0 ? equityOf(bot) / base - 1 : 0;
}

export default function DuellScreen() {
  const route = useRoute<any>();
  const me = useStore((s) => s.me);
  const bots = useAsync(fetchBots, []);
  const [sub, setSub] = useState<Sub>('rank');
  const [refreshing, setRefreshing] = useState(false);

  const refreshPrices = useCallback(async () => {
    const g = getState().me; // aktueller Stand, nicht der der letzten Darstellung
    if (!g || g.positions.length === 0) return;
    const res = await pool(g.positions, 4, async (p) => [p.symbol, (await loadQuote(p.symbol)).priceEur] as const);
    const prices: Record<string, number> = {};
    res.forEach((r) => r && (prices[r[0]] = r[1]));
    refreshPlayerPrices(prices);
  }, []);

  // Kurse beim Öffnen und danach jede Minute aktualisieren
  useEffect(() => {
    if (!me) return;
    refreshPrices();
    const h = setInterval(() => {
      refreshPrices();
      bots.reload();
    }, 60_000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!me]);

  // Kaufidee aus dem Ranking übernehmen
  const [preset, setPreset] = useState<string | null>(null);
  useEffect(() => {
    const ts = route.params?.ts;
    if (route.params?.symbol && ts !== handledTs) {
      handledTs = ts;
      setPreset(route.params.symbol);
      setSub('trade');
    }
  }, [route.params?.ts]);

  if (!me) {
    return (
      <Screen title="Duell" subtitle="Du gegen die Bots – mit Spielgeld">
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}>
          <Card>
            <Text style={s.title}>Tritt gegen die Bots an</Text>
            <Text style={[s.muted, { marginTop: 8, lineHeight: 19 }]}>
              Du bekommst dasselbe Startkapital wie die Bots ({bots.data ? fmtMoney(bots.data.startCapital) : '10.000,00 €'}) und handelst Aktien zu echten Kursen – nur mit Spielgeld. Die Rangliste vergleicht deine Rendite ab dem Spielstart mit Day-Trading-, Langzeit- und Gold-Bot. Gleiche Gebühren (0,05 % pro Order) gelten für alle.
            </Text>
            <Button label="Duell starten" icon="play" onPress={() => startGame(bots.data?.startCapital ?? 10000)} />
          </Card>
          <Disclaimer />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen title="Duell" subtitle="Du gegen die Bots – mit Spielgeld">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([refreshPrices(), bots.reload()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <Segmented
          value={sub}
          onChange={setSub}
          options={[
            { key: 'rank', label: 'Rangliste' },
            { key: 'trade', label: 'Handeln' },
            { key: 'depot', label: 'Depot' },
            { key: 'log', label: 'Trades' },
            { key: 'coach', label: 'Coach' },
          ]}
        />
        {sub === 'rank' && <Rank me={me} bots={bots.data} loading={bots.loading} />}
        {sub === 'trade' && <Trade me={me} preset={preset} onDone={() => setSub('depot')} />}
        {sub === 'depot' && <Depot me={me} onRefresh={refreshPrices} onTrade={() => setSub('trade')} />}
        {sub === 'log' && <Log me={me} />}
        {sub === 'coach' && <CoachView me={me} />}
        {sub === 'depot' || sub === 'coach' ? (
          <Button
            label="Duell beenden & neu starten"
            icon="refresh"
            kind="danger"
            onPress={() =>
              Alert.alert('Duell beenden?', 'Dein Spiel-Depot mit allen Trades wird gelöscht. Danach kannst du neu starten.', [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Beenden', style: 'destructive', onPress: endGame },
              ])
            }
          />
        ) : null}
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

function Rank({ me, bots, loading }: { me: BotState; bots: Awaited<ReturnType<typeof fetchBots>> | null; loading: boolean }) {
  const rows = useMemo(() => {
    const mine = { name: 'Du', icon: 'person', pct: equityOf(me) / me.startCapital - 1, eq: equityOf(me), me: true };
    const list = [mine];
    if (bots) {
      const push = (name: string, icon: string, b?: BotState) => {
        if (!b) return;
        const pct = returnSince(b, me.createdAt);
        list.push({ name, icon, pct, eq: me.startCapital * (1 + pct), me: false });
      };
      push('Day-Trading-Bot', 'flash', bots.day);
      push('Langzeit-Bot', 'time', bots.long);
      push('Gold-Bot', 'diamond', bots.gold);
    }
    return list.sort((a, b) => b.pct - a.pct);
  }, [me, bots]);
  const place = rows.findIndex((r) => r.me) + 1;
  const best = Math.max(...rows.map((r) => Math.abs(r.pct)), 0.01);
  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Dein Platz</Text>
        <Text style={s.big}>
          {place} von {rows.length}
        </Text>
        <Text style={[s.muted, { marginTop: 4, lineHeight: 18 }]}>
          {rows.length === 1
            ? 'Bot-Daten werden geladen …'
            : place === 1
            ? 'Du liegst vor allen Bots. Stark – bleib dran!'
            : `Dir fehlen ${fmtPct(rows[0].pct - rows.find((r) => r.me)!.pct, 2, false)}-Punkte auf Platz 1 (${rows[0].name}).`}
        </Text>
      </Card>

      <SectionTitle>Rangliste seit deinem Spielstart</SectionTitle>
      {loading && !bots ? <Loading text="Bots werden geladen …" /> : null}
      <Card style={{ paddingVertical: 4 }}>
        {rows.map((r, i) => (
          <View key={r.name} style={[s.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[s.medal, { color: i === 0 ? colors.amber : colors.muted }]}>{i + 1}</Text>
            <Ionicons name={r.icon as any} size={18} color={r.me ? colors.accent : colors.muted} style={{ marginHorizontal: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[s.sym, r.me && { color: colors.accent }]}>{r.name}</Text>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${Math.min(100, (Math.abs(r.pct) / best) * 100)}%`, backgroundColor: r.pct >= 0 ? colors.green : colors.red }]} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
              <PctText v={r.pct} />
              <Text style={s.muted}>{fmtMoney(r.eq, '€', 0)}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Text style={[s.muted, { marginTop: 8, lineHeight: 17 }]}>
        Fairer Vergleich: Die Bots werden ab dem Zeitpunkt gemessen, an dem du das Duell gestartet hast, und auf dein Startkapital umgerechnet.
      </Text>
    </>
  );
}

function Trade({ me, preset, onDone }: { me: BotState; preset: string | null; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [err, setErr] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const pick = useCallback(async (symbol: string) => {
    setHits([]);
    setQ('');
    setErr('');
    setLoadingQ(true);
    try {
      setQuote(await loadQuote(symbol));
    } catch (e: any) {
      setQuote(null);
      setErr(e.message);
    } finally {
      setLoadingQ(false);
    }
  }, []);

  useEffect(() => {
    if (preset) pick(preset);
  }, [preset, pick]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const h = setTimeout(() => {
      searchSymbols(term)
        .then((r) => setHits(r.filter((x) => x.type === 'EQUITY' || x.type === 'ETF')))
        .catch((e) => setErr(e.message))
        .finally(() => setSearching(false));
    }, 450);
    return () => clearTimeout(h);
  }, [q]);

  const amt = Number(amount.replace(',', '.'));
  const valid = quote && isFinite(amt) && amt >= 20 && amt <= me.cash + 0.005;
  const fee = valid ? amt * FEE_RATE : 0;
  const qty = valid && quote ? (amt - fee) / quote.priceEur : 0;

  const buyNow = () => {
    if (!quote || !valid) return;
    const e = playerBuy(quote.symbol, quote.name, quote.priceEur, amt, note);
    if (e) setErr(e);
    else {
      setAmount('');
      setNote('');
      setQuote(null);
      onDone();
    }
  };

  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Verfügbares Spielgeld</Text>
        <Text style={s.big}>{fmtMoney(me.cash)}</Text>
      </Card>

      <SectionTitle>Aktie suchen</SectionTitle>
      <View style={s.inputWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Name, Ticker oder ISIN"
          placeholderTextColor={colors.muted}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>
      {hits.map((h) => (
        <Pressable key={h.symbol} onPress={() => pick(h.symbol)} style={s.hit}>
          <View style={{ flex: 1 }}>
            <Text style={s.sym}>{h.symbol}</Text>
            <Text style={s.muted} numberOfLines={1}>{h.name}</Text>
          </View>
          <Text style={s.muted}>{h.exchange}</Text>
        </Pressable>
      ))}
      {loadingQ ? <Loading text="Kurs wird geladen …" /> : null}
      {err ? <Text style={{ color: colors.red, marginTop: 10, fontSize: 13 }}>{err}</Text> : null}

      {quote && !loadingQ ? (
        <Card style={{ marginTop: space.l }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{quote.symbol}</Text>
              <Text style={s.muted} numberOfLines={1}>{quote.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.price}>{fmtMoney(quote.priceEur)}</Text>
              <PctText v={quote.chg} />
            </View>
          </View>
          {quote.currency === 'USD' ? <Text style={[s.muted, { marginTop: 4 }]}>Kurs {fmtNum(quote.nativePrice)} $ – zum aktuellen Wechselkurs in Euro umgerechnet.</Text> : null}

          <Text style={[s.muted, { marginTop: 14 }]}>Betrag in Euro</Text>
          <View style={s.inputWrap}>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="z. B. 1000" placeholderTextColor={colors.muted} style={s.input} />
            <Text style={s.muted}>€</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {[0.1, 0.25, 0.5, 1].map((f) => (
              <Pressable key={f} onPress={() => setAmount(String(Math.floor(me.cash * f * 100) / 100))} style={s.chip}>
                <Text style={s.chipText}>{f === 1 ? 'Alles' : `${f * 100} %`}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.muted, { marginTop: 12 }]}>Deine Begründung (optional, wird mit dem Trade gespeichert)</Text>
          <View style={s.inputWrap}>
            <TextInput value={note} onChangeText={setNote} placeholder="z. B. Aufwärtstrend + gute News" placeholderTextColor={colors.muted} style={s.input} />
          </View>
          {valid ? (
            <Text style={[s.muted, { marginTop: 10, lineHeight: 18 }]}>
              Du bekommst ca. {fmtNum(qty, 3)} Stück · Gebühr {fmtMoney(fee)}
            </Text>
          ) : amount ? (
            <Text style={{ color: colors.red, marginTop: 10, fontSize: 12 }}>Betrag muss zwischen 20 € und deinem Cash liegen.</Text>
          ) : null}
          <Button label="Kaufen (Spielgeld)" icon="cart" onPress={buyNow} disabled={!valid} />
        </Card>
      ) : null}
    </>
  );
}

function Depot({ me, onRefresh, onTrade }: { me: BotState; onRefresh: () => Promise<void>; onTrade: () => void }) {
  const nav = useNavigation<any>();
  const eq = equityOf(me);
  const data = useMemo(() => me.equity.map((e) => ({ t: e.t, v: e.v })), [me.equity]);
  const [busy, setBusy] = useState<string | null>(null);

  const sellPart = async (symbol: string, fraction: number) => {
    setBusy(symbol);
    try {
      const qt = await loadQuote(symbol);
      const e = playerSell(symbol, qt.priceEur, fraction, fraction >= 1 ? 'Eigener Verkauf (alles)' : `Eigener Teilverkauf (${Math.round(fraction * 100)} %)`);
      if (e) Alert.alert('Verkauf nicht möglich', e);
    } catch (e: any) {
      Alert.alert('Kurs nicht verfügbar', e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Gesamtwert</Text>
        <Text style={s.bigger}>{fmtMoney(eq)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ color: signColor(eq - me.startCapital), fontWeight: '700' }}>
            {eq >= me.startCapital ? '+' : ''}{fmtMoney(eq - me.startCapital)}
          </Text>
          <PctText v={eq / me.startCapital - 1} />
          <Text style={s.muted}>seit Start</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <Chart data={data} height={130} baseline={me.startCapital} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          <Stat label="Cash" value={fmtMoney(me.cash)} />
          <Stat label="Investiert" value={fmtMoney(eq - me.cash)} />
        </View>
      </Card>

      <SectionTitle right={<Pressable onPress={() => onRefresh()}><Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>Kurse aktualisieren</Text></Pressable>}>
        Positionen
      </SectionTitle>
      {me.positions.length === 0 ? (
        <Card>
          <Text style={s.muted}>Noch keine Aktien. Kaufe im Tab „Handeln" oder nimm eine Kaufidee aus dem Ranking.</Text>
          <Button label="Zum Handeln" icon="cart" kind="ghost" onPress={onTrade} />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {me.positions.map((p) => (
            <Card key={p.symbol}>
              <Pressable onPress={() => nav.navigate('Detail', { symbol: p.symbol })}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sym}>{p.symbol}</Text>
                    <Text style={s.muted} numberOfLines={1}>{p.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: signColor(posPnl(p)), fontWeight: '800', fontSize: 16 }}>
                      {posPnl(p) >= 0 ? '+' : ''}{fmtMoney(posPnl(p))}
                    </Text>
                    <PctText v={posPct(p)} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  <Stat label="Stück" value={fmtNum(p.qty, 3)} />
                  <Stat label="Einstand" value={fmtMoney(p.avgPrice)} />
                  <Stat label="Aktuell" value={fmtMoney(p.lastPrice)} />
                  <Stat label="Wert" value={fmtMoney(p.qty * p.lastPrice)} />
                </View>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[0.25, 0.5, 1].map((f) => (
                  <Pressable key={f} onPress={() => sellPart(p.symbol, f)} disabled={busy === p.symbol} style={[s.chip, { flex: 1, alignItems: 'center', backgroundColor: colors.redBg }]}>
                    <Text style={[s.chipText, { color: colors.red }]}>{busy === p.symbol ? '…' : f === 1 ? 'Alles verkaufen' : `${f * 100} % verkaufen`}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

function Log({ me }: { me: BotState }) {
  if (!me.trades.length)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Noch keine Trades. Deine Käufe und Verkäufe erscheinen hier mit deiner Begründung.</Text>
      </Card>
    );
  return (
    <View style={{ marginTop: space.l, gap: 10 }}>
      {me.trades.slice(0, 100).map((t) => (
        <TradeCard key={t.id} t={t} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12 },
  big: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 2 },
  bigger: { color: colors.text, fontSize: 32, fontWeight: '800', marginVertical: 2 },
  price: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sym: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  medal: { width: 20, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  barBg: { height: 5, borderRadius: 3, backgroundColor: colors.card2, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: radius.m, paddingHorizontal: 14, marginTop: 6 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  hit: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 12 },
});
