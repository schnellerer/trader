import React, { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WAF_URL } from '../config';
import Chart from '../components/Chart';
import { Card, ErrorBox, Loading, Screen, SectionTitle } from '../components/UI';
import { fmtDate } from '../format';
import { useAsync } from '../hooks';
import { colors, space, type } from '../theme';

interface Item {
  label: string;
  value: string;
  note: string;
  date: string;
  score: number;
}
interface Comp {
  key: string;
  title: string;
  icon: string;
  weight: number;
  score: number;
  items: Item[];
  line: string;
}
interface Waf {
  generatedAt: number;
  score: number;
  label: string;
  line: string;
  prev: { week: number | null; month: number | null };
  components: Comp[];
  headlines: { title: string; source: string; link: string }[];
  history: { d: string; s: number }[];
  warnings: string[];
}

async function load(): Promise<Waf | null> {
  const r = await fetch(`${WAF_URL}?t=${Math.floor(Date.now() / 300_000)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`W.A.F-Daten nicht erreichbar (HTTP ${r.status})`);
  return r.json();
}

// Höher = schlimmer: grün → gelb → rot
const lvColor = (s: number) => (s < 35 ? colors.green : s < 60 ? colors.amber : colors.red);

const TIPS = [
  ['wallet', 'Notgroschen zuerst', '3 bis 6 Monatsausgaben auf einem Tagesgeldkonto. Das nimmt dem Rest der Krise den Schrecken.'],
  ['pricetags', 'Fixkosten prüfen', 'Strom, Handy, Internet, Versicherungen: Ein Vergleich pro Jahr spart oft mehr als jede Börsenidee.'],
  ['trending-up', 'Langfristig investieren', 'Auch kleine Sparpläne über Jahre wirken. Mit Geld, das du lange nicht brauchst, und breit gestreut.'],
  ['school', 'In dich investieren', 'Fähigkeiten, die gebraucht werden, sind der sicherste „Zins" – gerade wenn der Arbeitsmarkt wackelt.'],
] as const;

export default function WafScreen() {
  const waf = useAsync(load, []);
  const [open, setOpen] = useState<string | null>(null);
  const [method, setMethod] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const w = waf.data;

  return (
    <Screen title="W.A.F" subtitle="We Are Fucked · Deutschland-Check">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await waf.reload();
              setRefreshing(false);
            }}
          />
        }
      >
        {waf.loading && !w ? <Loading text="Lage wird geprüft …" /> : null}
        {waf.error && !w ? <ErrorBox text={waf.error} onRetry={waf.reload} /> : null}
        {waf.data === null && !waf.loading && !waf.error ? (
          <Card>
            <Text style={s.body}>Noch keine Daten. Auf GitHub einmal den Workflow „W.A.F berechnen" starten, danach läuft er täglich von selbst.</Text>
          </Card>
        ) : null}

        {w ? (
          <>
            <Card style={{ ...s.hero, borderColor: lvColor(w.score) }}>
              <Text style={s.small}>Wie sehr ist die Gen Z in Deutschland gerade aufgeschmissen?</Text>
              <View style={s.scoreRow}>
                <Text style={[s.score, { color: lvColor(w.score) }]}>{w.score}</Text>
                <Text style={s.of}>/ 100</Text>
                <Trend now={w.score} week={w.prev.week} />
              </View>
              <Text style={[s.label, { color: lvColor(w.score) }]}>{w.label}</Text>
              <Text style={s.line}>{w.line}</Text>

              <View style={s.bar}>
                {[colors.green, '#8BE35A', colors.amber, '#FF9A4D', colors.red].map((c, i) => (
                  <View key={i} style={[s.seg, { backgroundColor: c }]} />
                ))}
                <View style={[s.marker, { left: `${Math.min(97, Math.max(1, w.score))}%` }]} />
              </View>
              <View style={s.barLabels}>
                <Text style={s.micro}>läuft</Text>
                <Text style={s.micro}>eng</Text>
                <Text style={s.micro}>maximal</Text>
              </View>
              <Text style={[s.micro, { marginTop: 8 }]}>Stand {fmtDate(w.generatedAt)} · Satire mit echten Zahlen</Text>
            </Card>

            {w.history.length >= 3 ? (
              <>
                <SectionTitle>Verlauf</SectionTitle>
                <Card>
                  <Chart data={w.history.map((h) => ({ t: Date.parse(h.d), v: h.s }))} height={90} color={colors.amber} />
                  <Text style={[s.micro, { marginTop: 6 }]}>Der Verlauf füllt sich mit jedem Tag. Höher = schlimmer.</Text>
                </Card>
              </>
            ) : null}

            <SectionTitle>Woran liegt's?</SectionTitle>
            {[...w.components].sort((a, b) => b.score * b.weight - a.score * a.weight).map((c) => {
              const isOpen = open === c.key;
              return (
                <Card key={c.key} style={{ marginBottom: 10, padding: 14 }}>
                  <Pressable onPress={() => setOpen(isOpen ? null : c.key)}>
                    <View style={s.cHead}>
                      <View style={[s.icon, { backgroundColor: colors.card2 }]}>
                        <Ionicons name={c.icon as any} size={18} color={lvColor(c.score)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cTitle}>{c.title}</Text>
                        <Text style={s.small}>Gewicht {Math.round(c.weight * 100)} %</Text>
                      </View>
                      <Text style={[s.cScore, { color: lvColor(c.score) }]}>{c.score}</Text>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                    </View>
                    <View style={s.cBar}>
                      <View style={{ height: 6, borderRadius: 3, width: `${Math.max(3, c.score)}%`, backgroundColor: lvColor(c.score) }} />
                    </View>
                    <Text style={s.cLine}>{c.line}</Text>
                  </Pressable>
                  {isOpen ? (
                    <View style={s.items}>
                      {c.items.map((i) => (
                        <View key={i.label} style={s.item}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.iLabel}>{i.label}</Text>
                            <Text style={s.small}>{i.note} · Stand {i.date}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={s.iValue}>{i.value}</Text>
                            <Text style={[s.small, { color: lvColor(i.score) }]}>Stress {i.score}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            })}

            {w.headlines.length ? (
              <>
                <SectionTitle>Schlagzeilen, die den Wert treiben</SectionTitle>
                <Card style={{ paddingVertical: 4 }}>
                  {w.headlines.map((h, i) => (
                    <Pressable key={i} onPress={() => h.link && Linking.openURL(h.link).catch(() => {})} style={[s.head, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <Text style={s.hTitle}>{h.title}</Text>
                      <Text style={s.small}>{h.source}</Text>
                    </Pressable>
                  ))}
                </Card>
              </>
            ) : null}

            <SectionTitle>Und jetzt?</SectionTitle>
            <Card>
              {TIPS.map(([icon, title, text], i) => (
                <View key={title} style={[s.tip, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Ionicons name={icon as any} size={20} color={colors.accent} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.iLabel}>{title}</Text>
                    <Text style={s.body}>{text}</Text>
                  </View>
                </View>
              ))}
              <Text style={[s.micro, { marginTop: 10 }]}>Allgemeine Hinweise, keine Anlage- oder Rechtsberatung.</Text>
            </Card>

            <Pressable onPress={() => setMethod(!method)} style={s.methodHead}>
              <Text style={s.cTitle}>Wie wird das berechnet?</Text>
              <Ionicons name={method ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {method ? (
              <Card>
                <Text style={s.body}>
                  Der Score (0 = entspannt, 100 = maximal fucked) ist ein Spaß-Index mit echten Zahlen, kein wissenschaftlicher Index. Jede Kennzahl wird nach meinen eigenen Schwellen auf 0 bis 100 gelegt (z. B. Inflation 1,5 % = 0, 7 % = 100) und dann gewichtet gemittelt.{'\n\n'}
                  <Text style={{ fontWeight: '700', color: colors.text }}>Gewichte:</Text> Preise im Alltag 20 %, Wohnen 20 %, Job & Zukunft 20 %, Börse 15 %, Politik-Schlagzeilen 15 %, Krypto 10 %.{'\n\n'}
                  <Text style={{ fontWeight: '700', color: colors.text }}>Quellen:</Text> Eurostat (Preise, Mieten, Arbeitslosigkeit, Immobilien, Wirtschaftswachstum, jeweils für Deutschland), EZB (Hypothekenzins), Yahoo Finance (DAX, Bitcoin in Euro), deutsche Nachrichten-Feeds (Tagesschau, Spiegel, ntv, FAZ, Zeit).{'\n\n'}
                  <Text style={{ fontWeight: '700', color: colors.text }}>Grenzen:</Text> Amtliche Zahlen kommen mit Verzögerung, das jeweilige Datum steht an jeder Kennzahl. Der Politik-Wert misst nur, wie viele Schlagzeilen Krisen-Wörter enthalten, nicht, wer recht hat. Wohnkosten, Rente und Ausbildung/Studium fehlen mangels kostenloser Daten. Alles ist Spaß mit Zahlen, keine Prognose und keine Meinung zu einer Partei.
                </Text>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Trend({ now, week }: { now: number; week: number | null }) {
  if (week == null) return null;
  const d = now - week;
  if (d === 0) return <Text style={[s.trend, { color: colors.muted }]}>wie letzte Woche</Text>;
  return (
    <View style={s.trendRow}>
      <Ionicons name={d > 0 ? 'arrow-up' : 'arrow-down'} size={14} color={d > 0 ? colors.red : colors.green} />
      <Text style={[s.trend, { color: d > 0 ? colors.red : colors.green }]}>
        {d > 0 ? '+' : ''}
        {d} seit letzter Woche
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { padding: 18, borderWidth: 1.5 },
  small: { color: colors.muted, fontSize: type.small, lineHeight: 17 },
  micro: { color: colors.muted, fontSize: type.small },
  body: { color: colors.muted, fontSize: type.body, lineHeight: 21 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  score: { fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  of: { color: colors.muted, fontSize: type.h2, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  trend: { fontSize: type.small, fontWeight: '700' },
  label: { fontSize: type.title, fontWeight: '800', marginTop: 2 },
  line: { color: colors.text, fontSize: type.body, lineHeight: 21, marginTop: 6 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 16 },
  seg: { flex: 1, opacity: 0.85 },
  marker: { position: 'absolute', top: -3, width: 4, height: 16, borderRadius: 2, backgroundColor: '#fff' },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },

  cHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cTitle: { color: colors.text, fontWeight: '700', fontSize: type.h2 },
  cScore: { fontSize: 24, fontWeight: '800', marginRight: 6 },
  cBar: { height: 6, borderRadius: 3, backgroundColor: colors.card2, marginTop: 10 },
  cLine: { color: colors.muted, fontSize: type.body, fontStyle: 'italic', marginTop: 10 },
  items: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iLabel: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  iValue: { color: colors.text, fontSize: type.h2, fontWeight: '800' },

  head: { paddingVertical: 12 },
  hTitle: { color: colors.text, fontSize: type.body, lineHeight: 20, marginBottom: 2 },
  tip: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  methodHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
});
