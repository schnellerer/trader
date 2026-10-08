import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { applyRisk } from '../bots/settingsApi';
import { BotKey, clampRisk, DEFAULT_RISK, describeRisk } from '../bots/risk';
import { RISK_PAGE } from '../config';
import { colors, space } from '../theme';
import { Card } from './UI';

const STEP = 5;

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const cb = useRef(onChange);
  cb.current = onChange;
  const pan = useMemo(() => {
    const set = (x: number) => {
      if (wRef.current <= 0) return;
      cb.current(clampRisk(Math.round(((x / wRef.current) * 100) / STEP) * STEP));
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
      style={{ height: 30, justifyContent: 'center' }}
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
      <View pointerEvents="none" style={[s.thumb, { left: Math.max(0, Math.min(w - 20, (w * value) / 100 - 10)), borderColor: c }]} />
    </View>
  );
}

/** Kompakter Risiko-Regler für einen Bot (0–100 %, 50 = Standard) – eingeklappt nur eine Zeile */
export default function RiskCard({ bot, serverValue, onApplied }: { bot: BotKey; serverValue: number | undefined; onApplied: () => void }) {
  const current = serverValue ?? DEFAULT_RISK;
  const [open, setOpen] = useState(false);
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
      setMsg({ ok: true, text: 'Gesendet – gilt in ca. 1–2 Minuten für neue Käufe.' });
      setTimeout(onApplied, 90_000);
    } else {
      setMsg({ ok: false, text: r.message });
      if (r.reason === 'no-token') setNeedPage(true);
    }
  };

  return (
    <Card style={{ marginTop: space.xl, padding: 12 }}>
      <Pressable onPress={() => setOpen(!open)} style={s.head}>
        <Ionicons name="options" size={16} color={colors.muted} />
        <Text style={s.title}>Risiko-Regler</Text>
        <Text style={[s.valueSmall, { color: c }]}>
          {current} % · {describeRisk(bot, current).title}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>

      {open ? (
        <View style={{ marginTop: 10 }}>
          <View style={s.valRow}>
            <Text style={[s.value, { color: c }]}>{val} %</Text>
            <Text style={[s.sub, { color: c }]}>{info.title}</Text>
          </View>

          <Slider value={val} onChange={setVal} />
          <View style={s.scale}>
            <Text style={s.muted}>0 vorsichtig</Text>
            <Text style={s.muted}>50 Standard</Text>
            <Text style={s.muted}>100 aggressiv</Text>
          </View>

          <View style={s.btnRow}>
            <Pressable onPress={() => setVal((v) => clampRisk(v - STEP))} style={s.step} hitSlop={6}>
              <Ionicons name="remove" size={16} color={colors.text} />
            </Pressable>
            {[0, 25, 50, 75, 100].map((q) => (
              <Pressable key={q} onPress={() => setVal(q)} style={[s.chip, val === q && s.chipActive]}>
                <Text style={[s.chipText, val === q && { color: colors.onAccent }]}>{q}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setVal((v) => clampRisk(v + STEP))} style={s.step} hitSlop={6}>
              <Ionicons name="add" size={16} color={colors.text} />
            </Pressable>
          </View>

          {info.lines.map((l, i) => (
            <Text key={i} style={s.line}>
              • {l}
            </Text>
          ))}
          <Text style={[s.muted, { marginTop: 6, lineHeight: 15 }]}>
            Wirkt auf neue Käufe.{val >= 90 ? ' Bei fast 100 % sind größere Gewinne UND Verluste möglich.' : ''}
          </Text>

          <Pressable onPress={apply} disabled={busy || !dirty} style={[s.apply, (busy || !dirty) && { opacity: 0.4 }]}>
            <Text style={s.applyText}>{busy ? 'Wird gesendet …' : dirty ? `${val} % übernehmen` : 'Keine Änderung'}</Text>
          </Pressable>
          {msg ? <Text style={[s.msg, { color: msg.ok ? colors.green : colors.amber }]}>{msg.text}</Text> : null}
          {needPage ? (
            <Pressable onPress={() => Linking.openURL(RISK_PAGE)}>
              <Text style={[s.msg, { color: colors.accent }]}>
                Ohne GitHub-Schlüssel (Mehr → Einstellungen): Seite öffnen, „Run workflow" antippen und den Wert {val} eintragen →
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '700', fontSize: 13 },
  valueSmall: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  valRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  value: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.card2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  mark: { position: 'absolute', top: 7, width: 2, height: 16, backgroundColor: colors.border },
  thumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg, borderWidth: 3, top: 5 },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: colors.muted, fontSize: 10 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, marginBottom: 6 },
  step: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  chip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 5 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  line: { color: colors.text, fontSize: 12, lineHeight: 17 },
  apply: { marginTop: 10, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  applyText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  msg: { fontSize: 11, marginTop: 8, lineHeight: 16 },
});
