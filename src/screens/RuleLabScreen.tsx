import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadHistory } from '../analysis/history';
import { PRESET_RULES, Rule, runRule, RuleResult } from '../analysis/ruleLab';
import Chart from '../components/Chart';
import { PctText } from '../components/Rows';
import { Button, Card, Disclaimer, ErrorBox, Screen, SectionTitle, Stat } from '../components/UI';
import { fmtDate, fmtNum, fmtPct } from '../format';
import { colors, space } from '../theme';

type Num = number | null;
interface Param {
  k: keyof Rule;
  label: string;
  hint: string;
  opts: Num[];
  fmt: (v: Num) => string;
}

const pct = (v: Num, off = 'aus') => (v == null ? off : `${Math.round(v * 100)} %`);

const PARAMS: Param[] = [
  { k: 'minRs', label: 'Relative Stärke mindestens', hint: 'Wie stark muss die Aktie gegenüber allen anderen laufen? 80 = besser als 80 %.', opts: [0, 40, 50, 60, 70, 80, 90, 95], fmt: (v) => (v ? String(v) : 'aus') },
  { k: 'maxRsi', label: 'RSI höchstens', hint: 'Niedrig = nur überverkaufte Aktien (Rücksetzer).', opts: [100, 75, 60, 50, 40, 35, 30], fmt: (v) => (v === 100 ? 'aus' : String(v)) },
  { k: 'minRsi', label: 'RSI mindestens', hint: 'Hoch = nur Aktien mit Schwung.', opts: [0, 30, 40, 50, 55, 60], fmt: (v) => (v ? String(v) : 'aus') },
  { k: 'nearHigh', label: 'Max. Abstand zum 52-Wochen-Hoch', hint: 'Klein = nur Aktien kurz vor/auf dem Jahreshoch (Ausbruch).', opts: [null, 0.03, 0.05, 0.1, 0.2], fmt: (v) => pct(v) },
  { k: 'maxVol', label: 'Schwankung höchstens', hint: 'Kleiner = ruhigere Aktien.', opts: [1, 0.6, 0.5, 0.4, 0.3, 0.25], fmt: (v) => (v === 1 ? 'aus' : pct(v)) },
  { k: 'positions', label: 'Max. Positionen', hint: 'Mehr = breiter gestreut.', opts: [1, 3, 5, 6, 8, 10, 15], fmt: (v) => String(v) },
  { k: 'stopLoss', label: 'Stop-Loss', hint: 'Verkauf bei diesem Verlust (wöchentlich geprüft).', opts: [null, 0.05, 0.08, 0.1, 0.15, 0.2], fmt: (v) => pct(v) },
  { k: 'takeProfit', label: 'Gewinnziel', hint: 'Verkauf bei diesem Gewinn.', opts: [null, 0.1, 0.12, 0.15, 0.2, 0.3, 0.5], fmt: (v) => pct(v) },
  { k: 'holdWeeks', label: 'Max. Haltedauer', hint: 'Verkauf nach dieser Zeit.', opts: [0, 2, 4, 8, 13, 26], fmt: (v) => (v ? `${v} Wochen` : 'unbegrenzt') },
];

const TOGGLES: { k: 'uptrend' | 'exitOnFail' | 'marketFilter'; label: string; hint: string }[] = [
  { k: 'uptrend', label: 'Nur im Aufwärtstrend', hint: 'Kurs über der 200-Tage-Linie.' },
  { k: 'exitOnFail', label: 'Verkaufen bei Trendbruch', hint: 'Wenn der Trend kippt oder die Stärke stark nachlässt.' },
  { k: 'marketFilter', label: 'Marktfilter', hint: 'Keine Käufe, wenn der S&P 500 unter seiner 200-Tage-Linie liegt.' },
];

export default function RuleLabScreen() {
  const [rule, setRule] = useState<Rule>(PRESET_RULES[0].rule);
  const [preset, setPreset] = useState<string>(PRESET_RULES[0].key);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [res, setRes] = useState<RuleResult | null>(null);
  const [err, setErr] = useState('');

  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => {
    setRule((r) => ({ ...r, [k]: v }));
    setPreset('');
    setRes(null);
  };

  const step = (p: Param, dir: 1 | -1) => {
    const cur = rule[p.k] as Num;
    let i = p.opts.findIndex((o) => o === cur);
    if (i < 0) i = 0;
    const ni = Math.max(0, Math.min(p.opts.length - 1, i + dir));
    set(p.k, p.opts[ni] as any);
  };

  const run = async () => {
    setBusy(true);
    setErr('');
    setRes(null);
    try {
      setProgress('Kursdaten werden geladen …');
      const h = await loadHistory((d, t) => setProgress(`Kursdaten laden … ${d} / ${t}`));
      setProgress('Regel wird getestet …');
      await new Promise((r) => setTimeout(r, 30));
      setRes(runRule(rule, h));
    } catch (e: any) {
      setErr(e?.message ?? 'Test fehlgeschlagen');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Screen title="Regel-Labor" subtitle="Eigene Handelsregel bauen und testen">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }}>
        <Card>
          <Text style={s.muted}>
            Stelle eine Regel zusammen und teste sie sofort über 10 Jahre echte Kurse (wöchentlich, 44 Aktien, 0,05 % Gebühr). So siehst du, ob eine Idee Geld verdient hätte – bevor du ihr traust.
          </Text>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l, marginTop: space.m }} contentContainerStyle={{ paddingHorizontal: space.l, gap: 8 }}>
          {PRESET_RULES.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => {
                setRule(p.rule);
                setPreset(p.key);
                setRes(null);
              }}
              style={[s.chip, preset === p.key && s.chipActive]}
            >
              <Text style={[s.chipText, preset === p.key && { color: colors.onAccent }]}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {preset ? <Text style={[s.muted, { marginTop: 8 }]}>{PRESET_RULES.find((p) => p.key === preset)!.desc}</Text> : <Text style={[s.muted, { marginTop: 8 }]}>Eigene Einstellung</Text>}

        <SectionTitle>Einstiegsbedingungen</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {PARAMS.slice(0, 5).map((p, i) => (
            <StepRow key={p.k} p={p} value={rule[p.k] as Num} first={i === 0} onStep={step} />
          ))}
          {TOGGLES.slice(0, 1).map((t) => (
            <ToggleRow key={t.k} t={t} value={rule[t.k]} onChange={(v) => set(t.k, v)} />
          ))}
          {TOGGLES.slice(2).map((t) => (
            <ToggleRow key={t.k} t={t} value={rule[t.k]} onChange={(v) => set(t.k, v)} />
          ))}
        </Card>

        <SectionTitle>Depot & Ausstieg</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {PARAMS.slice(5).map((p, i) => (
            <StepRow key={p.k} p={p} value={rule[p.k] as Num} first={i === 0} onStep={step} />
          ))}
          {TOGGLES.slice(1, 2).map((t) => (
            <ToggleRow key={t.k} t={t} value={rule[t.k]} onChange={(v) => set(t.k, v)} />
          ))}
        </Card>

        <Button label={busy ? progress || 'Läuft …' : 'Regel testen'} icon="flask" onPress={run} disabled={busy} />
        {err ? <ErrorBox text={err} onRetry={run} /> : null}
        {res ? <Result r={res} /> : null}
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

function StepRow({ p, value, first, onStep }: { p: Param; value: Num; first: boolean; onStep: (p: Param, d: 1 | -1) => void }) {
  return (
    <View style={[s.row, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{p.label}</Text>
        <Text style={s.hint}>{p.hint}</Text>
      </View>
      <Pressable onPress={() => onStep(p, -1)} style={s.btn} hitSlop={6}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <Text style={s.value}>{p.fmt(value)}</Text>
      <Pressable onPress={() => onStep(p, 1)} style={s.btn} hitSlop={6}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

function ToggleRow({ t, value, onChange }: { t: (typeof TOGGLES)[number]; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[s.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{t.label}</Text>
        <Text style={s.hint}>{t.hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.card2 }} thumbColor="#fff" />
    </View>
  );
}

function Result({ r }: { r: RuleResult }) {
  const spxT = r.spx[r.spx.length - 1][1] - 1;
  const spxCagr = Math.pow(1 + spxT, 1 / r.years) - 1;
  const ewT = r.ew[r.ew.length - 1][1] - 1;
  const beatsSpx = r.cagr > spxCagr;
  const beatsBoth = r.halves.first > r.halves.firstSpx && r.halves.second > r.halves.secondSpx;
  const verdict: string[] = [];
  verdict.push(beatsSpx ? `Die Regel schlägt den S&P 500 (${fmtPct(r.cagr, 1)} gegen ${fmtPct(spxCagr, 1)} pro Jahr).` : `Die Regel schlägt den S&P 500 nicht (${fmtPct(r.cagr, 1)} gegen ${fmtPct(spxCagr, 1)} pro Jahr) – einfach den Index zu kaufen wäre besser gewesen.`);
  if (beatsSpx && r.totalReturn < ewT) verdict.push(`Aber: „Alle 44 Aktien gleichgewichtet" (${fmtPct(ewT, 0)}) war noch besser – ein Teil des Erfolgs liegt am Universum aus heutigen Gewinnern.`);
  verdict.push(
    beatsSpx
      ? beatsBoth
        ? 'Robustheits-Check bestanden: Sie war in BEIDEN Zeit-Hälften besser als der Markt.'
        : 'Robustheits-Check durchgefallen: Nur in einer der beiden Zeit-Hälften besser als der Markt – das spricht für einen Zufallstreffer.'
      : '',
  );
  if (r.trades < 40) verdict.push(`Nur ${r.trades} Trades – statistisch dünn.`);
  return (
    <>
      <SectionTitle>Ergebnis</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <PctText v={r.totalReturn} digits={0} style={{ fontSize: 28, fontWeight: '800' }} />
          <Text style={s.muted}>
            {fmtDate(r.from)} – {fmtDate(r.to)} ({fmtNum(r.years, 1)} Jahre)
          </Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <Chart data={r.equity.map(([t, v]) => ({ t, v }))} height={150} baseline={1} compare={r.spx.map(([t, v]) => ({ t, v }))} />
        </View>
        <Text style={[s.muted, { marginTop: 6 }]}>Farbige Linie = deine Regel · gestrichelt = S&P 500 (Kaufen & Halten)</Text>
      </Card>

      <Card style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Stat label="pro Jahr" value={fmtPct(r.cagr, 1)} color={r.cagr >= 0 ? colors.green : colors.red} />
          <Stat label="S&P 500 pro Jahr" value={fmtPct(spxCagr, 1)} />
          <Stat label="größter Rückgang" value={fmtPct(r.maxDD, 0, false)} color={colors.red} />
          <Stat label="Sharpe (Rendite/Risiko)" value={fmtNum(r.sharpe, 2)} />
          <Stat label="Trades" value={String(r.trades)} />
          <Stat label="Trefferquote" value={fmtPct(r.winRate, 0, false)} />
          <Stat label="Ø Haltedauer" value={`${fmtNum(r.avgHoldWeeks, 1)} Wochen`} />
          <Stat label="Ø investiert" value={fmtPct(r.invested, 0, false)} />
        </View>
      </Card>

      <Card style={{ marginTop: 10 }}>
        <Text style={s.label}>Robustheits-Check (Zeit halbiert)</Text>
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <Stat label="1. Hälfte: Regel" value={fmtPct(r.halves.first, 0)} color={r.halves.first > r.halves.firstSpx ? colors.green : colors.red} />
          <Stat label="1. Hälfte: S&P" value={fmtPct(r.halves.firstSpx, 0)} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Stat label="2. Hälfte: Regel" value={fmtPct(r.halves.second, 0)} color={r.halves.second > r.halves.secondSpx ? colors.green : colors.red} />
          <Stat label="2. Hälfte: S&P" value={fmtPct(r.halves.secondSpx, 0)} />
        </View>
      </Card>

      <Card style={{ marginTop: 10, backgroundColor: colors.card2 }}>
        <Text style={s.label}>Fazit</Text>
        <Text style={[s.text, { marginTop: 6 }]}>{verdict.filter(Boolean).map((v) => `• ${v}`).join('\n')}</Text>
        <Text style={[s.muted, { marginTop: 10, lineHeight: 17 }]}>
          Vorsicht beim Herumprobieren: Wer lange genug an den Reglern dreht, findet fast immer eine Einstellung, die in der Vergangenheit glänzt – aber nur Zufall war (Überanpassung). Je mehr Bedingungen, desto misstrauischer sei. Das Universum besteht aus heutigen Großkonzernen (zu optimistisch).
        </Text>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  text: { color: colors.text, fontSize: 13, lineHeight: 20 },
  label: { color: colors.text, fontWeight: '700', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 2, lineHeight: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  btn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  value: { color: colors.accent, fontWeight: '800', fontSize: 14, minWidth: 64, textAlign: 'center' },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
