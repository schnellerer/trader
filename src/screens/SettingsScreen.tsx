import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Disclaimer, Screen, SectionTitle } from '../components/UI';
import { fmtMoney } from '../format';
import { resetBots, setState, useStore } from '../store';
import { colors, radius, space } from '../theme';

export default function SettingsScreen() {
  const capital = useStore((s) => s.startCapital);
  const [val, setVal] = useState(String(capital));

  const parsed = Number(val.replace(/\./g, '').replace(',', '.'));
  const valid = isFinite(parsed) && parsed >= 100 && parsed <= 100_000_000;

  const apply = () => {
    Alert.alert(
      'Startkapital ändern?',
      `Beide Bots werden mit ${fmtMoney(parsed)} neu gestartet. Alle bisherigen Trades und Verläufe werden gelöscht.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zurücksetzen', style: 'destructive', onPress: () => resetBots(parsed) },
      ],
    );
  };

  return (
    <Screen title="Einstellungen">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        <SectionTitle>Virtuelles Startkapital</SectionTitle>
        <Card>
          <Text style={s.muted}>Spielgeld für beide Bots (jeder Bot startet mit diesem Betrag). Aktuell: {fmtMoney(capital)}</Text>
          <View style={s.inputWrap}>
            <TextInput value={val} onChangeText={setVal} keyboardType="decimal-pad" style={s.input} placeholderTextColor={colors.muted} />
            <Text style={s.eur}>€</Text>
          </View>
          <Button label="Speichern & Bots zurücksetzen" icon="refresh" onPress={apply} disabled={!valid || parsed === capital} />
          {!valid ? <Text style={[s.muted, { color: colors.red, marginTop: 8 }]}>Bitte einen Betrag zwischen 100 und 100.000.000 eingeben.</Text> : null}
        </Card>

        <SectionTitle>Daten</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Kurse: Yahoo Finance (inoffiziell, kostenlos, teils 15 Min. verzögert){'\n'}
            News: Google News, Yahoo Finance, Tagesschau, Handelsblatt (RSS){'\n'}
            Alles läuft kostenlos und ohne Konto. Gespeichert wird nur lokal auf deinem Handy.
          </Text>
          <Button
            label="Watchlist & Verlauf der Suche löschen"
            kind="ghost"
            onPress={() => setState(() => ({ watchlist: [], recent: [] }))}
          />
        </Card>

        <SectionTitle>Wichtig zu den Bots</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Die Bots handeln nur, solange die App geöffnet ist (Day-Trading-Bot alle 5 Minuten, Langzeit-Bot stündlich), und nur auf dem „Bots"-Tab. Ein rund um die Uhr laufender Bot braucht einen Server – das ist als nächster Ausbau möglich (kostenlos über GitHub Actions).{'\n\n'}
            Gebühren von 0,05 % pro Order werden simuliert. Kurse in US-Dollar werden zum aktuellen Wechselkurs in Euro umgerechnet.
          </Text>
        </Card>
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card2, borderRadius: radius.s + 2, paddingHorizontal: 14, marginTop: 12 },
  input: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700', paddingVertical: 12 },
  eur: { color: colors.muted, fontSize: 18, fontWeight: '700' },
});
