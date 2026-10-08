import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { analyzeCoach, weekSummary } from '../analysis/coach';
import { LuckCard, StressCard, TaxCard } from '../components/InsightCards';
import { PctText } from '../components/Rows';
import { Card, SectionTitle } from '../components/UI';
import { fmtMoney } from '../format';
import { BotState } from '../types';
import { colors, signColor, space } from '../theme';

export default function CoachView({ me }: { me: BotState }) {
  const rep = useMemo(() => analyzeCoach(me), [me]);
  const week = useMemo(() => weekSummary(me), [me]);
  const icon = { good: 'checkmark-circle', warn: 'alert-circle', bad: 'close-circle', info: 'information-circle' } as const;
  const color = { good: colors.green, warn: colors.amber, bad: colors.red, info: colors.muted } as const;
  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <Text style={s.muted}>Dein Zeugnis</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons key={i} name={i <= rep.stars ? 'star' : 'star-outline'} size={22} color={i <= rep.stars ? colors.amber : colors.border} />
            ))}
          </View>
          <Text style={s.title}>{rep.label}</Text>
        </View>
        <Text style={[s.muted, { marginTop: 8, lineHeight: 18 }]}>
          Der Coach prüft deine abgeschlossenen Trades auf typische Anfängerfehler. Jede Aussage ist nachrechenbar – keine KI-Vermutung.
        </Text>
      </Card>

      <SectionTitle>Letzte 7 Tage</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={[s.big, { color: signColor(week.change) }]}>
            {week.change >= 0 ? '+' : ''}{fmtMoney(week.change)}
          </Text>
          <PctText v={week.pct} />
        </View>
        <Text style={[s.muted, { marginTop: 6, lineHeight: 18 }]}>
          {week.trades} Trades, davon {week.closed} abgeschlossen.
          {week.best ? `\nBester: ${week.best.symbol} ${week.best.pnl! >= 0 ? '+' : ''}${fmtMoney(week.best.pnl!)}` : ''}
          {week.worst && week.worst.id !== week.best?.id ? `\nSchlechtester: ${week.worst.symbol} ${week.worst.pnl! >= 0 ? '+' : ''}${fmtMoney(week.worst.pnl!)}` : ''}
        </Text>
      </Card>

      <SectionTitle>Was dir auffällt</SectionTitle>
      {rep.findings.length === 0 ? (
        <Card>
          <Text style={s.muted}>Keine Auffälligkeiten – handle weiter, damit der Coach mehr Daten hat.</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {rep.findings.map((f, i) => (
            <Card key={i} style={{ borderLeftWidth: 3, borderLeftColor: color[f.level] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={icon[f.level]} size={18} color={color[f.level]} />
                <Text style={s.fTitle}>{f.title}</Text>
              </View>
              <Text style={[s.fText]}>{f.text}</Text>
            </Card>
          ))}
        </View>
      )}

      <LuckCard bot={me} />
      <StressCard bot={me} />
      <TaxCard bot={me} />
    </>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted, fontSize: 12 },
  big: { fontSize: 24, fontWeight: '800' },
  fTitle: { color: colors.text, fontWeight: '700', fontSize: 14, flex: 1 },
  fText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
