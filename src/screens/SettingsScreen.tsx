import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchBots } from '../bots/remote';
import { clearToken, getToken, setToken } from '../bots/settingsApi';
import { Button, Card, Disclaimer, Screen, SectionTitle } from '../components/UI';
import { RESET_PAGE, TOKEN_PAGE } from '../config';
import { fmtDateTime, fmtMoney } from '../format';
import { useAsync } from '../hooks';
import { setState } from '../store';
import { colors, space } from '../theme';

export default function SettingsScreen() {
  const bots = useAsync(fetchBots, []);
  const [token, setTok] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState('');
  useEffect(() => {
    getToken().then((t) => setHasToken(!!t));
  }, []);

  return (
    <Screen title="Einstellungen">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 50 }}>
        <SectionTitle>Virtuelles Startkapital</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Spielgeld für beide Bots (jeder Bot startet mit diesem Betrag).{'\n'}
            Aktuell: {bots.data ? fmtMoney(bots.data.startCapital) : bots.loading ? 'wird geladen …' : 'noch nicht gestartet (Standard 10.000,00 €)'}
            {bots.data ? `\nBots laufen seit: ${fmtDateTime(bots.data.day.createdAt)}` : ''}
          </Text>
          <Text style={[s.muted, { marginTop: 12, lineHeight: 19 }]}>
            Weil die Bots auf dem Server laufen, änderst du das Startkapital dort:{'\n'}
            1. Knopf unten drücken (GitHub öffnet sich, ggf. anmelden){'\n'}
            2. „Run workflow" antippen{'\n'}
            3. Neues Startkapital eintragen und „Run workflow" bestätigen{'\n'}
            Achtung: Alle bisherigen Trades und Verläufe beider Bots werden dabei gelöscht.
          </Text>
          <Button label="Startkapital auf GitHub ändern" icon="open-outline" onPress={() => Linking.openURL(RESET_PAGE)} />
        </Card>

        <SectionTitle>Risiko-Regler freischalten (optional)</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Mit den Reglern im Bots-Tab bestimmst du, wie vorsichtig oder aggressiv jeder Bot handelt. Damit die App den Wert an den Server schicken kann, braucht sie einen persönlichen GitHub-Schlüssel (Token). Er bleibt nur auf diesem Handy.{'\n\n'}
            So erstellst du ihn (einmalig, kostenlos):{'\n'}
            1. Knopf unten öffnen und anmelden{'\n'}
            2. „Token name": z. B. trader-app, „Expiration": 1 Jahr{'\n'}
            3. „Repository access" → „Only select repositories" → trader{'\n'}
            4. „Permissions" → „Repository permissions" → „Actions": Read and write{'\n'}
            5. „Generate token", den Schlüssel kopieren und unten einfügen{'\n\n'}
            Ohne Schlüssel geht es trotzdem: Die App öffnet dann die GitHub-Seite, und du trägst den Wert dort ein.
          </Text>
          <Button label="GitHub-Schlüssel erstellen" icon="open-outline" kind="ghost" onPress={() => Linking.openURL(TOKEN_PAGE)} />
          <TextInput
            value={token}
            onChangeText={setTok}
            placeholder={hasToken ? '•••••••• (gespeichert)' : 'Schlüssel hier einfügen (github_pat_…)'}
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Speichern"
                icon="save"
                disabled={token.trim().length < 20}
                onPress={async () => {
                  await setToken(token);
                  setTok('');
                  setHasToken(true);
                  setTokenMsg('Gespeichert – nur auf diesem Handy.');
                }}
              />
            </View>
            {hasToken ? (
              <View style={{ flex: 1 }}>
                <Button
                  label="Entfernen"
                  kind="danger"
                  onPress={async () => {
                    await clearToken();
                    setHasToken(false);
                    setTokenMsg('Schlüssel gelöscht.');
                  }}
                />
              </View>
            ) : null}
          </View>
          {tokenMsg ? <Text style={[s.muted, { marginTop: 8, color: colors.green }]}>{tokenMsg}</Text> : null}
        </Card>

        <SectionTitle>Daten</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Kurse: Yahoo Finance (inoffiziell, kostenlos, teils 15 Min. verzögert){'\n'}
            News: Google News, Yahoo Finance, Tagesschau, Handelsblatt (RSS){'\n'}
            Alles läuft kostenlos und ohne Konto. Watchlist und Suchverlauf werden nur lokal auf deinem Handy gespeichert.
          </Text>
          <Button label="Watchlist & Suchverlauf löschen" kind="ghost" onPress={() => setState(() => ({ watchlist: [], recent: [] }))} />
        </Card>

        <SectionTitle>Wichtig zu den Bots</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Die Bots laufen auf einem kostenlosen GitHub-Server, auch wenn die App geschlossen und der PC aus ist. Day-Trading-Bot und Gold-Bot: etwa alle 5 Minuten (Mo–Fr), dabei werden alle 1-Minuten- bzw. 5-Minuten-Kerzen seit dem letzten Lauf ausgewertet. GitHub startet geplante Läufe manchmal mit Verspätung, schneller als alle 5 Minuten geht es nicht. Langzeit-Bot: zweimal täglich.{'\n\n'}
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
  input: { backgroundColor: colors.card2, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 12, marginBottom: 4 },
});
