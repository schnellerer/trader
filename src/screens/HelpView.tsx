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
      'Training: Duell gegen die Bots, Zeitreise und Regel-Labor.\n' +
      'Mehr: Hilfe, Werkzeuge (Positions- und Steuerrechner) und Einstellungen.',
  },
  {
    icon: 'bonfire',
    title: 'Marktampel',
    body:
      'Zeigt, wie gesund der Gesamtmarkt ist. Grün: S&P 500 über der 200-Tage-Linie, Trend intakt, Angstindex VIX niedrig. Rot: S&P 500 unter der 200-Tage-Linie oder VIX hoch. Gelb: dazwischen.\n\n' +
      'Die meisten Aktien fallen mit dem Markt – deshalb ist die Ampel ein wichtiger Hinweis. Ehrlich: Im Backtest hat es dem Langzeit-Bot nicht geholfen, ihn bei Rot ganz auszusetzen (er verpasste die Erholungen). Daher bremst die Ampel den Langzeit-Bot nicht; der Day-Trading-Bot wird bei Rot vorsichtiger.',
  },
  {
    icon: 'business',
    title: 'Fundament, Gesamturteil & Trade-Plan',
    body:
      'Auf jeder Aktie siehst du oben das Gesamturteil: Fundament (Note A–E) × Chart (bullisch/bärisch).\n\n' +
      'Fundament-Note (0–100) aus fünf Bereichen:\n' +
      '• Bewertung (25 %): KGV, PEG, Kurs/Buchwert – ist die Aktie teuer oder günstig?\n' +
      '• Wachstum (25 %): Umsatz- und Gewinnwachstum, erwartetes Wachstum.\n' +
      '• Qualität (25 %): Nettomarge, Eigenkapitalrendite, freier Cashflow.\n' +
      '• Bilanz & Risiko (10 %): Schulden, Liquidität, Beta.\n' +
      '• Analysten (15 %): Kursziel und Empfehlung.\n\n' +
      'Gesamturteil: „Starke Kaufidee" nur bei gutem Fundament UND Aufwärtstrend UND vernünftigem Einstiegszeitpunkt. Gutes Fundament + schwacher Chart = „Timing abwarten". Schwaches Fundament + steigender Kurs = „Spekulativ".\n\n' +
      'Der Trade-Plan nennt Einstieg/Wartezone, Stop-Loss (aus der Schwankung), zwei Ziele und die Stückzahl für dein Risiko. ' +
      'Wichtig: Die Fundament-Schwellen sind Faustregeln, Branchen unterscheiden sich stark, und sie sind nicht rückblickend getestet (Yahoo liefert keine alten Kennzahlen). Der Backtest belegt nur die Momentum-Regeln.',
  },
  {
    icon: 'skull',
    title: 'W.A.F – We Are Fucked (Deutschland)',
    body:
      'Ein Spaß-Index mit echten Zahlen: Wie sehr ist die Gen Z in Deutschland gerade aufgeschmissen? 0 = läuft, 100 = maximal fucked. Er setzt sich aus sechs Bereichen zusammen: Preise im Alltag (Inflation, Lebensmittel, Energie), Wohnen (Mieten, Hypothekenzins, Immobilienpreise), Job & Zukunft (Jugendarbeitslosigkeit, Arbeitslosigkeit, Wirtschaftswachstum), Börse (DAX), Politik-Schlagzeilen und Krypto-Frust.\n\n' +
      'Jeden Tag berechnet der Server den Wert neu und merkt sich den Verlauf; die Pfeile zeigen die Veränderung zur Vorwoche. Tippe einen Bereich an, um die Einzelzahlen mit Datum zu sehen.\n\n' +
      'Wichtig: Gewichte und Schwellen sind meine Willkür, kein wissenschaftlicher Index. Amtliche Zahlen kommen mit Verzögerung (das Datum steht dabei). Der Politik-Wert misst nur, wie viele Schlagzeilen Krisen-Wörter enthalten, nicht, wer recht hat. Es ist Satire und keine Meinung zu einer Partei oder eine Prognose.',
  },
  {
    icon: 'newspaper',
    title: 'News & Quellen',
    body:
      'Märkte zeigt Börsen-News aus 16 kostenlosen Quellen (CNBC, MarketWatch, Seeking Alpha, Investing.com, Yahoo, finanzen.net, FAZ, Spiegel, Handelsblatt, Manager Magazin, ntv, Tagesschau, Reuters über Google, GlobeNewswire). Mit den Reitern filterst du nach Deutsch, Englisch oder „Offiziell". Unter Mehr → Einstellungen → News-Quellen schaltest du einzelne Quellen ein oder aus.\n\n' +
      'Bei einer einzelnen Aktie (Reiter News) kommen Yahoo, Seeking Alpha, Google News (deutsch und englisch, darin u. a. Der Aktionär, Börse Online, Barron\'s, WELT) und bei US-Aktien die offiziellen SEC-Pflichtmeldungen (✔) dazu, z. B. „Quartalszahlen veröffentlicht" oder „Wechsel im Vorstand".\n\n' +
      'Die Stimmung (grün/rot) ist eine einfache Stichwort-Erkennung in der Schlagzeile, nur ein grober Hinweis. Bezahlschranken werden nicht umgangen: Es erscheinen nur Schlagzeile und Link.',
  },
  {
    icon: 'cloud-download',
    title: 'App-Updates ohne neue APK',
    body:
      'Die App sucht beim Start automatisch nach Updates und lädt sie im Hintergrund; beim nächsten Öffnen ist die neue Version da. Unter Mehr → Einstellungen → App-Update kannst du von Hand suchen.\n\n' +
      'Das gilt für Änderungen am Programm (Anzeigen, Quellen, Texte, Rechenlogik). Nur wenn ein neues Bauteil des Handys nötig wird (z. B. eine neue Funktion wie Kamera oder ein zusätzliches Paket mit Handy-Anteil), braucht es wieder eine neue APK.\n\n' +
      'Die Server-Seite (Bots, Ranking, Dividenden, Backtest) aktualisiert sich ohnehin ohne Zutun.',
  },
  {
    icon: 'cash',
    title: 'Dividenden',
    body:
      'Entdecken → Dividenden zeigt die Top-Dividendenwerte, sortierbar nach Rendite, Sicherheit, Wachstum und Jahren ohne Kürzung. Auf jeder Aktie gibt es den Reiter „Dividende" mit Rendite, Ex-Tag, Verlauf der letzten Jahre und einem Netto-Rechner (nach deutscher Abgeltungsteuer).\n\n' +
      'Die Sicherheits-Note (0–100) bewertet: Ausschüttungsquote (wie viel vom Gewinn wird verteilt?), Jahre ohne Kürzung, Dividendenwachstum, Cashflow und Fundament der Firma.\n\n' +
      '„Dividendenfalle": Eine sehr hohe Rendite (über 7–8 %) entsteht oft, weil der Kurs gefallen ist – der Markt erwartet eine Kürzung. Warnzeichen: Ausschüttungsquote über 100 %, frühere Kürzung, negativer Cashflow.\n\n' +
      'Grenzen: Sonderdividenden (einmalige Zahlungen) verzerren die Rendite, bei Immobilien-Firmen (REITs) ist die Quote nach Gewinn nicht aussagekräftig, und Dividenden sind nie garantiert. Die Note ist eine Faustregel, nicht rückblickend getestet. Bei US-Aktien kommt zur deutschen Steuer oft eine Quellensteuer von 15 % hinzu.',
  },
  {
    icon: 'options',
    title: 'Risiko-Regler (0–100 %)',
    body:
      'Im Bots-Tab (Übersicht) stellst du pro Bot ein, wie vorsichtig oder aggressiv er handelt. 50 % ist das bisherige Standardverhalten.\n\n' +
      '• 0 %: keine neuen Käufe (der Bot pausiert, offene Positionen laufen weiter)\n' +
      '• unter 50 %: weniger Geld im Markt (z. B. 25 % = höchstens die Hälfte investiert), kleinere Positionen, engere Stops, strengere Einstiegsregeln\n' +
      '• über 50 %: größere und konzentriertere Positionen, weitere Stops, lockerere Regeln – mehr Chance UND mehr Verlustrisiko\n\n' +
      'Beim Langzeit-Bot gilt der Stop-Loss des Reglers für alle offenen Positionen, die anderen Werte betreffen neue Käufe.\n\n' +
      'Der Wert wird über einen GitHub-Auftrag an den Server geschickt. Dafür braucht die App einmalig einen GitHub-Schlüssel (Mehr → Einstellungen) – oder du trägst den Wert auf der GitHub-Seite von Hand ein. Er gilt nach etwa 1–2 Minuten. Ein höheres Risiko macht einen Bot nicht besser: Es verstärkt Gewinne und Verluste gleichermaßen.',
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
    title: 'Duell gegen die Bots',
    body:
      'Du bekommst dasselbe Startkapital wie die Bots und handelst echte Kurse mit Spielgeld. Die Rangliste vergleicht deine Rendite ab Spielstart fair mit den drei Bots (gleiche Gebühren). Kaufideen aus dem Ranking kannst du mit einem Tipp ins Duell übernehmen. Dein Depot liegt nur auf deinem Handy.',
  },
  {
    icon: 'school',
    title: 'Coach, Glück-oder-Können, Crash-Test',
    body:
      'Im Duell-Tab „Coach" und im Bots-Tab (Übersicht) findest du:\n' +
      '• Coach: prüft deine Trades auf typische Fehler – Verlierer zu lange halten, Gewinne zu früh mitnehmen, zu große Positionen, zu viele Trades, Gebühren. Jede Aussage ist nachgerechnet, nichts geraten.\n' +
      '• Glück oder Können?: Ein Zufallstest. Er mischt deine Trades 4.000-mal neu zusammen und zeigt, wie oft ein Trader ohne Können so gut wäre wie du. Unter 5 % = kaum Zufall. Wichtig erst ab ca. 30 Trades.\n' +
      '• Crash-Test: Wie viel würde das Depot in einer Korrektur, 2022, Corona oder der Finanzkrise verlieren? Geschätzt über das Beta jeder Aktie.\n' +
      '• Nach Steuern: Was von einem Gewinn nach deutscher Abgeltungsteuer übrig bliebe.',
  },
  {
    icon: 'time',
    title: 'Zeitreise',
    body:
      'Du handelst 52 Wochen in einem zufälligen, geheimen Zeitraum der letzten 10 Jahre – mit Crashs, Rallyes und Seitwärtsphasen. Mit „+1 Woche" oder „+4 Wochen" läuft die Zeit weiter. Am Ende wird der Zeitraum enthüllt und du siehst, wie du gegen den S&P 500 und den Momentum-Bot abgeschnitten hast.\n\nSo übst du, ohne ein Jahr zu warten und ohne Geld zu riskieren. Tipp: Setze dir vorher Stop-Loss-Regeln und halte sie ein.',
  },
  {
    icon: 'flask',
    title: 'Regel-Labor',
    body:
      'Baue eine eigene Handelsregel (Relative Stärke, RSI, Nähe zum Jahreshoch, Schwankung, Stop-Loss, Gewinnziel, Haltedauer …) und teste sie sofort über 10 Jahre. Du siehst Rendite, Rückgang, Trefferquote, den Vergleich mit dem S&P 500 und einen Robustheits-Check: Die Zeit wird halbiert – nur wenn die Regel in BEIDEN Hälften den Markt schlägt, ist sie vertrauenswürdiger.\n\nWarnung: Wer lange an den Reglern dreht, findet immer etwas, das in der Vergangenheit glänzt (Überanpassung). Je einfacher die Regel, desto eher hält sie auch in Zukunft.',
  },
  {
    icon: 'ribbon',
    title: 'Prognose-Zeugnis',
    body:
      'Der Server speichert jeden Börsentag die 30-Tage-Prognosen des Modells für die Top 20 und für 40 Zufallsaktien. Nach 30 Tagen wird nachgeprüft. Im Bots-Tab unter „Beweis" siehst du dann: War die Modell-Auswahl besser als der Zufall? Stimmen die Wahrscheinlichkeiten? Die ersten Ergebnisse gibt es 30 Tage nach dem ersten Ranking-Lauf nach dem Update – bis dahin zeigt die Seite den Sammelstand.',
  },
  {
    icon: 'calculator',
    title: 'Werkzeuge',
    body:
      'Positionsrechner: aus Depotgröße, Risiko pro Trade und Stop-Kurs die richtige Stückzahl. Das ist die wichtigste Regel gegen große Verluste (Profis riskieren 0,5–2 % pro Trade).\nSteuerrechner: Netto nach Abgeltungsteuer, optional mit Kirchensteuer.\nTrade-Wiederholung: Tippe in der Trade-Liste eines Bots auf einen Trade, dann auf „Trade im Chart ansehen" – Einstieg und Ausstieg werden im Kursverlauf markiert.',
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
