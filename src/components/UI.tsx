import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Bias } from '../types';
import { biasLabel } from '../analysis/model';
import { colors, radius, space } from '../theme';

/** Wenn true, zeichnet Screen nur den Inhalt (ohne Titelzeile) – für Bildschirme, die in einem anderen Tab eingebettet sind */
export const EmbeddedCtx = React.createContext(false);

export function Screen({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const embedded = React.useContext(EmbeddedCtx);
  if (embedded) return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>;

export const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <View style={s.sectionRow}>
    <Text style={s.section}>{children}</Text>
    {right}
  </View>
);

export function BiasBadge({ bias, small }: { bias: Bias; small?: boolean }) {
  const c = bias === 'bullish' ? colors.green : bias === 'bearish' ? colors.red : colors.amber;
  const bg = bias === 'bullish' ? colors.greenBg : bias === 'bearish' ? colors.redBg : colors.amberBg;
  const icon = bias === 'bullish' ? 'trending-up' : bias === 'bearish' ? 'trending-down' : 'remove';
  return (
    <View style={[s.badge, { backgroundColor: bg }, small && { paddingVertical: 2, paddingHorizontal: 8 }]}>
      <Ionicons name={icon as any} size={small ? 12 : 14} color={c} />
      <Text style={[s.badgeText, { color: c }, small && { fontSize: 11 }]}>{biasLabel(bias)}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segItem, value === o.key && s.segActive]}>
          <Text style={[s.segText, value === o.key && { color: colors.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={{ flex: 1, minWidth: '45%', paddingVertical: 6 }}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
  </View>
);

export const Loading = ({ text }: { text?: string }) => (
  <View style={s.center}>
    <ActivityIndicator color={colors.accent} />
    {text ? <Text style={[s.muted, { marginTop: 10 }]}>{text}</Text> : null}
  </View>
);

export const ErrorBox = ({ text, onRetry }: { text: string; onRetry?: () => void }) => (
  <View style={s.center}>
    <Ionicons name="cloud-offline-outline" size={32} color={colors.muted} />
    <Text style={[s.muted, { marginTop: 8, textAlign: 'center' }]}>{text}</Text>
    {onRetry ? (
      <Pressable onPress={onRetry} style={s.btn}>
        <Text style={s.btnText}>Erneut versuchen</Text>
      </Pressable>
    ) : null}
  </View>
);

export const Button = ({ label, onPress, icon, kind = 'primary', disabled }: { label: string; onPress: () => void; icon?: string; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[s.btn, kind === 'ghost' && { backgroundColor: colors.card2 }, kind === 'danger' && { backgroundColor: colors.redBg }, disabled && { opacity: 0.5 }]}
  >
    {icon ? <Ionicons name={icon as any} size={16} color={kind === 'danger' ? colors.red : kind === 'ghost' ? colors.text : colors.onAccent} style={{ marginRight: 6 }} /> : null}
    <Text style={[s.btnText, kind === 'danger' && { color: colors.red }, kind === 'ghost' && { color: colors.text }]}>{label}</Text>
  </Pressable>
);

export const Disclaimer = () => (
  <Text style={s.disclaimer}>
    Keine Anlageberatung. Szenarien und Rankings sind statistische Modellrechnungen auf Basis vergangener Daten – keine Garantie und keine Prognose. Alle Trades der Bots sind reines Papertrading mit Spielgeld.
  </Text>
);

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, paddingBottom: space.m },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: radius.m, padding: space.l, borderWidth: 1, borderColor: colors.border },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.s },
  section: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.s + 2, padding: 3, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.s },
  segActive: { backgroundColor: colors.card2 },
  segText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { color: colors.muted, fontSize: 14 },
  btn: { flexDirection: 'row', backgroundColor: colors.accent, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.s + 2, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  btnText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: space.xl, marginBottom: space.xl },
});
