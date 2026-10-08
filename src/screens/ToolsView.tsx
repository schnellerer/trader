import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ALLOWANCE, ChurchTax, netAfterTax } from '../analysis/tax';
import { Card, Disclaimer, Screen, SectionTitle, Stat } from '../components/UI';
import { fmtMoney, fmtNum, fmtPct } from '../format';
import { colors, radius, signColor, space } from '../theme';

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (s: string) => void; suffix: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.muted}>{label}</Text>
      <View style={s.inputWrap}>
        <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={s.input} placeholderTextColor={colors.muted} />
        <Text style={s.muted}>{suffix}</Text>
      </View>
    </View>
  );
}

export default function ToolsView() {
  // Positionsrechner
  const [cap, setCap] = useState('10000');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState('100');
  const [stop, setStop] = useState('92');
  const [target, setTarget] = useState('116');
  const c = num(cap);
  const r = num(risk) / 100;
  const e = num(entry);
  const st = num(stop);
  const tg = num(target);
  const perShare = e - st;
  const valid = c > 0 && r > 0 && e > 0 && perShare > 0;
  const qty = valid ? Math.floor((c * r) / perShare) : 0;
  const cost = qty * e;
  const capped = valid && cost > c;
  const qtyUse = capped ? Math.floor(c / e) : qty;
  const maxLoss = qtyUse * perShare;
  const rr = valid && tg > e ? (tg - e) / perShare : 0;

  // Steuerrechner
  const [gain, setGain] = useState('3000');
  const [church, setChurch] = useState<ChurchTax>(0);
  const t = netAfterTax(num(gain) || 0, church);

  return (
    <Screen title="Werkzeuge">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        <SectionTitle>Positionsrechner</SectionTitle>
        <Card>
          <Text style={s.hint}>Wie viele Aktien darfst du kaufen, wenn du höchstens einen festen Anteil deines Depots riskieren willst? Das ist die wichtigste Regel gegen große Verluste.</Text>
          <Field label="Depotgröße" value={cap} onChange={setCap} suffix="€" />
          <Field label="Max. Risiko pro Trade (Profis: 0,5–2 %)" value={risk} onChange={setRisk} suffix="%" />
          <Field label="Einstiegskurs" value={entry} onChange={setEntry} suffix="€" />
          <Field label="Stop-Loss-Kurs" value={stop} onChange={setStop} suffix="€" />
          <Field label="Kursziel (optional)" value={target} onChange={setTarget} suffix="€" />
          {valid ? (
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Stat label="Stückzahl" value={String(qtyUse)} />
                <Stat label="Einsatz" value={fmtMoney(qtyUse * e)} />
                <Stat label="Maximaler Verlust" value={fmtMoney(maxLoss)} color={colors.red} />
                <Stat label="Anteil am Depot" value={fmtPct((qtyUse * e) / c, 0, false)} />
                <Stat label="Abstand zum Stop" value={fmtPct(perShare / e, 1, false)} />
                <Stat label="Chance : Risiko" value={rr > 0 ? `${fmtNum(rr, 1)} : 1` : '–'} color={rr >= 2 ? colors.green : rr > 0 ? colors.amber : undefined} />
              </View>
              {capped ? <Text style={[s.hint, { color: colors.amber }]}>Begrenzt durch dein Depot: Mehr als {fmtMoney(c)} kannst du nicht einsetzen.</Text> : null}
              {rr > 0 && rr < 1.5 ? <Text style={[s.hint, { color: colors.amber }]}>Das Verhältnis ist schwach: Du riskierst mehr, als du gewinnen kannst. Profis suchen mindestens 2 : 1.</Text> : null}
              {qtyUse * e > 0.3 * c ? <Text style={[s.hint, { color: colors.amber }]}>Mehr als 30 % des Depots in einer Aktie – das ist eine Klumpenposition.</Text> : null}
            </View>
          ) : (
            <Text style={[s.hint, { color: colors.red }]}>Der Stop-Kurs muss unter dem Einstiegskurs liegen.</Text>
          )}
        </Card>

        <SectionTitle>Steuerrechner (Deutschland)</SectionTitle>
        <Card>
          <Text style={s.hint}>Was bleibt von einem Kursgewinn nach Abgeltungsteuer übrig? Vereinfacht, keine Steuerberatung.</Text>
          <Field label="Gewinn im Jahr" value={gain} onChange={setGain} suffix="€" />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {([0, 0.08, 0.09] as ChurchTax[]).map((k) => (
              <Pressable key={k} onPress={() => setChurch(k)} style={[s.chip, church === k && { backgroundColor: colors.accentBg, borderColor: colors.accent }]}>
                <Text style={[s.chipText, church === k && { color: colors.accent }]}>{k === 0 ? 'keine Kirchensteuer' : `Kirchensteuer ${k * 100} %`}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap' }}>
            <Stat label="Sparerpauschbetrag" value={fmtMoney(Math.min(ALLOWANCE, Math.max(0, t.gain)))} />
            <Stat label="Steuerpflichtig" value={fmtMoney(t.taxable)} />
            <Stat label={`Steuer (${fmtNum(t.rate * 100, 2)} %)`} value={fmtMoney(t.tax)} color={colors.red} />
            <Stat label="Netto" value={fmtMoney(t.net)} color={signColor(t.net)} />
          </View>
        </Card>
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: radius.m, paddingHorizontal: 14, marginTop: 4 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
});
