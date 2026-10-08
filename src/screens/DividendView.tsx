import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { fetchScan } from '../analysis/scan';
import { Card, Disclaimer, ErrorBox, Loading, Screen, SectionTitle } from '../components/UI';
import { fmtDateTime, fmtMoney, fmtNum, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { ScanRow } from '../types';
import { colors, signColor, space, type } from '../theme';

type Sort = 'yield' | 'safety' | 'growth' | 'streak';
type Size = 'big' | 'liquid' | 'all';

const MIN_YIELDS = [0.01, 0.02, 0.03, 0.04, 0.05];
const SORTS: { key: Sort; label: string }[] = [
  { key: 'yield', label: 'Rendite' },
  { key: 'safety', label: 'Sicherheit' },
  { key: 'growth', label: 'Wachstum' },
  { key: 'streak', label: 'Serie' },
];
const SIZES: { key: Size; label: string }[] = [
  { key: 'big', label: 'Große Werte' },
  { key: 'liquid', label: 'Groß + Mittel' },
  { key: 'all', label: 'Alle ohne Micro' },
];

const gradeOf = (t: number) => (t >= 75 ? 'A' : t >= 62 ? 'B' : t >= 48 ? 'C' : t >= 35 ? 'D' : 'E');
const freq = (n?: number) => (n === 12 ? 'monatlich' : n === 4 ? 'vierteljährlich' : n === 2 ? 'halbjährlich' : 'jährlich');
const safetyColor = (q: number) => (q >= 65 ? colors.green : q >= 45 ? colors.amber : colors.red);

export default function DividendView() {
  const nav = useNavigation<any>();
  const scan = useAsync(() => fetchScan(), []);
  const [minY, setMinY] = useState(0.03);
  const [sort, setSort] = useState<Sort>('safety');
  const [size, setSize] = useState<Size>('liquid');
  const [hideTraps, setHideTraps] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(() => {
    const all = scan.data?.rows ?? [];
    return all
      .filter((r) => r.dq != null && (r.div ?? 0) >= minY)
      .filter((r) => (size === 'big' ? r.liq === 'large' : size === 'liquid' ? r.liq === 'large' || r.liq === 'mid' : r.liq !== 'micro'))
      .filter((r) => !(hideTraps && r.dtrap))
      .sort((a, b) =>
        sort === 'yield' ? (b.div ?? 0) - (a.div ?? 0) : sort === 'safety' ? (b.dq ?? 0) - (a.dq ?? 0) || (b.div ?? 0) - (a.div ?? 0) : sort === 'growth' ? (b.dgr ?? -9) - (a.dgr ?? -9) : (b.dstreak ?? 0) - (a.dstreak ?? 0) || (b.div ?? 0) - (a.div ?? 0),
      );
  }, [scan.data, minY, sort, size, hideTraps]);

  const hasDivData = (scan.data?.rows ?? []).some((r) => r.dq != null);

  return (
    <Screen title="Dividenden" subtitle="Top-Dividendenwerte mit Sicherheitsprüfung">
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
        <Card>
          <Text style={s.muted}>
            Eine hohe Rendite allein sagt wenig: Oft ist der Kurs gefallen, weil der Markt eine Kürzung erwartet. Deshalb steht neben jeder Rendite eine <Text style={{ color: colors.text, fontWeight: '700' }}>Sicherheits-Note</Text> (Ausschüttungsquote, Jahre ohne Kürzung, Wachstum, Cashflow, Firmenqualität).
          </Text>
        </Card>

        <Text style={s.label}>Mindest-Rendite</Text>
        <View style={s.chipRow}>
          {MIN_YIELDS.map((y) => (
            <Pressable key={y} onPress={() => setMinY(y)} style={[s.chip, minY === y && s.chipActive]}>
              <Text style={[s.chipText, minY === y && { color: colors.onAccent }]}>≥ {Math.round(y * 100)} %</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Sortieren nach</Text>
        <View style={s.chipRow}>
          {SORTS.map((o) => (
            <Pressable key={o.key} onPress={() => setSort(o.key)} style={[s.chip, sort === o.key && s.chipActive]}>
              <Text style={[s.chipText, sort === o.key && { color: colors.onAccent }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Größe</Text>
        <View style={s.chipRow}>
          {SIZES.map((o) => (
            <Pressable key={o.key} onPress={() => setSize(o.key)} style={[s.chip, size === o.key && s.chipActive]}>
              <Text style={[s.chipText, size === o.key && { color: colors.onAccent }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Verdächtige „Dividendenfallen" ausblenden</Text>
            <Text style={s.hint}>Sehr hohe Rendite bei schwacher Sicherheit, Quote über 100 % oder gekürzte Dividende.</Text>
          </View>
          <Switch value={hideTraps} onValueChange={setHideTraps} trackColor={{ true: colors.accent, false: colors.card2 }} thumbColor="#fff" />
        </View>

        {scan.loading && !scan.data ? <Loading text="Dividenden-Daten werden geladen …" /> : null}
        {scan.error && !scan.data ? <ErrorBox text={scan.error} onRetry={scan.reload} /> : null}

        {scan.data && !hasDivData ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={s.muted}>Noch keine Dividenden-Daten in der Server-Datei. Auf GitHub einmal den Workflow „Ranking berechnen" starten, dann erscheinen sie (dauert ca. 15 Minuten).</Text>
          </Card>
        ) : null}

        {scan.data && hasDivData ? (
          <>
            <SectionTitle>{rows.length.toLocaleString('de-DE')} Treffer</SectionTitle>
            {rows.slice(0, 40).map((r) => (
              <DivRow key={r.symbol} r={r} onPress={() => nav.navigate('Detail', { symbol: r.symbol, tab: 'dividend' })} />
            ))}
            {rows.length === 0 ? (
              <Card>
                <Text style={s.muted}>Kein Treffer mit diesen Filtern. Senke die Mindest-Rendite oder schalte „Dividendenfallen ausblenden" aus.</Text>
              </Card>
            ) : null}
            <Text style={[s.hint, { marginTop: 8, lineHeight: 17 }]}>
              Stand {fmtDateTime(scan.data.generatedAt)}. Achtung: Sonderdividenden (einmalige Zahlungen) können die Rendite verzerren, bei Immobilien-Firmen (REITs) ist die Ausschüttungsquote nach Gewinn nicht aussagekräftig. Dividenden sind nicht garantiert und können gekürzt werden.
            </Text>
          </>
        ) : null}
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

function DivRow({ r, onPress }: { r: ScanRow; onPress: () => void }) {
  const q = r.dq ?? 0;
  const exSoon = r.exd != null ? (r.exd * 1000 - Date.now()) / 86400_000 : null;
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 8, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.sym}>{r.symbol}</Text>
            <Text style={s.muted} numberOfLines={1}>{r.name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.yield}>{fmtNum((r.div ?? 0) * 100, 2)} %</Text>
            <Text style={s.muted}>Rendite · {freq(r.dper)}</Text>
          </View>
        </View>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Sicherheit</Text>
            <Text style={[s.statVal, { color: safetyColor(q) }]}>{q}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Ausschüttung</Text>
            <Text style={s.statVal}>{r.payout != null ? `${fmtNum(r.payout * 100, 0)} %` : '–'}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Wachstum</Text>
            <Text style={[s.statVal, r.dgr != null ? { color: signColor(r.dgr) } : null]}>{r.dgr != null ? fmtPct(r.dgr, 1) : '–'}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>Serie</Text>
            <Text style={s.statVal}>{r.dstreak != null ? `${r.dstreak} J.` : '–'}</Text>
          </View>
        </View>

        <View style={s.tags}>
          <Tag text={q >= 80 ? 'sehr sichere Dividende' : q >= 65 ? 'solide Dividende' : q >= 45 ? 'mittlere Sicherheit' : 'riskante Dividende'} good={q >= 65} warn={q >= 45 && q < 65} bad={q < 45} />
          {r.fund != null ? <Tag text={`Fundament ${gradeOf(r.fund)} · ${r.fund}`} good={r.fund >= 62} warn={r.fund < 48} /> : null}
          {r.dtrap ? <Tag text="Dividendenfalle?" bad /> : null}
          {r.dcut ? <Tag text={`Kürzung ${r.dcut}`} warn /> : null}
          {exSoon != null && exSoon > -1 && exSoon <= 45 ? <Tag text={exSoon < 1 ? 'Ex-Tag heute' : `Ex-Tag in ${Math.round(exSoon)} Tg.`} accent /> : null}
          {r.sector ? <Tag text={r.sector} /> : null}
        </View>
        <View style={s.openRow}>
          <Text style={s.hint}>Details & Rechner</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </View>
      </Card>
    </Pressable>
  );
}

const Tag = ({ text, good, bad, warn, accent }: { text: string; good?: boolean; bad?: boolean; warn?: boolean; accent?: boolean }) => (
  <View style={{ backgroundColor: good ? colors.greenBg : bad ? colors.redBg : warn ? colors.amberBg : accent ? colors.accentBg : colors.card2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 }}>
    <Text style={{ fontSize: type.small, fontWeight: '600', color: good ? colors.green : bad ? colors.red : warn ? colors.amber : accent ? colors.accent : colors.muted }}>{text}</Text>
  </View>
);

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: type.small, lineHeight: 18 },
  hint: { color: colors.muted, fontSize: type.small },
  label: { color: colors.text, fontWeight: '700', fontSize: 13, marginTop: 14, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sym: { color: colors.text, fontWeight: '800', fontSize: type.h1 },
  yield: { color: colors.green, fontWeight: '800', fontSize: 22 },
  stats: { flexDirection: 'row', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { flex: 1, paddingRight: 4 },
  statLabel: { color: colors.muted, fontSize: type.small, marginBottom: 3 },
  statVal: { color: colors.text, fontSize: type.value, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 4 },
});
