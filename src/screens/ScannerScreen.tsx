import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { fetchScan, PRESETS } from '../analysis/scan';
import { Card, Disclaimer, ErrorBox, Loading, Screen } from '../components/UI';
import { fmtDateTime, fmtMoney, fmtNum } from '../format';
import { useAsync } from '../hooks';
import { ScanRow } from '../types';
import { colors, signColor, space, type } from '../theme';

type Liq = 'all' | 'liquid' | 'large' | 'mid' | 'small' | 'micro';

const LIQ_OPTIONS: { key: Liq; label: string }[] = [
  { key: 'liquid', label: 'Ohne Micro' },
  { key: 'large', label: 'Groß' },
  { key: 'mid', label: 'Mittel' },
  { key: 'small', label: 'Klein' },
  { key: 'micro', label: 'Micro' },
  { key: 'all', label: 'Alle' },
];

const LIQ_LABEL = { large: 'Große Firma', mid: 'Mittlere Firma', small: 'Kleine Firma', micro: 'Micro-Cap' } as const;

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
              <Ionicons name={x.icon as any} size={15} color={preset === x.key ? colors.onAccent : colors.muted} />
              <Text style={[s.chipText, preset === x.key && { color: colors.onAccent }]}>{x.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Card style={{ marginTop: space.m, padding: 14 }}>
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
            <Text style={s.count}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{rows.length.toLocaleString('de-DE')} Treffer</Text> von {scan.data.rows.length.toLocaleString('de-DE')} Aktien · Stand {fmtDateTime(scan.data.generatedAt)}
              {rows.length > 40 ? ' · die ersten 40' : ''}
            </Text>
            {rows.slice(0, 40).map((r) => (
              <Row key={r.symbol} r={r} onPress={() => nav.navigate('Detail', { symbol: r.symbol })} />
            ))}
            {rows.length === 0 ? (
              <Card>
                <Text style={s.desc}>Kein Treffer mit diesem Filter. Ein leeres Ergebnis ist normal – gute Gelegenheiten sind selten. Probier eine andere Größenklasse oder ein anderes Preset.</Text>
              </Card>
            ) : null}
            <Disclaimer />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const gradeOf = (t: number) => (t >= 75 ? 'A' : t >= 62 ? 'B' : t >= 48 ? 'C' : t >= 35 ? 'D' : 'E');
const pct = (v: number, d = 0, sign = true) => `${sign && v > 0 ? '+' : ''}${fmtNum(v * 100, d)} %`;

/** Eine Aktie als übersichtliche Karte: Kopf (Name, Preis, Stärke) → Chart-Zeile → Fundament-Zeile → Hinweise */
function Row({ r, onPress }: { r: ScanRow; onPress: () => void }) {
  const rsColor = r.rs >= 90 ? colors.green : r.rs >= 70 ? colors.text : colors.muted;
  const rsBg = r.rs >= 90 ? colors.greenBg : r.rs >= 70 ? colors.card2 : 'transparent';
  const fundColor = r.fund == null ? colors.muted : r.fund >= 62 ? colors.green : r.fund >= 48 ? colors.amber : colors.red;
  const earn = r.earnings ? r.earnings.slice(5).split('-').reverse().join('.') + '.' : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
      <Card style={s.card}>
        {/* Kopf */}
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <View style={s.symRow}>
              <Text style={s.sym}>{r.symbol}</Text>
              <View style={[s.rs, { backgroundColor: rsBg, borderColor: r.rs >= 70 ? 'transparent' : colors.border }]}>
                <Text style={[s.rsText, { color: rsColor }]}>RS {r.rs}</Text>
              </View>
            </View>
            <Text style={s.name} numberOfLines={1}>{r.name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.price}>{fmtMoney(r.price)}</Text>
            <Text style={[s.m1, { color: signColor(r.m1) }]}>{pct(r.m1, 1)} <Text style={s.m1Label}>1 Monat</Text></Text>
          </View>
        </View>

        {/* Chart */}
        <View style={s.block}>
          <Text style={s.blockTitle}>Chart</Text>
          <View style={s.grid}>
            <Cell label="6 Monate" value={pct(r.m6, 0)} color={signColor(r.m6)} />
            <Cell label="12 Monate" value={pct(r.m12, 0)} color={signColor(r.m12)} />
            <Cell label="zum Hoch" value={pct(r.hi52, 0, false)} color={r.hi52 > -0.05 ? colors.green : undefined} />
            <Cell label="RSI" value={String(r.rsi)} color={r.rsi <= 35 ? colors.green : r.rsi >= 75 ? colors.red : undefined} />
          </View>
        </View>

        {/* Fundament */}
        {r.fund != null ? (
          <View style={s.block}>
            <Text style={s.blockTitle}>Fundament</Text>
            <View style={s.grid}>
              <Cell label="Note" value={`${gradeOf(r.fund)} · ${r.fund}`} color={fundColor} />
              <Cell label="KGV" value={r.pe != null ? fmtNum(r.pe, 1) : '–'} />
              <Cell label="Umsatz" value={r.revg != null ? pct(r.revg, 0) : '–'} color={r.revg != null ? signColor(r.revg) : undefined} />
              <Cell label="Kursziel" value={r.upside != null ? pct(r.upside, 0) : '–'} color={r.upside != null ? (r.upside > 0.1 ? colors.green : r.upside < 0 ? colors.red : undefined) : undefined} />
            </View>
          </View>
        ) : null}

        {/* Hinweise */}
        <View style={s.tags}>
          <Tag text={LIQ_LABEL[r.liq]} />
          {r.sector ? <Tag text={r.sector} /> : null}
          <Tag text={r.up ? 'über 200-Tage-Linie' : 'unter 200-Tage-Linie'} good={r.up} bad={!r.up} />
          {r.vol >= 1.5 ? <Tag text={`Volumen ×${fmtNum(r.vol, 1)}`} warn /> : null}
          {earn ? <Tag text={`Zahlen ${earn}`} warn /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

const Cell = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={s.cell}>
    <Text style={s.cellLabel} numberOfLines={1}>{label}</Text>
    <Text style={[s.cellValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
  </View>
);

const Tag = ({ text, good, bad, warn }: { text: string; good?: boolean; bad?: boolean; warn?: boolean }) => (
  <View style={[s.tag, { backgroundColor: good ? colors.greenBg : bad ? colors.redBg : warn ? colors.amberBg : colors.card2 }]}>
    <Text style={[s.tagText, { color: good ? colors.green : bad ? colors.red : warn ? colors.amber : colors.muted }]}>{text}</Text>
  </View>
);

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: type.body },
  chipSmall: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
  chipSmallText: { color: colors.muted, fontWeight: '600', fontSize: type.small },
  desc: { color: colors.text, fontSize: type.body, lineHeight: 21 },
  count: { color: colors.muted, fontSize: type.small, lineHeight: 18, marginTop: space.m, marginBottom: space.s },

  card: { marginBottom: 10, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  symRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sym: { color: colors.text, fontWeight: '800', fontSize: type.h1 },
  rs: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  rsText: { fontWeight: '800', fontSize: type.small },
  name: { color: colors.muted, fontSize: type.body, marginTop: 2 },
  price: { color: colors.text, fontWeight: '800', fontSize: type.h2 },
  m1: { fontWeight: '700', fontSize: type.small, marginTop: 2 },
  m1Label: { color: colors.muted, fontWeight: '400' },

  block: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  blockTitle: { color: colors.muted, fontSize: type.micro, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  grid: { flexDirection: 'row' },
  cell: { flex: 1, paddingRight: 4 },
  cellLabel: { color: colors.muted, fontSize: type.small, marginBottom: 3 },
  cellValue: { color: colors.text, fontSize: type.value, fontWeight: '700' },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontSize: type.small, fontWeight: '600' },
});
