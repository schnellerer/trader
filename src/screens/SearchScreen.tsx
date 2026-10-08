import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { searchSymbols } from '../api/yahoo';
import { Card, Screen } from '../components/UI';
import { addRecent, useStore } from '../store';
import { SearchHit } from '../types';
import { colors, radius, space } from '../theme';

export default function SearchScreen() {
  const nav = useNavigation<any>();
  const recent = useStore((s) => s.recent);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setErr('');
      return;
    }
    setLoading(true);
    const h = setTimeout(() => {
      searchSymbols(term)
        .then((r) => {
          setHits(r);
          setErr(r.length ? '' : 'Nichts gefunden. Versuche Namen, Ticker (z. B. AAPL) oder ISIN (z. B. US0378331005).');
        })
        .catch((e) => setErr(e.message))
        .finally(() => setLoading(false));
    }, 450);
    return () => clearTimeout(h);
  }, [q]);

  const open = (symbol: string) => {
    addRecent(symbol);
    nav.navigate('Detail', { symbol });
  };

  return (
    <Screen title="Suche" subtitle="Name, Ticker oder ISIN eingeben">
      <View style={s.inputWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="z. B. Apple, SAP oder US0378331005"
          placeholderTextColor={colors.muted}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator color={colors.accent} size="small" /> : q ? <Ionicons name="close-circle" size={18} color={colors.muted} onPress={() => setQ('')} /> : null}
      </View>

      <FlatList
        data={hits}
        keyExtractor={(x) => x.symbol}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}
        ListEmptyComponent={
          err ? (
            <Text style={s.hint}>{err}</Text>
          ) : q.trim().length < 2 && recent.length ? (
            <View>
              <Text style={s.hdr}>Zuletzt angesehen</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recent.map((r) => (
                  <Pressable key={r} onPress={() => open(r)} style={s.chip}>
                    <Text style={s.chipText}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : q.trim().length < 2 ? (
            <Card>
              <Text style={s.hint}>
                Gib den Namen oder die ISIN einer Aktie ein. Du bekommst Kurs, Chart, Bullisch/Bärisch-Einschätzung, Szenarien für 15 Tage, 30 Tage und 1, 3, 5 und 10 Jahre sowie aktuelle News.
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item.symbol)} style={s.item}>
            <View style={{ flex: 1 }}>
              <Text style={s.sym}>{item.symbol}</Text>
              <Text style={s.name} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={s.exch}>{item.exchange}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.m, borderWidth: 1, borderColor: colors.border, marginHorizontal: space.l, marginBottom: space.m, paddingHorizontal: 14 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 13 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  hdr: { color: colors.text, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: colors.text, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sym: { color: colors.text, fontWeight: '700', fontSize: 15 },
  name: { color: colors.muted, fontSize: 13, marginTop: 2 },
  exch: { color: colors.muted, fontSize: 11 },
});
