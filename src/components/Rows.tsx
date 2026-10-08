import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NewsItem } from '../types';
import { colors, signColor, space } from '../theme';
import { timeAgo } from '../format';

export function NewsRow({ n }: { n: NewsItem }) {
  const c = n.sentiment > 0 ? colors.green : n.sentiment < 0 ? colors.red : colors.muted;
  return (
    <Pressable onPress={() => Linking.openURL(n.link).catch(() => {})} style={s.news}>
      <View style={[s.dot, { backgroundColor: c }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.newsTitle} numberOfLines={3}>
          {n.title}
        </Text>
        <Text style={s.newsMeta}>
          {n.official ? '✔ ' : ''}
          {n.source} · {timeAgo(n.t)}
          {n.sentiment > 0 ? ' · positiv' : n.sentiment < 0 ? ' · negativ' : ''}
          {n.lang ? ` · ${n.lang === 'de' ? 'DE' : 'EN'}` : ''}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.muted} />
    </Pressable>
  );
}

export function PctText({ v, style, digits = 2 }: { v: number; style?: any; digits?: number }) {
  return (
    <Text style={[{ color: signColor(v), fontWeight: '600' }, style]}>
      {isFinite(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits).replace('.', ',')} %` : '–'}
    </Text>
  );
}

const s = StyleSheet.create({
  news: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  newsTitle: { color: colors.text, fontSize: 14, lineHeight: 19 },
  newsMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
