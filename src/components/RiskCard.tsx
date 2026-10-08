import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { applyRisk } from '../bots/settingsApi';
import { BotKey, clampRisk, DEFAULT_RISK, describeRisk } from '../bots/risk';
import { RISK_PAGE } from '../config';
import { colors, space } from '../theme';
import { Button, Card } from './UI';

const STEP = 5;

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const cb = useRef(onChange);
  cb.current = onChange;
  const pan = useMemo(() => {
    const set = (x: number) => {
      if (wRef.current <= 0) return;
      const v = clampRisk(Math.round(((x / wRef.current) * 100) / STEP) * STEP);
      cb.current(v);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
    });
  }, []);
  const c = value <= 35 ? colors.green : value <= 65 ? colors.text : colors.red;
  return (
    <View
      style={{ height: 40, justifyContent: 'center' }}
      onLayout={(e) => {
        wRef.current = e.nativeEvent.layout.width;
        setW(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
    >
      <View style={s.track} pointerEvents="none">
        <View style={[s.fill, { width: `${value}%`, backgroundColor: c }]} />
      </View>
      <View pointerEvents="none" style={[s.mark, { left: w * 0.5 - 1 }]} />
      <View pointerEvents="none" style={[s.thumb, { left: Math.max(0, (w * value) / 100 - 13), borderColor: c }]} />
    </View>
  );
}

/** Risiko-Regler für einen Bot (0–100 %, 50 = Standard) */
export default function RiskCard({ bot, serverValue, onApplied }: { bot: BotKey; serverValue: number | undefined; onApplied: () => void }) {
  const current = serverValue ?? DEFAULT_RISK;
  const [val, setVal] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [needPage, setNeedPage] = useState(false);

  // Wenn der Server einen neuen Wert meldet, Regler nachziehen
  useEffect(() => setVal(current), [current]);

  const info = describeRisk(bot, val);
  const dirty = val !== current;
  const c = val <= 35 ? colors.green : val <= 65 ? colors.text : colors.red;

  const apply = async () => {
    setBusy(true);
    setMsg(null);
    setNeedPage(false);
    const r = await applyRisk({ [bot]: val });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: 'Gesendet. Der Server übernimmt den Wert in ca. 1–2 Minuten, danach gilt er für neue Käufe.' });
      setTimeout(onApplied, 90_000);
    } else {
      setMsg({ ok: false, text: r.message });
      if (r.reason === 'no-token') setNeedPage(true);
    }
  };

  return (
    <Card style={{ marginTop: space.l }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={s.title}>Risiko-Regler</Text>
        <Text style={[s.value, { color: c }]}>{val} %</Text>
      </View>
      <Text style={[s.sub, { color: c }]}>{info.title}</Text>

      <Slider value={val} onChange={setVal} />
      <View style={s.scale}>
        <Text style={s.muted}>0 % vorsichtig</Text>
        <Text style={s.muted}>50 % Standard</Text>
        <Text style={s.muted}>100 % aggressiv</Text>
      </View>

      <View style={s.btnRow}>
        <Pressable onPress={() => setVal((v) => clampRisk(v - STEP))} style={s.step} hitSlop={6}>
          <Ionicons name="remove" size={20} color={colors.text} />
        </Pressable>
        {[0, 25, 50, 75, 100].map((q) => (
          <Pressable key={q} onPress={() => setVal(q)} style={[s.chip, val === q && s.chipActive]}>
            <Text style={[s.chipText, val === q && { color: colors.onAccent }]}>{q}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setVal((v) => clampRisk(v + STEP))} style={s.step} hitSlop={6}>
          <Ionicons name="add" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ marginTop: 12 }}>
        {info.lines.map((l, i) => (
          <Text key={i} style={s.line}>
            • {l}
          </Text>
        ))}
      </View>
      <Text style={[s.muted, { marginTop: 8, lineHeight: 16 }]}>
        Auf dem Server aktuell: {current} %. Der Regler wirkt auf neue Käufe, bereits offene Positionen laufen weiter.{val >= 90 ? ' Bei fast 100 % schwankt das Depot stark – größere Gewinne UND größere Verluste sind möglich.' : ''}
      </Text>

      <Button label={busy ? 'Wird gesendet …' : dirty ? `${val} % auf dem Server übernehmen` : 'Keine Änderung'} icon="cloud-upload" onPress={apply} disabled={busy || !dirty} />
      {msg ? <Text style={[s.msg, { color: msg.ok ? colors.green : colors.amber }]}>{msg.text}</Text> : null}
      {needPage ? (
        <View>
          <Text style={[s.muted, { marginTop: 8, lineHeight: 17 }]}>
            Ohne GitHub-Schlüssel (siehe Mehr → Einstellungen) geht es auch von Hand: Seite öffnen, „Run workflow" antippen und bei „{bot === 'day' ? 'Day-Trading' : bot === 'long' ? 'Langzeit' : 'Gold'}-Bot Risiko" den Wert {val} eintragen.
          </Text>
          <Button label="GitHub-Seite öffnen" icon="open-outline" kind="ghost" onPress={() => Linking.openURL(RISK_PAGE)} />
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  value: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 13, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.card2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  mark: { position: 'absolute', top: 10, width: 2, height: 20, backgroundColor: colors.border },
  thumb: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bg, borderWidth: 3, top: 7 },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: colors.muted, fontSize: 11 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  step: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  chip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  line: { color: colors.text, fontSize: 13, lineHeight: 20 },
  msg: { fontSize: 12, marginTop: 8, lineHeight: 17 },
});
