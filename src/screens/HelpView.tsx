import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Disclaimer, Screen } from '../components/UI';
import { colors, space } from '../theme';

const VARS_PAGE = 'https://github.com/schnellerer/trader/settings/variables/actions';

interface Sec {
  icon: string;
  title: string;
  body: string;
  action?: { label: string; url: string };
}

const SECTIONS: Sec[] = [
  {
    icon: 'compass',
    title: 'Die fünf Bereiche',
    body:
      'Märkte: Marktampel, Indizes, deine Watchlist und aktuelle News.\n' +
      'Entdecken: Suche (Name/Ticker/ISIN), Scanner, Top 10, Kaufideen und Sektoren.\n' +
      'Bots: drei Papertrading-Bots und der „Beweis" (Backtest).\n' +
      'Duell: du handelst selbst gegen die Bots.\n' +
      'Mehr: Einstellungen und diese Hilfe.',
  },
  {
    icon: 'bonfire',
    title: 'Marktampel',
    body:
      'Zeigt, wie gesund der Gesamtmarkt ist. Grün: S&P 500 über der 200-Tage-Linie, Trend intakt, Angstindex VIX niedrig. Rot: S&P 500 unter der 200-Tage-Linie oder VIX hoch. Gelb: dazwischen.\n\n' +
      'Die meisten Aktien fallen mit dem Markt – deshalb ist die Ampel ein wichtiger Hinweis. Ehrlich: Im Backtest hat es dem Langzeit-Bot nicht geholfen, ihn bei Rot ganz auszusetzen (er verpasste die Erholungen). Daher bremst die Ampel den Langzeit-Bot nicht; der Day-Trading-Bot wird bei Rot vorsichtiger.',
  },
  {
    icon: 'speedometer',
    title: 'Relative Stärke (RS)',
    body:
      'Jede Aktie bekommt einen Wert von 1 bis 99: Wie viel besser lief sie in den letzten 3 bis 12 Monaten als alle anderen ausgewerteten Aktien? RS 90 heißt: besser als 90 % aller anderen.\n\n' +
      'Starke Aktien bleiben tendenziell eine Weile stark („Momentum-Effekt") – das ist eine der am besten belegten Börsen-Regeln und im Backtest auch die erfolgreichste Kennzahl.',
  },
  {
    icon: 'scan',
    title: 'Scanner',
    body:
      'Filtert alle rund 4.000 ausgewerteten Aktien nach Mustern:\n' +
      '• Ausbruch: nahe 52-Wochen-Hoch + hohes Volumen + starker Trend\n' +
      '• Stärkste: RS ab 90\n' +
      '• Rücksetzer: überverkauft (RSI < 35) im Aufwärtstrend\n' +
      '• Volumen: ungewöhnlich hoher Handel – hier passiert etwas\n' +
      '• Solide: ruhig laufende Aktien mit sehr gutem Score\n' +
      '• Zahlen: Quartalszahlen in den nächsten 7 Tagen (riskant!)\n\n' +
      'Mit „Ohne Micro" werden winzige, kaum handelbare Werte ausgeblendet. Die Daten werden jeden Börsentag abends neu berechnet.',
  },
  {
    icon: 'flask',
    title: 'Beweis (Backtest)',
    body:
      'Ein Backtest spielt eine Strategie über die Vergangenheit durch – nur mit dem Wissen, das damals vorhanden war. So erkennst du, ob eine Idee taugt, bevor du ihr traust.\n\n' +
      'Wichtig: Das Aktien-Universum besteht aus heutigen Großkonzernen, die Ergebnisse sind daher zu optimistisch (Survivorship-Bias). Aussagekräftig ist nur der Vergleich mit „Alle 44 Aktien gleichgewichtet". Der Gold-Bot hat nur ~60 Tage Daten – ein Gewinn ist nicht belegt. Der Day-Trading-Bot lässt sich nicht langfristig testen (Yahoo liefert 1-Minuten-Kerzen nur für wenige Tage).',
  },
  {
    icon: 'hardware-chip',
    title: 'Die drei Bots',
    body:
      'Alle handeln mit Spielgeld auf einem kostenlosen GitHub-Server – auch bei geschlossener App.\n\n' +
      '• Day-Trading: 1-Minuten-Kerzen, Trend (EMA 9/21), VWAP, Volumen; Stop-Loss und Gewinnziel; schließt abends alles. Lernt: sperrt Aktien nach Verlustserien, meidet schlechte Handelsstunden, wird nach vielen Verlusten strenger und stoppt bei −1,5 % Tagesverlust. Meidet Aktien kurz vor Quartalszahlen.\n' +
      '• Langzeit: Momentum mit Trendfilter, 8 Positionen, Stop-Loss −15 %, verkauft vor Quartalszahlen oder wenn das Momentum erlahmt.\n' +
      '• Gold: Breakout auf 5-Minuten-Kerzen, Long und Short, 1 % Risiko pro Trade.\n\n' +
      'Jeder Trade hat eine Begründung. Der Tab „Heute" und das Tagesrating zeigen die Bilanz des Tages.',
  },
  {
    icon: 'game-controller',
    title: 'Duell',
    body:
      'Du bekommst dasselbe Startkapital wie die Bots und handelst echte Kurse mit Spielgeld. Die Rangliste vergleicht deine Rendite ab Spielstart fair mit den drei Bots (gleiche Gebühren). Kaufideen aus dem Ranking kannst du mit einem Tipp ins Duell übernehmen. Dein Depot liegt nur auf deinem Handy.',
  },
  {
    icon: 'notifications',
    title: 'Handy-Benachrichtigungen (optional, kostenlos)',
    body:
      'Der Server kann dir eine Nachricht schicken, wenn ein Bot kauft oder verkauft, die Marktampel ihre Farbe wechselt oder der Scanner Ausbruchs-Kandidaten findet.\n\n' +
      '1. Installiere die kostenlose App „ntfy" (Play Store).\n' +
      '2. Denke dir einen langen, geheimen Namen aus, z. B. trader-nico-8f3k29x (wer ihn kennt, kann mitlesen).\n' +
      '3. Tippe in ntfy auf „+" und abonniere genau diesen Namen.\n' +
      '4. Öffne auf GitHub „Settings → Secrets and variables → Actions → Variables" und lege die Variable NTFY_TOPIC mit diesem Namen an (Knopf unten).\n\n' +
      'Ab dem nächsten Lauf kommen die Nachrichten aufs Handy.',
    action: { label: 'GitHub-Variablen öffnen', url: VARS_PAGE },
  },
  {
    icon: 'warning',
    title: 'Was du wissen solltest',
    body:
      '• Alles hier ist Papertrading mit Spielgeld und keine Anlageberatung.\n' +
      '• Szenarien und Rankings sind Modellrechnungen aus vergangenen Daten, keine Vorhersagen.\n' +
      '• +30 % pro Monat ist kein realistisches Ziel; selbst die besten Profis erreichen das nicht dauerhaft.\n' +
      '• GitHub startet geplante Läufe manchmal verspätet; Yahoo-Daten sind inoffiziell und können ausfallen.\n' +
      '• Bevor du je echtes Geld einsetzt: Erst Monate Spielgeld, und nur Geld, dessen Verlust du verkraften kannst.',
  },
];

export default function HelpView() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen title="So funktioniert's">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}>
        {SECTIONS.map((sec, i) => (
          <Card key={sec.title} style={{ marginBottom: 10, padding: 0 }}>
            <Pressable onPress={() => setOpen(open === i ? null : i)} style={s.head}>
              <Ionicons name={sec.icon as any} size={20} color={colors.accent} />
              <Text style={s.title}>{sec.title}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {open === i ? (
              <View style={s.body}>
                <Text style={s.text}>{sec.body}</Text>
                {sec.action ? <Button label={sec.action.label} icon="open-outline" kind="ghost" onPress={() => Linking.openURL(sec.action!.url)} /> : null}
              </View>
            ) : null}
          </Card>
        ))}
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.l },
  title: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 15 },
  body: { paddingHorizontal: space.l, paddingBottom: space.l },
  text: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
