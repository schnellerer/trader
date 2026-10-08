import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getChart } from '../api/yahoo';
import { fmtDateTime } from '../format';
import { Trade } from '../types';
import { colors } from '../theme';
import Chart, { Pt } from './Chart';

/** Zeigt einen Trade im Kursverlauf: blauer Punkt = Einstieg, grün/roter Punkt = Ausstieg */
export default function TradeReplay({ t }: { t: Trade }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [data, setData] = useState<Pt[]>([]);
  const [marks, setMarks] = useState<{ t: number; color: string }[]>([]);
  const [msg, setMsg] = useState('');

  const closing = t.pnl != null;
  const exitT = closing ? t.t : null;
  const entryT = closing ? (t.heldMs != null ? t.t - t.heldMs : null) : t.t;

  const load = async () => {
    setState('loading');
    try {
      const start = entryT ?? t.t;
      const ageDays = (Date.now() - start) / 86400_000;
      const [range, interval] = ageDays <= 4 ? ['5d', '15m'] : ageDays <= 50 ? ['60d', '15m'] : ['2y', '1d'];
      const d = await getChart(t.symbol, range, interval, 60_000);
      const end = exitT ?? Date.now();
      const span = Math.max(end - start, interval === '1d' ? 5 * 86400_000 : 3 * 3600_000);
      const from = start - span * 0.6;
      const to = end + span * 0.6;
      const pts = d.candles.filter((c) => c.t >= from && c.t <= to).map((c) => ({ t: c.t, v: c.c }));
      if (pts.length < 3) throw new Error('Für diesen Zeitraum liegen keine Kursdaten mehr vor (Yahoo speichert 15-Minuten-Kurse nur ca. 60 Tage).');
      setData(pts);
      const m: { t: number; color: string }[] = [];
      if (entryT != null) m.push({ t: entryT, color: colors.accent });
      if (exitT != null) m.push({ t: exitT, color: (t.pnl ?? 0) >= 0 ? colors.green : colors.red });
      setMarks(m);
      setState('done');
    } catch (e: any) {
      setMsg(e?.message ?? 'Chart nicht verfügbar');
      setState('error');
    }
  };

  if (state === 'idle')
    return (
      <Pressable onPress={load} style={s.btn}>
        <Ionicons name="analytics-outline" size={16} color={colors.accent} />
        <Text style={s.btnText}>Trade im Chart ansehen</Text>
      </Pressable>
    );
  if (state === 'loading') return <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />;
  if (state === 'error') return <Text style={[s.legend, { color: colors.red }]}>{msg}</Text>;
  return (
    <View style={{ marginTop: 12 }}>
      <Chart data={data} height={130} marks={marks} color={colors.muted} />
      <Text style={s.legend}>
        <Text style={{ color: colors.accent }}>● </Text>
        Einstieg{entryT ? ` ${fmtDateTime(entryT)}` : ' (Zeitpunkt unbekannt)'}
        {exitT ? (
          <Text>
            {'   '}
            <Text style={{ color: (t.pnl ?? 0) >= 0 ? colors.green : colors.red }}>● </Text>Ausstieg {fmtDateTime(exitT)}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  btnText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  legend: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 16 },
});
