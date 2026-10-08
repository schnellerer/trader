import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { marketRegime } from '../analysis/regime';
import { useAsync } from '../hooks';
import { colors } from '../theme';
import { Card } from './UI';

/** Marktampel: Grün / Gelb / Rot für den Gesamtmarkt, mit kurzer Erklärung zum Aufklappen */
export default function MarketLight() {
  const reg = useAsync(marketRegime, []);
  const [open, setOpen] = useState(false);
  if (reg.loading && !reg.data) return null;
  if (!reg.data) return null;
  const r = reg.data;
  const c = r.state === 'green' ? colors.green : r.state === 'red' ? colors.red : colors.amber;
  const bg = r.state === 'green' ? colors.greenBg : r.state === 'red' ? colors.redBg : colors.amberBg;
  const label = r.state === 'green' ? 'Gute Bedingungen' : r.state === 'red' ? 'Vorsicht' : 'Gemischt';
  return (
    <Pressable onPress={() => setOpen(!open)}>
      <Card style={{ marginTop: 4, borderColor: c }}>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: bg }]}>
            <View style={[s.dotInner, { backgroundColor: c }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{r.title}</Text>
            <Text style={[s.sub, { color: c }]}>
              {label} · S&P 500 {r.spx > r.sma200 ? 'über' : 'unter'} 200-Tage-Linie · VIX {r.vix.toFixed(1).replace('.', ',')}
            </Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
        </View>
        {open ? <Text style={s.text}>{r.text}</Text> : null}
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 16, height: 16, borderRadius: 8 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
  text: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
});
