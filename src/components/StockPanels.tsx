import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FundResult } from '../analysis/fundData';
import { Component, FundScore, gradeText, Verdict } from '../analysis/fundamental';
import { Plan } from '../analysis/tradePlan';
import { biasLabel } from '../analysis/model';
import { fmtMoney, fmtNum, fmtPct } from '../format';
import { Bias } from '../types';
import { colors, radius, signColor, space } from '../theme';
import { Button, Card, Loading, SectionTitle, Stat } from './UI';

const lvlColor = (l: Component['level'] | Verdict['level']) =>
  l === 'good' || l === 'great' ? colors.green : l === 'ok' || l === 'wait' || l === 'speculative' ? colors.amber : l === 'bad' || l === 'avoid' ? colors.red : colors.muted;

const gradeColor = (g: string) => (g === 'A' || g === 'B' ? colors.green : g === 'C' ? colors.amber : colors.red);

/** Gesamturteil: Fundament × Chart, immer sichtbar */
export function VerdictCard({ verdict, fund, bias, loading }: { verdict: Verdict | null; fund: FundScore | null; bias: Bias | null; loading: boolean }) {
  if (!verdict) return loading ? <Loading text="Gesamturteil wird berechnet …" /> : null;
  const c = lvlColor(verdict.level);
  return (
    <Card style={{ marginTop: space.l, borderColor: c }}>
      <Text style={s.small}>Gesamturteil</Text>
      <Text style={[s.verdict, { color: c }]}>{verdict.label}</Text>
      <Text style={s.text}>{verdict.headline}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View style={s.pill}>
          <Text style={s.small}>Fundament</Text>
          <Text style={[s.pillVal, { color: fund ? gradeColor(fund.grade) : colors.muted }]}>{fund ? `${fund.grade} · ${fund.total}` : '–'}</Text>
        </View>
        <View style={s.pill}>
          <Text style={s.small}>Chart</Text>
          <Text style={[s.pillVal, { color: bias === 'bullish' ? colors.green : bias === 'bearish' ? colors.red : colors.amber }]}>{bias ? biasLabel(bias) : '–'}</Text>
        </View>
        {fund?.upside != null ? (
          <View style={s.pill}>
            <Text style={s.small}>Kursziel</Text>
            <Text style={[s.pillVal, { color: signColor(fund.upside) }]}>{fmtPct(fund.upside, 0)}</Text>
          </View>
        ) : null}
      </View>
      {verdict.reasons.slice(1).map((r, i) => (
        <Text key={i} style={[s.small, { marginTop: 6, lineHeight: 17 }]}>
          • {r}
        </Text>
      ))}
    </Card>
  );
}

/** Reiter „Fundament": Noten je Bereich mit Erklärungen und Vergleich zur Branche */
export function FundTab({ res, score, loading }: { res: FundResult | null; score: FundScore | null; loading: boolean }) {
  if (loading && !res) return <Loading text="Fundamentaldaten werden geladen …" />;
  if (!res?.fund || !score)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.text}>Für diese Aktie liegen keine Fundamentaldaten vor.</Text>
        <Text style={[s.small, { marginTop: 6, lineHeight: 18 }]}>
          Das ist normal bei ETFs, Indizes und sehr kleinen oder ausländischen Werten. Täglich werden rund 3.000 US-Aktien und die DAX-Werte ausgewertet; neue Daten erscheinen nach dem nächsten Ranking-Lauf auf GitHub.
        </Text>
      </Card>
    );
  const f = res.fund;
  const sec = res.sector;
  const pe = f.fpe ?? f.pe;
  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={[s.grade, { borderColor: gradeColor(score.grade) }]}>
            <Text style={[s.gradeText, { color: gradeColor(score.grade) }]}>{score.grade}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.verdict}>{score.total} / 100 · {gradeText(score.grade)}</Text>
            <Text style={s.small}>{f.sec ? `${f.sec}${f.ind ? ' · ' + f.ind : ''}` : 'Branche unbekannt'}</Text>
          </View>
        </View>
        {score.flags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {score.flags.map((x) => (
              <View key={x} style={s.flag}>
                <Ionicons name="alert-circle" size={12} color={colors.amber} />
                <Text style={s.flagText}>{x}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {score.components.map((c) => (
        <Card key={c.key} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.compTitle}>{c.label}</Text>
            <Text style={{ color: lvlColor(c.level), fontWeight: '800' }}>{c.level === 'na' ? 'keine Daten' : c.score}</Text>
          </View>
          <View style={s.barBg}>
            <View style={{ height: 6, borderRadius: 3, width: `${c.score}%`, backgroundColor: lvlColor(c.level) }} />
          </View>
          {c.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Ionicons name={l.v > 0 ? 'checkmark-circle' : l.v < 0 ? 'close-circle' : 'remove-circle'} size={16} color={l.v > 0 ? colors.green : l.v < 0 ? colors.red : colors.muted} style={{ marginTop: 1 }} />
              <Text style={[s.small, { flex: 1, lineHeight: 18, color: colors.text }]}>{l.text}</Text>
            </View>
          ))}
        </Card>
      ))}

      <SectionTitle>Kennzahlen im Branchenvergleich</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        <Row label="KGV" value={pe != null ? fmtNum(pe, 1) : '–'} vs={sec?.pe != null ? fmtNum(sec.pe, 1) : null} lowerBetter />
        <Row label="Nettomarge" value={f.mar != null ? fmtPct(f.mar, 1, false) : '–'} vs={sec?.mar != null ? fmtPct(sec.mar, 1, false) : null} />
        <Row label="Umsatzwachstum" value={f.rev != null ? fmtPct(f.rev, 1) : '–'} vs={sec?.rev != null ? fmtPct(sec.rev, 1) : null} />
        <Row label="Eigenkapitalrendite" value={f.roe != null ? fmtPct(f.roe, 0, false) : '–'} vs={sec?.roe != null ? fmtPct(sec.roe, 0, false) : null} />
        <Row label="Dividendenrendite" value={f.div != null && f.div > 0 ? fmtPct(f.div, 2, false) : 'keine'} vs={null} />
        <Row label="Marktkapitalisierung" value={f.mcap != null ? `${fmtNum(f.mcap / 1e9, f.mcap > 1e10 ? 0 : 1)} Mrd.` : '–'} vs={null} />
        {sec ? <Text style={[s.small, { paddingVertical: 8 }]}>Vergleich = Median von {sec.n} Aktien derselben Branche.</Text> : null}
      </Card>
      <Text style={[s.small, { marginTop: 10, lineHeight: 17 }]}>
        Quelle: Yahoo Finance{res.source === 'server' && res.generatedAt ? `, Stand ${new Date(res.generatedAt).toLocaleDateString('de-DE')}` : ' (live)'}. Kennzahlen sind Faustregel-Bewertungen, Branchen unterscheiden sich stark. Nicht rückblickend getestet – Orientierung, kein Beweis.
      </Text>
    </>
  );
}

function Row({ label, value, vs, lowerBetter }: { label: string; value: string; vs: string | null; lowerBetter?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.small, { flex: 1 }]}>{label}</Text>
      <Text style={s.val}>{value}</Text>
      <Text style={[s.small, { width: 74, textAlign: 'right' }]}>{vs ? `Branche ${vs}` : ''}</Text>
    </View>
  );
}

/** Reiter „Trade-Plan": Einstieg, Stop, Ziele und Positionsgröße */
export function PlanTab({ plan, cur, symbol, defaultCapital, onDuell }: { plan: Plan | null; cur: string; symbol: string; defaultCapital: number; onDuell: () => void }) {
  const [cap, setCap] = useState(String(Math.round(defaultCapital)));
  const [risk, setRisk] = useState('1');
  if (!plan) return <Card style={{ marginTop: space.l }}><Text style={s.text}>Für einen Plan fehlen Kursdaten (mind. 60 Handelstage).</Text></Card>;
  const c = Number(cap.replace(',', '.')) || 0;
  const r = (Number(risk.replace(',', '.')) || 0) / 100;
  const perShare = plan.price - plan.stop;
  const qty = perShare > 0 && c > 0 && r > 0 ? Math.min(Math.floor((c * r) / perShare), Math.floor(c / plan.price)) : 0;
  const tc = plan.timing === 'now' ? colors.green : plan.timing === 'wait' ? colors.amber : colors.red;
  return (
    <>
      <Card style={{ marginTop: space.l, borderColor: tc }}>
        <Text style={s.small}>Timing</Text>
        <Text style={[s.verdict, { color: tc }]}>{plan.timingTitle}</Text>
        <Text style={s.text}>{plan.timingText}</Text>
        {plan.entryZone ? (
          <Text style={[s.text, { marginTop: 8, color: colors.amber }]}>
            Bevorzugte Einstiegszone: {fmtNum(plan.entryZone[0], 2)} – {fmtNum(plan.entryZone[1], 2)} {cur}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Dein Plan</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Stat label="Einstieg (aktuell)" value={`${fmtNum(plan.price, 2)} ${cur}`} />
          <Stat label={`Stop-Loss (−${fmtNum(plan.stopPct * 100, 1)} %)`} value={`${fmtNum(plan.stop, 2)} ${cur}`} color={colors.red} />
          <Stat label="Ziel 1 (2 × Risiko)" value={`${fmtNum(plan.t1, 2)} ${cur}`} color={colors.green} />
          <Stat label={`Ziel 2 (${plan.t2Label})`} value={`${fmtNum(plan.t2, 2)} ${cur}`} color={colors.green} />
          <Stat label="Chance : Risiko (Ziel 2)" value={`${fmtNum(plan.rr2, 1)} : 1`} color={plan.rr2 >= 2 ? colors.green : colors.amber} />
          <Stat label="Tägl. Schwankung (ATR)" value={`${fmtNum(plan.atr, 2)} ${cur}`} />
        </View>
        {plan.notes.map((n, i) => (
          <Text key={i} style={[s.small, { marginTop: 8, color: colors.amber, lineHeight: 17 }]}>
            • {n}
          </Text>
        ))}
      </Card>

      <SectionTitle>Wie viele Aktien?</SectionTitle>
      <Card>
        <Text style={s.small}>Du legst fest, wie viel du bei einem Stop-Out maximal verlieren willst – daraus ergibt sich die Stückzahl.</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.small}>Depot ({cur === '$' ? '€' : '€'})</Text>
            <TextInput value={cap} onChangeText={setCap} keyboardType="decimal-pad" style={s.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.small}>Risiko pro Trade (%)</Text>
            <TextInput value={risk} onChangeText={setRisk} keyboardType="decimal-pad" style={s.input} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          <Stat label="Stückzahl" value={String(qty)} />
          <Stat label="Einsatz" value={fmtMoney(qty * plan.price, cur === '$' ? '$' : cur)} />
          <Stat label="Maximaler Verlust" value={fmtMoney(qty * perShare, cur === '$' ? '$' : cur)} color={colors.red} />
          <Stat label="Anteil am Depot" value={c > 0 ? fmtPct((qty * plan.price) / c, 0, false) : '–'} />
        </View>
        <Button label="Im Duell mit Spielgeld kaufen" icon="game-controller-outline" onPress={onDuell} />
      </Card>
      <Text style={[s.small, { marginTop: 10, lineHeight: 17 }]}>
        Der Plan ist ein Rechenvorschlag aus Volatilität (ATR), letztem Zwischentief und Analysten-Kursziel – keine Anlageberatung. Die Wahrscheinlichkeit, dass das Ziel vor dem Stop erreicht wird, kann niemand kennen; der Plan sorgt dafür, dass ein Fehler begrenzt bleibt.
      </Text>
    </>
  );
}

const s = StyleSheet.create({
  small: { color: colors.muted, fontSize: 12 },
  text: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
  verdict: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  pill: { flex: 1, backgroundColor: colors.card2, borderRadius: 12, padding: 10 },
  pillVal: { fontWeight: '800', fontSize: 15, marginTop: 2 },
  grade: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  gradeText: { fontSize: 26, fontWeight: '900' },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.amberBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  flagText: { color: colors.amber, fontSize: 12, fontWeight: '700' },
  compTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: colors.card2, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  val: { color: colors.text, fontWeight: '700', fontSize: 14, width: 84, textAlign: 'right' },
  input: { backgroundColor: colors.card2, color: colors.text, borderRadius: radius.m, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 4 },
});
