import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { fetchScan, PRESETS } from '../analysis/scan';
import { PctText } from '../components/Rows';
import { Card, Disclaimer, ErrorBox, Loading, Screen } from '../components/UI';
import { fmtDateTime, fmtMoney, fmtNum } from '../format';
import { useAsync } from '../hooks';
import { ScanRow } from '../types';
import { colors, space } from '../theme';

type Liq = 'all' | 'liquid' | 'large' | 'mid' | 'small' | 'micro';

const LIQ_OPTIONS: { key: Liq; label: string }[] = [
  { key: 'liquid', label: 'Ohne Micro' },
  { key: 'large', label: 'Groß' },
  { key: 'mid', label: 'Mittel' },
  { key: 'small', label: 'Klein' },
  { key: 'micro', label: 'Micro' },
  { key: 'all', label: 'Alle' },
];

export default function ScannerScreen() {
  const nav = useNavigation<any>();
  const scan = useAsync(() => fetchScan(), []);
  const [preset, setPreset] = useState(PRESETS[0].key);
  const [liq, setLiq] = useState<Liq>('liquid');
  const [refreshing, setRefreshing] = useState(false);
  const p = PRESETS.find((x) => x.key === preset)!;

  const rows = useMemo(() => {
    const all = scan.data?.rows ?? [];
    return all
      .filter((r) => (liq === 'all' ? true : liq === 'liquid' ? r.liq !== 'micro' : r.liq === liq))
      .filter(p.filter)
      .sort(p.sort);
  }, [scan.data, p, liq]);

  return (
    <Screen title="Scanner" subtitle="Filter über alle ausgewerteten Aktien">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchScan(true).then(() => scan.reload()).catch(() => scan.reload());
              setRefreshing(false);
            }}
          />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: 8 }}>
          {PRESETS.map((x) => (
            <Pressable key={x.key} onPress={() => setPreset(x.key)} style={[s.chip, preset === x.key && s.chipActive]}>
              <Ionicons name={x.icon as any} size={14} color={preset === x.key ? '#fff' : colors.muted} />
              <Text style={[s.chipText, preset === x.key && { color: '#fff' }]}>{x.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Card style={{ marginTop: space.m }}>
          <Text style={s.desc}>{p.desc}</Text>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l, marginTop: space.m }} contentContainerStyle={{ paddingHorizontal: space.l, gap: 8 }}>
          {LIQ_OPTIONS.map((o) => (
            <Pressable key={o.key} onPress={() => setLiq(o.key)} style={[s.chipSmall, liq === o.key && { backgroundColor: colors.accentBg, borderColor: colors.accent }]}>
              <Text style={[s.chipSmallText, liq === o.key && { color: colors.accent }]}>{o.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {scan.loading && !scan.data ? <Loading text="Scanner-Daten werden geladen …" /> : null}
        {scan.error && !scan.data ? <ErrorBox text={scan.error} onRetry={scan.reload} /> : null}

        {scan.data ? (
          <>
            <Text style={[s.muted, { marginVertical: 10 }]}>
              {rows.length.toLocaleString('de-DE')} Treffer von {scan.data.rows.length.toLocaleString('de-DE')} Aktien · Stand {fmtDateTime(scan.data.generatedAt)}
              {rows.length > 40 ? ' · zeige die ersten 40' : ''}
            </Text>
            {rows.slice(0, 40).map((r) => (
              <Row key={r.symbol} r={r} onPress={() => nav.navigate('Detail', { symbol: r.symbol })} />
            ))}
            {rows.length === 0 ? (
              <Card>
                <Text style={s.muted}>Kein Treffer mit diesem Filter. Ein leeres Ergebnis ist normal – gute Gelegenheiten sind selten. Probier eine andere Größenklasse oder ein anderes Preset.</Text>
              </Card>
            ) : null}
            <Disclaimer />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Row({ r, onPress }: { r: ScanRow; onPress: () => void }) {
  const rsColor = r.rs >= 90 ? colors.green : r.rs >= 70 ? colors.accent : colors.muted;
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 8, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.sym}>{r.symbol}</Text>
            <Text style={s.muted} numberOfLines={1}>{r.name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.price}>{fmtMoney(r.price)}</Text>
            <Text style={[s.rs, { color: rsColor }]}>RS {r.rs}</Text>
          </View>
        </View>
        <View style={s.stats}>
          <Stat label="RSI" value={String(r.rsi)} color={r.rsi <= 35 ? colors.green : r.rsi >= 75 ? colors.red : undefined} />
          <Stat label="zum Hoch" value={`${fmtNum(r.hi52 * 100, 1)} %`} />
          <Stat label="Volumen" value={`×${fmtNum(r.vol, 1)}`} color={r.vol >= 2 ? colors.amber : undefined} />
          <View style={{ flex: 1 }}>
            <Text style={s.statLabel}>1 Mon.</Text>
            <PctText v={r.m1} digits={1} style={{ fontSize: 13 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statLabel}>6 Mon.</Text>
            <PctText v={r.m6} digits={0} style={{ fontSize: 13 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Tag text={r.liq === 'large' ? 'Groß' : r.liq === 'mid' ? 'Mittel' : r.liq === 'small' ? 'Klein' : 'Micro'} />
          {r.up ? <Tag text="über 200-Tage-Linie" good /> : <Tag text="unter 200-Tage-Linie" bad />}
          {r.earnings ? <Tag text={`Zahlen ${r.earnings.slice(5).split('-').reverse().join('.')}.`} warn /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[{ color: colors.text, fontSize: 13, fontWeight: '600' }, color ? { color } : null]}>{value}</Text>
  </View>
);

const Tag = ({ text, good, bad, warn }: { text: string; good?: boolean; bad?: boolean; warn?: boolean }) => (
  <View style={{ backgroundColor: good ? colors.greenBg : bad ? colors.redBg : warn ? colors.amberBg : colors.card2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
    <Text style={{ fontSize: 10, fontWeight: '700', color: good ? colors.green : bad ? colors.red : warn ? colors.amber : colors.muted }}>{text}</Text>
  </View>
);

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  chipSmall: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  chipSmallText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  desc: { color: colors.text, fontSize: 13, lineHeight: 19 },
  muted: { color: colors.muted, fontSize: 12 },
  sym: { color: colors.text, fontWeight: '700', fontSize: 16 },
  price: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rs: { fontWeight: '800', fontSize: 12, marginTop: 2 },
  stats: { flexDirection: 'row', marginTop: 10 },
  statLabel: { color: colors.muted, fontSize: 10, marginBottom: 2 },
});
