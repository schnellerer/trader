import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { scenario30 } from '../analysis/model';
import { getRanking, rankingMeta } from '../analysis/ranking';
import { BiasBadge, Card, Disclaimer, ErrorBox, Loading, Screen, Segmented } from '../components/UI';
import { fmtDateTime, fmtPct } from '../format';
import { RankItem } from '../types';

type Filter = 'all' | 'large' | 'mid' | 'small' | 'micro';
const LIQ_LABEL: Record<string, string> = { large: 'Große Werte', mid: 'Mittlere Werte', small: 'Kleine Werte', micro: 'Micro-Caps' };
import { colors, signColor, space } from '../theme';

export default function TopScreen() {
  const nav = useNavigation<any>();
  const [items, setItems] = useState<RankItem[] | null>(null);
  const [err, setErr] = useState('');
  const [prog, setProg] = useState<[number, number]>([0, 1]);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = (force = false) => {
    setErr('');
    return getRanking(force, (d, t) => setProg([d, t]))
      .then(setItems)
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const meta = rankingMeta();
  const hasClasses = !!items?.some((x) => x.liq);
  const top = (items ?? []).filter((x) => filter === 'all' || x.liq === filter).slice(0, 10);

  return (
    <Screen title="Top 10" subtitle="Höchste erwartete Rendite (30 Tage, Basisszenario)">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load(true);
              setRefreshing(false);
            }}
          />
        }
      >
        {!items && !err && <Loading text={`Analysiere Aktien … ${prog[0]} / ${prog[1] > 1 ? prog[1] : '…'}`} />}
        {err && !items ? <ErrorBox text={err} onRetry={() => load(true)} /> : null}

        {items && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={s.muted}>
              {meta?.source === 'server'
                ? `Ausgewertet: ${meta.analyzed.toLocaleString('de-DE')} US- und DAX-Aktien (Stand ${fmtDateTime(meta.generatedAt)}).`
                : `Ausgewertet: ${items.length} große US- und DAX-Aktien (lokale Auswahl – Server noch nicht eingerichtet, daher keine Small Caps).`}{' '}
              Sortiert nach erwarteter Rendite im Verhältnis zur Schwankung.
            </Text>
          </Card>
        )}

        {hasClasses && (
          <View style={{ marginBottom: 12 }}>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { key: 'all', label: 'Alle' },
                { key: 'large', label: 'Groß' },
                { key: 'mid', label: 'Mittel' },
                { key: 'small', label: 'Klein' },
                { key: 'micro', label: 'Micro' },
              ]}
            />
            {filter !== 'all' && meta?.counts ? (
              <Text style={[s.muted, { marginTop: 6 }]}>
                {LIQ_LABEL[filter]} nach Handelsvolumen: {(meta.counts[filter] ?? 0).toLocaleString('de-DE')} Aktien ausgewertet.
                {filter === 'small' || filter === 'micro' ? ' Hohes Risiko: starke Kurssprünge, schwer handelbar.' : ''}
              </Text>
            ) : null}
          </View>
        )}

        {top.map((r, i) => {
          const isOpen = open === r.symbol;
          const sc = scenario30(r.expected, r.vol);
          return (
            <Card key={r.symbol} style={{ marginBottom: 10 }}>
              <Pressable onPress={() => setOpen(isOpen ? null : r.symbol)}>
                <View style={s.row}>
                  <View style={[s.rank, i < 3 && { backgroundColor: colors.amberBg }]}>
                    <Text style={[s.rankText, i < 3 && { color: colors.amber }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sym}>{r.symbol}</Text>
                    <Text style={s.muted} numberOfLines={1}>{r.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.exp, { color: signColor(sc.base) }]}>{fmtPct(sc.base)}</Text>
                    <Text style={s.muted}>Basis / 30 Tage</Text>
                  </View>
                </View>
                <View style={[s.row, { marginTop: 10 }]}>
                  <BiasBadge bias={r.bias} small />
                  <Text style={[s.muted, { marginLeft: 10, flex: 1 }]}>
                    Schwankung {(r.vol * 100).toFixed(0)} %{r.liq ? ` · ${LIQ_LABEL[r.liq]}` : ''}
                  </Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                </View>
              </Pressable>
              {isOpen && (
                <View style={s.expl}>
                  <Text style={s.explText}>
                    {`30-Tage-Szenarien: Bullisch ${fmtPct(sc.bull)} · Basis ${fmtPct(sc.base)} · Bärisch ${fmtPct(sc.bear)}.\n`}
                    {r.explanation}
                  </Text>
                  <Pressable onPress={() => nav.navigate('Detail', { symbol: r.symbol })} style={s.link}>
                    <Text style={s.linkText}>Volle Analyse & Szenarien öffnen</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                  </Pressable>
                </View>
              )}
            </Card>
          );
        })}
        {items && <Disclaimer />}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rank: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rankText: { color: colors.muted, fontWeight: '800' },
  sym: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted, fontSize: 12 },
  exp: { fontSize: 20, fontWeight: '800' },
  expl: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  explText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  linkText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
});
