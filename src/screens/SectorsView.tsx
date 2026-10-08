import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchSectors } from '../analysis/scan';
import { PctText } from '../components/Rows';
import { Card, Disclaimer, ErrorBox, Loading, Screen } from '../components/UI';
import { useAsync } from '../hooks';
import { colors, signColor, space } from '../theme';

export default function SectorsView() {
  const sec = useAsync(fetchSectors, []);
  const max = Math.max(0.01, ...(sec.data ?? []).map((x) => Math.abs(x.m3)));
  return (
    <Screen title="Sektoren" subtitle="Welche Branchen laufen gerade am besten?">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} tintColor={colors.accent} onRefresh={() => sec.reload()} />}
      >
        <Card>
          <Text style={s.muted}>
            Sektor-Rotation: Geld fließt abwechselnd in verschiedene Branchen. Ein starker Sektor gibt Aktien darin Rückenwind. Sortiert nach der Entwicklung der letzten 3 Monate (Branchen-ETFs der S&P-500-Sektoren).
          </Text>
        </Card>
        {sec.loading && !sec.data ? <Loading text="Sektoren werden geladen …" /> : null}
        {sec.error && !sec.data ? <ErrorBox text={sec.error} onRetry={sec.reload} /> : null}
        {sec.data ? (
          <Card style={{ marginTop: 12, paddingVertical: 6 }}>
            <View style={[s.row, { paddingVertical: 8 }]}>
              <Text style={[s.muted, { flex: 1 }]}>Sektor</Text>
              <Text style={[s.muted, s.col]}>1 Mon.</Text>
              <Text style={[s.muted, s.col]}>3 Mon.</Text>
              <Text style={[s.muted, s.col]}>6 Mon.</Text>
            </View>
            {sec.data.map((x, i) => (
              <View key={x.symbol} style={[{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{i + 1}. {x.name}</Text>
                    <Text style={s.muted}>{x.symbol}</Text>
                  </View>
                  <View style={s.col}><PctText v={x.m1} digits={1} style={{ fontSize: 13 }} /></View>
                  <View style={s.col}><PctText v={x.m3} digits={1} style={{ fontSize: 13 }} /></View>
                  <View style={s.col}><PctText v={x.m6} digits={1} style={{ fontSize: 13 }} /></View>
                </View>
                <View style={s.barBg}>
                  <View style={{ height: 4, borderRadius: 2, width: `${Math.min(100, (Math.abs(x.m3) / max) * 100)}%`, backgroundColor: signColor(x.m3) }} />
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  name: { color: colors.text, fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { width: 62, alignItems: 'flex-end', textAlign: 'right' } as any,
  barBg: { height: 4, borderRadius: 2, backgroundColor: colors.card2, marginTop: 8 },
});
