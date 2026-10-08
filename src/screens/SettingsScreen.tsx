import React, { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { Linking, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { getDisabledSources, NEWS_SOURCES, setSourceEnabled } from '../api/news';
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
  const [disabled, setDisabled] = useState<string[]>([]);
  const [upd, setUpd] = useState({ busy: false, msg: '' });
  useEffect(() => {
    getToken().then((t) => setHasToken(!!t));
    getDisabledSources().then((d) => setDisabled([...d]));
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

        <SectionTitle>App-Update</SectionTitle>
        <Card>
          <Text style={s.muted}>
            Version {Updates.runtimeVersion ?? '–'}
            {Updates.isEnabled ? `\nKanal: ${Updates.channel ?? '–'}${Updates.createdAt ? `\nProgramm-Stand vom ${Updates.createdAt.toLocaleString('de-DE')}` : '\nProgramm-Stand: ursprünglicher Build'}` : '\nUpdates über die Luft sind in Expo Go und im Entwickler-Modus nicht aktiv, nur in der installierten APK.'}
          </Text>
          <Button
            label={upd.busy ? 'Suche läuft …' : 'Nach Update suchen'}
            icon="cloud-download"
            disabled={upd.busy || !Updates.isEnabled}
            onPress={async () => {
              setUpd({ busy: true, msg: '' });
              try {
                const c = await Updates.checkForUpdateAsync();
                if (!c.isAvailable) return setUpd({ busy: false, msg: 'Du hast bereits die neueste Version.' });
                setUpd({ busy: true, msg: 'Update wird geladen …' });
                await Updates.fetchUpdateAsync();
                setUpd({ busy: false, msg: 'Fertig – die App startet neu.' });
                await Updates.reloadAsync();
              } catch (e: any) {
                setUpd({ busy: false, msg: `Nicht möglich: ${e?.message ?? 'unbekannter Fehler'}` });
              }
            }}
          />
          {upd.msg ? <Text style={[s.muted, { marginTop: 8, color: colors.green }]}>{upd.msg}</Text> : null}
          <Text style={[s.muted, { marginTop: 8, lineHeight: 17 }]}>
            Die App sucht beim Start automatisch nach Updates. Änderungen am Programm (z. B. neue Anzeigen, Quellen, Texte) kommen so ohne neue APK; nur wenn ein neues Bauteil des Handys nötig ist, braucht es einen neuen Build.
          </Text>
        </Card>

        <SectionTitle>News-Quellen</SectionTitle>
        <Card style={{ paddingVertical: 6 }}>
          <Text style={[s.muted, { paddingVertical: 8 }]}>Wähle, woher deine Börsen-News kommen (alle kostenlos). Die Änderung gilt, wenn du zum Märkte-Tab zurückkehrst oder nach unten ziehst.</Text>
          {(['de', 'en'] as const).map((lang) => (
            <View key={lang}>
              <Text style={s.group}>{lang === 'de' ? 'Deutsch' : 'Englisch'}</Text>
              {NEWS_SOURCES.filter((x) => x.lang === lang).map((src) => (
                <View key={src.id} style={s.srcRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.srcName}>{src.name}</Text>
                    {src.note ? <Text style={s.srcNote}>{src.note}</Text> : null}
                  </View>
                  <Switch
                    value={!disabled.includes(src.id)}
                    onValueChange={async (v) => {
                      await setSourceEnabled(src.id, v);
                      setDisabled(await getDisabledSources().then((d) => [...d]));
                    }}
                    trackColor={{ true: colors.accent, false: colors.card2 }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </View>
          ))}
          <Text style={[s.muted, { paddingVertical: 8, lineHeight: 17 }]}>
            Bei einzelnen Aktien kommen zusätzlich Yahoo Finance, Seeking Alpha, Google News (deutsch und englisch, darin u. a. Der Aktionär, Börse Online, Barron's, WELT) und bei US-Aktien die offiziellen SEC-Pflichtmeldungen (✔) dazu. Bezahlschranken werden nicht umgangen: Es erscheinen nur Schlagzeile und Link.
          </Text>
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
  group: { color: colors.text, fontWeight: '700', fontSize: 13, marginTop: 10, marginBottom: 2 },
  srcRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  srcName: { color: colors.text, fontSize: 14 },
  srcNote: { color: colors.muted, fontSize: 11 },
  input: { backgroundColor: colors.card2, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 12, marginBottom: 4 },
});
