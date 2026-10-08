import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RANK_HORIZONS, scenarioFor } from '../analysis/model';
import { getRanking, rankingMeta } from '../analysis/ranking';
import { BiasBadge, Button, Card, Disclaimer, ErrorBox, Loading, Screen, Segmented } from '../components/UI';
import { fmtDateTime, fmtMoney, fmtPct } from '../format';
import { RankItem } from '../types';
import { colors, signColor, space } from '../theme';

type Filter = 'all' | 'large' | 'mid' | 'small' | 'micro';
type View_ = 'top' | 'ideas';
type Horizon = (typeof RANK_HORIZONS)[number]['key'];
type Sort = 'risk' | 'return';

const LIQ_LABEL: Record<string, string> = { large: 'Große Werte', mid: 'Mittlere Werte', small: 'Kleine Werte', micro: 'Micro-Caps' };

export default function TopScreen({ view: viewProp }: { view?: View_ } = {}) {
  const nav = useNavigation<any>();
  const [items, setItems] = useState<RankItem[] | null>(null);
  const [err, setErr] = useState('');
  const [prog, setProg] = useState<[number, number]>([0, 1]);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [viewState, setView] = useState<View_>('top');
  const view = viewProp ?? viewState;
  const [horizon, setHorizon] = useState<Horizon>('30d');
  const [sort, setSort] = useState<Sort>('risk');

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
  const years = RANK_HORIZONS.find((h) => h.key === horizon)!.years;
  const hLabel = RANK_HORIZONS.find((h) => h.key === horizon)!.label;

  const top = useMemo(() => {
    return (items ?? [])
      .filter((x) => filter === 'all' || x.liq === filter)
      .map((r) => ({ r, sc: scenarioFor(r, years) }))
      .sort((a, b) => (sort === 'return' ? b.sc.base - a.sc.base : b.sc.base / (0.5 + b.r.vol) - a.sc.base / (0.5 + a.r.vol)))
      .slice(0, 10);
  }, [items, filter, years, sort]);

  // Kaufideen: Aufwärtstrend, gut handelbar, nicht zu wild
  const ideas = useMemo(() => {
    return (items ?? [])
      // Aufwärtstrend UND – wenn bekannt – solides Fundament (mind. 50 von 100)
      .filter((r) => r.score >= 2 && r.bias === 'bullish' && r.aboveSma200 && r.liq !== 'micro' && r.vol < 0.55 && (r.fund == null || r.fund >= 50))
      .map((r) => {
        const sc = scenarioFor(r, 30 / 365);
        const sigma30 = r.vol * Math.sqrt(30 / 365);
        const stopPct = Math.min(0.12, Math.max(0.04, sigma30));
        const target = Math.max(sc.bull, stopPct * 1.5);
        // Fundament gewichtet die Reihenfolge: Note 80 → ×1,3, Note 40 → ×0,9
        return { r, sc, stopPct, target, rr: target / stopPct, quality: r.rankKey * (0.5 + (r.fund ?? 50) / 100) };
      })
      .sort((a, b) => b.quality - a.quality)
      .slice(0, 8);
  }, [items]);

  const toDuell = (symbol: string) => nav.navigate('Training', { symbol, ts: Date.now() });

  return (
    <Screen title="Ranking" subtitle={view === 'top' ? `Höchste erwartete Rendite (${hLabel}, Basisszenario)` : 'Kaufideen – nur fürs Spiel'}>
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
        {viewProp ? null : (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { key: 'top', label: 'Top 10' },
              { key: 'ideas', label: 'Kaufideen' },
            ]}
          />
        )}

        {!items && !err && <Loading text={`Analysiere Aktien … ${prog[0]} / ${prog[1] > 1 ? prog[1] : '…'}`} />}
        {err && !items ? <ErrorBox text={err} onRetry={() => load(true)} /> : null}

        {items && (
          <Card style={{ marginVertical: 12 }}>
            <Text style={s.muted}>
              {meta?.source === 'server'
                ? `Ausgewertet: ${meta.analyzed.toLocaleString('de-DE')} US- und DAX-Aktien (Stand ${fmtDateTime(meta.generatedAt)}).`
                : `Ausgewertet: ${items.length} große US- und DAX-Aktien (lokale Auswahl – Server noch nicht eingerichtet, daher keine Small Caps).`}{' '}
              {view === 'top' ? 'Zum Aktualisieren nach unten ziehen.' : 'Nur Aktien mit Aufwärtstrend, guter Handelbarkeit und moderater Schwankung.'}
            </Text>
          </Card>
        )}

        {items && view === 'top' && (
          <>
            <Segmented value={horizon} onChange={setHorizon} options={RANK_HORIZONS.map((h) => ({ key: h.key, label: h.label }))} />
            <View style={{ height: 8 }} />
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { key: 'risk', label: 'Rendite pro Risiko' },
                { key: 'return', label: 'Höchste Rendite' },
              ]}
            />
            {hasClasses && (
              <View style={{ marginTop: 8, marginBottom: 12 }}>
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
            {years >= 5 ? (
              <Text style={[s.muted, { marginBottom: 8, lineHeight: 17 }]}>
                Je länger der Zeitraum, desto unsicherer die Zahlen: Bei 5 Jahren zählt fast nur der langfristige Markt-Schnitt gegen die Schwankung, kaum noch der aktuelle Trend.
              </Text>
            ) : null}

            {top.map(({ r, sc }, i) => {
              const isOpen = open === r.symbol;
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
                        <Text style={[s.exp, { color: signColor(sc.base) }]}>{fmtPct(sc.base, years >= 1 ? 0 : 1)}</Text>
                        <Text style={s.muted}>Basis / {hLabel}</Text>
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
                        {`${hLabel}-Szenarien: Bullisch ${fmtPct(sc.bull, years >= 1 ? 0 : 1)} · Basis ${fmtPct(sc.base, years >= 1 ? 0 : 1)} · Bärisch ${fmtPct(sc.bear, years >= 1 ? 0 : 1)}.\n`}
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
          </>
        )}

        {items && view === 'ideas' && (
          <>
            {ideas.length === 0 ? (
              <Card>
                <Text style={s.muted}>Aktuell keine Aktie, die alle Kriterien erfüllt. Das ist ein gutes Zeichen für Vorsicht – komm später wieder.</Text>
              </Card>
            ) : null}
            {ideas.map(({ r, sc, stopPct, target, rr }, i) => {
              const stars = Math.min(5, Math.max(1, r.score));
              return (
                <Card key={r.symbol} style={{ marginBottom: 10 }}>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sym}>{r.symbol}</Text>
                      <Text style={s.muted} numberOfLines={1}>{r.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Ionicons key={n} name={n <= stars ? 'star' : 'star-outline'} size={14} color={n <= stars ? colors.amber : colors.border} />
                        ))}
                      </View>
                      <Text style={s.muted}>Überzeugung</Text>
                    </View>
                  </View>
                  <View style={s.ideaGrid}>
                    <Mini label="Kurs" value={fmtMoney(r.price)} />
                    <Mini label="Ziel (30 T, bullisch)" value={fmtPct(target, 1)} color={colors.green} />
                    <Mini label="Stop-Loss" value={fmtPct(-stopPct, 1, false)} color={colors.red} />
                    <Mini label="Chance : Risiko" value={`${rr.toFixed(1).replace('.', ',')} : 1`} />
                    <Mini
                      label="Fundament"
                      value={r.fund != null ? `${r.fund >= 75 ? 'A' : r.fund >= 62 ? 'B' : r.fund >= 48 ? 'C' : 'D'} · ${r.fund}/100` : 'keine Daten'}
                      color={r.fund != null ? (r.fund >= 62 ? colors.green : colors.amber) : undefined}
                    />
                    <Mini label="Relative Stärke" value={r.rs != null ? `${r.rs}/99` : '–'} />
                  </View>
                  <Text style={s.explText}>
                    {`Warum: ${r.signals.filter((x) => x.value > 0).slice(0, 3).map((x) => x.text).join('; ')}. `}
                    {`Basisszenario 30 Tage ${fmtPct(sc.base)}, 1 Jahr ${fmtPct(scenarioFor(r, 1).base, 0)}.`}
                    {r.liq === 'small' ? ' Kleiner Wert: höheres Risiko.' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Im Duell kaufen" icon="game-controller-outline" onPress={() => toDuell(r.symbol)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Analyse" kind="ghost" onPress={() => nav.navigate('Detail', { symbol: r.symbol })} />
                    </View>
                  </View>
                </Card>
              );
            })}
            {ideas.length > 0 ? (
              <Text style={[s.muted, { lineHeight: 17 }]}>
                Die Ideen sind nur für das Spiel mit Spielgeld gedacht. Faustregel im Spiel: höchstens 10–20 % des Depots pro Aktie und immer einen Stop-Loss setzen.
              </Text>
            ) : null}
          </>
        )}
        {items && <Disclaimer />}
      </ScrollView>
    </Screen>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 6 }}>
      <Text style={s.muted}>{label}</Text>
      <Text style={[{ color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 }, color ? { color } : null]}>{value}</Text>
    </View>
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
  ideaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
});
