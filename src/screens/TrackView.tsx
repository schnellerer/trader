import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TRACK_URL } from '../config';
import { Card, SectionTitle } from '../components/UI';
import { fmtDate, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { colors, space } from '../theme';

interface Group {
  n: number;
  sum: number;
  pos: number;
}
interface Track {
  generatedAt: number;
  since: string | null;
  openCount: number;
  resolved: number;
  groups: { top: Group; base: Group };
  calib: { lo: number; hi: number; n: number; wins: number; avgPred: number }[];
  coverage: { n: number; aboveBull: number; belowBear: number };
}

async function load(): Promise<Track | null> {
  const r = await fetch(`${TRACK_URL}?t=${Math.floor(Date.now() / 300_000)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Prognose-Zeugnis: Wie gut waren die 30-Tage-Prognosen des Modells wirklich? */
export default function TrackView() {
  const tr = useAsync(load, []);
  const t = tr.data;
  const top = t?.groups.top;
  const base = t?.groups.base;
  const avg = (g?: Group) => (g && g.n ? g.sum / g.n : 0);
  const daysRunning = t?.since ? Math.floor((Date.now() - Date.parse(t.since)) / 86400_000) : 0;
  return (
    <>
      <SectionTitle>Prognose-Zeugnis</SectionTitle>
      <Card>
        <Text style={s.muted}>
          Jeden Börsentag speichert der Server die 30-Tage-Prognosen für die 20 bestplatzierten Aktien und für 40 zufällige andere. Nach 30 Tagen wird nachgeprüft, was wirklich passiert ist. So siehst du, ob das Ranking mehr kann als Zufall – und ob die Wahrscheinlichkeiten stimmen.
        </Text>
        {!t ? (
          <Text style={[s.muted, { marginTop: 8 }]}>Noch keine Daten. Das Zeugnis startet mit dem nächsten Ranking-Lauf auf GitHub (jeden Börsentag abends).</Text>
        ) : t.resolved === 0 ? (
          <Text style={[s.text, { marginTop: 10 }]}>
            Seit {fmtDate(Date.parse(t.since!))} läuft die Sammlung ({daysRunning} von 30 Tagen). {t.openCount} Prognosen warten auf ihre Überprüfung – die ersten Ergebnisse kommen nach 30 Tagen.
          </Text>
        ) : (
          <>
            <Text style={[s.text, { marginTop: 10 }]}>{t.resolved} Prognosen sind bereits überprüft ({t.openCount} laufen noch).</Text>
            <View style={s.cmp}>
              <View style={s.cmpCol}>
                <Text style={s.muted}>Modell-Top-20</Text>
                <Text style={[s.big, { color: avg(top) >= 0 ? colors.green : colors.red }]}>{fmtPct(avg(top), 1)}</Text>
                <Text style={s.muted}>Ø in 30 Tagen · {top!.n ? fmtPct(top!.pos / top!.n, 0, false) : '–'} im Plus</Text>
              </View>
              <View style={s.cmpCol}>
                <Text style={s.muted}>Zufallsgruppe</Text>
                <Text style={[s.big, { color: avg(base) >= 0 ? colors.green : colors.red }]}>{fmtPct(avg(base), 1)}</Text>
                <Text style={s.muted}>Ø in 30 Tagen · {base!.n ? fmtPct(base!.pos / base!.n, 0, false) : '–'} im Plus</Text>
              </View>
            </View>
            <Text style={[s.text, { marginTop: 8 }]}>
              {avg(top) > avg(base)
                ? `Bisher lag die Auswahl des Modells ${fmtPct(avg(top) - avg(base), 1)}-Punkte vor dem Durchschnitt.`
                : `Bisher war die Auswahl des Modells NICHT besser als der Durchschnitt (${fmtPct(avg(top) - avg(base), 1)}-Punkte).`}
              {top!.n < 100 ? ' Achtung: noch wenige Prognosen, das kann Zufall sein.' : ''}
            </Text>
          </>
        )}
      </Card>

      {t && t.resolved > 0 ? (
        <>
          <SectionTitle>Stimmen die Wahrscheinlichkeiten?</SectionTitle>
          <Card style={{ paddingVertical: 6 }}>
            <View style={[s.row, { paddingBottom: 6 }]}>
              <Text style={[s.muted, { flex: 1 }]}>Modell sagte „Gewinn in …"</Text>
              <Text style={[s.muted, s.col]}>Prognosen</Text>
              <Text style={[s.muted, s.col]}>tatsächlich</Text>
            </View>
            {t.calib
              .filter((c) => c.n > 0)
              .map((c) => (
                <View key={c.lo} style={[s.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[s.text, { flex: 1 }]}>
                    {Math.round(c.lo * 100)}–{Math.min(100, Math.round(c.hi * 100))} % der Fälle
                  </Text>
                  <Text style={[s.text, s.col]}>{c.n}</Text>
                  <Text style={[s.text, s.col, { color: Math.abs(c.wins / c.n - c.avgPred) < 0.12 ? colors.green : colors.amber, fontWeight: '700' }]}>{fmtPct(c.wins / c.n, 0, false)}</Text>
                </View>
              ))}
            <Text style={[s.muted, { marginTop: 8, lineHeight: 17 }]}>
              Gut kalibriert = die tatsächliche Quote liegt nahe an der Vorhersage (grün). Große Abweichung = das Modell ist über- oder unterzuversichtlich.
              {t.coverage.n >= 30
                ? ` Die „Bullisch"/„Bärisch"-Grenzen wurden in ${fmtPct(t.coverage.aboveBull / t.coverage.n, 0, false)} / ${fmtPct(t.coverage.belowBear / t.coverage.n, 0, false)} der Fälle überschritten (Soll: je ca. 16 %).`
                : ''}
            </Text>
          </Card>
        </>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  text: { color: colors.text, fontSize: 13, lineHeight: 20 },
  big: { fontSize: 24, fontWeight: '800', marginVertical: 2 },
  cmp: { flexDirection: 'row', gap: space.m, marginTop: 10 },
  cmpCol: { flex: 1, backgroundColor: colors.card2, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  col: { width: 82, textAlign: 'right' },
});
