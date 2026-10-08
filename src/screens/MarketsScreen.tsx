import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getChart, pool } from '../api/yahoo';
import { getMarketNews } from '../api/news';
import { INDICES } from '../analysis/universe';
import Chart from '../components/Chart';
import MarketLight from '../components/MarketLight';
import { NewsRow, PctText } from '../components/Rows';
import { Card, ErrorBox, Loading, Screen, SectionTitle } from '../components/UI';
import { fmtNum } from '../format';
import { useAsync } from '../hooks';
import { useStore } from '../store';
import { colors, space } from '../theme';

interface Q {
  symbol: string;
  name: string;
  price: number;
  chg: number;
  series: { t: number; v: number }[];
  currency: string;
}

const loadQuotes = async (list: { symbol: string; name?: string }[]): Promise<Q[]> => {
  const res = await pool(list, 5, async (x) => {
    const d = await getChart(x.symbol, '1mo', '1d', 120_000);
    const prev = d.candles.length > 1 ? d.candles[d.candles.length - 2].c : d.meta.prevClose;
    return {
      symbol: x.symbol,
      name: x.name ?? d.meta.name,
      price: d.meta.price,
      chg: prev ? d.meta.price / prev - 1 : 0,
      series: d.candles.map((c) => ({ t: c.t, v: c.c })),
      currency: d.meta.currency,
    } as Q;
  });
  return res.filter((x): x is Q => !!x);
};

export default function MarketsScreen() {
  const nav = useNavigation<any>();
  const watch = useStore((s) => s.watchlist);
  const idx = useAsync(() => loadQuotes(INDICES), []);
  const wl = useAsync(() => loadQuotes(watch.map((symbol) => ({ symbol }))), [watch.join(',')]);
  const news = useAsync(getMarketNews, []);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([idx.reload(), wl.reload(), news.reload()]);
    setRefreshing(false);
  }, [idx, wl, news]);

  return (
    <Screen title="Märkte" subtitle="Indizes, Watchlist und aktuelle Börsen-News">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <MarketLight />
        <SectionTitle>Indizes & Märkte</SectionTitle>
        {idx.loading && !idx.data ? (
          <Loading />
        ) : idx.error && !idx.data ? (
          <ErrorBox text={idx.error} onRetry={idx.reload} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: 10 }}>
            {idx.data?.map((q) => (
              <Pressable key={q.symbol} onPress={() => nav.navigate('Detail', { symbol: q.symbol })}>
                <Card style={{ width: 150, padding: 12 }}>
                  <Text style={s.small}>{q.name}</Text>
                  <Text style={s.price}>{fmtNum(q.price, q.price < 10 ? 4 : 2)}</Text>
                  <PctText v={q.chg} />
                  <View style={{ marginTop: 6 }}>
                    <Chart data={q.series} height={36} minimal />
                  </View>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <SectionTitle>Watchlist</SectionTitle>
        {watch.length === 0 ? (
          <Card>
            <Text style={s.small}>Noch leer. Öffne eine Aktie über „Suche" und tippe auf den Stern, um sie hier zu beobachten.</Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {wl.data?.map((q, i) => (
              <Pressable key={q.symbol} onPress={() => nav.navigate('Detail', { symbol: q.symbol })} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{q.symbol}</Text>
                  <Text style={s.small} numberOfLines={1}>{q.name}</Text>
                </View>
                <View style={{ width: 80, marginRight: 12 }}>
                  <Chart data={q.series} height={30} minimal />
                </View>
                <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
                  <Text style={s.rowTitle}>{fmtNum(q.price)} {q.currency === 'EUR' ? '€' : q.currency === 'USD' ? '$' : q.currency}</Text>
                  <PctText v={q.chg} />
                </View>
              </Pressable>
            ))}
            {wl.loading && !wl.data ? <Loading /> : null}
          </Card>
        )}

        <SectionTitle>Aktuelle News</SectionTitle>
        <Text style={[s.small, { marginBottom: 4 }]}>Quellen: Google News, Yahoo Finance, Tagesschau, Handelsblatt · grüner/roter Punkt = Stimmung der Schlagzeile</Text>
        {news.loading && !news.data ? (
          <Loading text="News werden geladen …" />
        ) : news.error && !news.data ? (
          <ErrorBox text={news.error} onRetry={news.reload} />
        ) : (
          news.data?.slice(0, 40).map((n, i) => <NewsRow key={i} n={n} />)
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  small: { color: colors.muted, fontSize: 12 },
  price: { color: colors.text, fontSize: 17, fontWeight: '700', marginVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
