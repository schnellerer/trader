import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { luckTest } from '../analysis/luck';
import { ALLOWANCE, ChurchTax, netAfterTax } from '../analysis/tax';
import { betas, CRASHES, stressLoss } from '../analysis/stress';
import { fmtMoney, fmtNum, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { BotState } from '../types';
import { colors, signColor } from '../theme';
import { Card, Loading, SectionTitle } from './UI';

/** „Glück oder Können?" – Zufallstest der bisherigen Ergebnisse */
export function LuckCard({ bot }: { bot: BotState }) {
  const r = luckTest(bot);
  const c = r.level === 'good' ? colors.green : r.level === 'warn' ? colors.amber : colors.muted;
  return (
    <>
      <SectionTitle>Glück oder Können?</SectionTitle>
      <Card>
        <View style={s.row}>
          <Ionicons name={r.level === 'good' ? 'ribbon' : 'dice'} size={22} color={c} />
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: r.enough ? c : colors.text }]}>{r.verdict}</Text>
            {r.enough ? <Text style={s.muted}>Zufalls-Wahrscheinlichkeit: {(r.pLuck * 100).toFixed(0)} %</Text> : null}
          </View>
        </View>
        <Text style={[s.muted, { marginTop: 10, lineHeight: 18 }]}>{r.note}</Text>
      </Card>
    </>
  );
}

/** Crash-Test: Wie viel würde das Depot in historischen Börsenabstürzen verlieren? (Beta-Schätzung) */
export function StressCard({ bot }: { bot: BotState }) {
  const symbols = bot.positions.map((p) => p.symbol);
  const key = symbols.slice().sort().join(',');
  const b = useAsync(() => (symbols.length ? betas(symbols) : Promise.resolve({} as Record<string, number>)), [key]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <SectionTitle>Crash-Test</SectionTitle>
      <Card>
        {!symbols.length ? (
          <Text style={s.muted}>Ohne offene Positionen gibt es nichts zu testen.</Text>
        ) : b.loading && !b.data ? (
          <Loading text="Beta der Positionen wird berechnet …" />
        ) : b.data ? (
          <>
            {(() => {
              const first = stressLoss(bot, b.data!, -0.1);
              return (
                <Text style={[s.muted, { marginBottom: 8 }]}>
                  Depot-Beta {fmtNum(first.portfolioBeta, 2)}: Fällt der S&P 500 um 10 %, fällt dein Depot ungefähr um {fmtPct(Math.abs(first.pct), 1, false)}.
                </Text>
              );
            })()}
            {CRASHES.map((c, i) => {
              const r = stressLoss(bot, b.data!, c.spx);
              return (
                <View key={c.key} style={[s.crashRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.crashName}>{c.name}</Text>
                    <Text style={s.muted}>S&P 500 {fmtPct(c.spx, 0)} · {c.info}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: signColor(r.loss), fontWeight: '800' }}>{fmtMoney(r.loss, '€', 0)}</Text>
                    <Text style={{ color: signColor(r.pct), fontSize: 12 }}>{fmtPct(r.pct, 1)}</Text>
                  </View>
                </View>
              );
            })}
            <Pressable onPress={() => setOpen(!open)} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{open ? 'Weniger' : 'So wird gerechnet'}</Text>
            </Pressable>
            {open ? (
              <Text style={[s.muted, { marginTop: 6, lineHeight: 18 }]}>
                Jede Position hat ein Beta (aus 2 Jahren Kursen im Vergleich zum S&P 500). Verlust ≈ Positionswert × Beta × Marktrückgang. Das ist eine Schätzung: In echten Crashs steigen die Gleichläufe, der Verlust wäre eher größer. Short-Positionen gewinnen in der Rechnung.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={s.muted}>Beta konnte nicht berechnet werden.</Text>
        )}
      </Card>
    </>
  );
}

/** Netto nach deutscher Abgeltungsteuer (vereinfacht) für die realisierten Gewinne dieses Jahres */
export function TaxCard({ bot }: { bot: BotState }) {
  const [church, setChurch] = useState<ChurchTax>(0);
  const year = new Date().getFullYear();
  const gain = bot.trades.filter((t) => t.pnl != null && new Date(t.t).getFullYear() === year).reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const r = netAfterTax(gain, church);
  return (
    <>
      <SectionTitle>Nach Steuern (Deutschland)</SectionTitle>
      <Card>
        <View style={s.taxRow}>
          <Text style={s.muted}>Realisierter Gewinn {year}</Text>
          <Text style={{ color: signColor(gain), fontWeight: '700' }}>{fmtMoney(gain)}</Text>
        </View>
        <View style={s.taxRow}>
          <Text style={s.muted}>abzgl. Sparerpauschbetrag</Text>
          <Text style={s.val}>{fmtMoney(Math.min(ALLOWANCE, Math.max(0, gain)))}</Text>
        </View>
        <View style={s.taxRow}>
          <Text style={s.muted}>Steuer ({fmtNum(r.rate * 100, 2)} %)</Text>
          <Text style={[s.val, { color: colors.red }]}>−{fmtMoney(r.tax)}</Text>
        </View>
        <View style={[s.taxRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
          <Text style={s.title}>Netto</Text>
          <Text style={{ color: signColor(r.net), fontWeight: '800', fontSize: 16 }}>{fmtMoney(r.net)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {([0, 0.08, 0.09] as ChurchTax[]).map((k) => (
            <Pressable key={k} onPress={() => setChurch(k)} style={[s.chip, church === k && { backgroundColor: colors.accentBg, borderColor: colors.accent }]}>
              <Text style={[s.chipText, church === k && { color: colors.accent }]}>{k === 0 ? 'ohne Kirchensteuer' : `Kirchensteuer ${k * 100} %`}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[s.muted, { marginTop: 10, lineHeight: 17 }]}>
          Vereinfacht: 25 % Abgeltungsteuer + 5,5 % Soli, 1.000 € Sparerpauschbetrag. Verlustverrechnung mit anderen Konten, Teilfreistellungen und Vorabpauschale sind nicht berücksichtigt – keine Steuerberatung. Bei Spielgeld fallen natürlich keine echten Steuern an, die Rechnung zeigt, was von einem echten Gewinn übrig bliebe.
        </Text>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted, fontSize: 12 },
  val: { color: colors.text, fontWeight: '600' },
  crashRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  crashName: { color: colors.text, fontWeight: '600', fontSize: 14 },
  taxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
});
