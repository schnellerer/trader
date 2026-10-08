import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Fund } from '../api/fundamentals';
import { getDividends } from '../api/yahoo';
import { divQuality, divStats } from '../analysis/dividends';
import { netAfterTax } from '../analysis/tax';
import { fmtDate, fmtMoney, fmtNum, fmtPct } from '../format';
import { useAsync } from '../hooks';
import { colors, radius, signColor, space } from '../theme';
import { Card, Loading, SectionTitle, Stat } from './UI';

const freq = (n: number) => (n === 12 ? 'monatlich' : n === 4 ? 'vierteljährlich' : n === 2 ? 'halbjährlich' : 'jährlich');

/** Reiter „Dividende": Rendite, Verlauf, Sicherheit und Netto-Rechner */
export default function DividendPanel({ symbol, fund, fundScore, cur, price }: { symbol: string; fund: Fund | null; fundScore: number | null; cur: string; price?: number }) {
  const hist = useAsync(() => getDividends(symbol), [symbol]);
  const [amount, setAmount] = useState('10000');
  const st = useMemo(() => (hist.data ? divStats(hist.data) : null), [hist.data]);
  const q = useMemo(() => (fund && st ? divQuality(fund, st, fundScore) : null), [fund, st, fundScore]);

  if (hist.loading && !hist.data) return <Loading text="Dividendendaten werden geladen …" />;

  // Rendite: aus den Kennzahlen, sonst aus den Zahlungen der letzten 12 Monate geteilt durch den Kurs
  const yieldNow = fund?.div ?? (price && st ? st.ttm / price : 0);
  const pays = (st?.ttm ?? 0) > 0 || yieldNow > 0;
  if (!pays)
    return (
      <Card style={{ marginTop: space.l }}>
        <Text style={s.text}>Diese Aktie zahlt aktuell keine Dividende (oder es liegen keine Daten vor).</Text>
        <Text style={[s.muted, { marginTop: 6, lineHeight: 18 }]}>Viele Wachstumsfirmen behalten Gewinne lieber im Unternehmen. Für Dividenden-Ideen: Entdecken → Dividenden.</Text>
      </Card>
    );

  const perShare = fund?.dr ?? st?.ttm ?? 0;
  const exd = fund?.exd ? fund.exd * 1000 : null;
  const invest = Number(amount.replace(/\./g, '').replace(',', '.')) || 0;
  const gross = invest * yieldNow;
  const net = netAfterTax(gross, 0);
  const years = st?.years.slice(-10) ?? [];
  const max = Math.max(0.0001, ...years.map((y) => y.sum));
  const vs5 = fund?.dy5 != null && yieldNow > 0 ? yieldNow / fund.dy5 - 1 : null;

  return (
    <>
      <Card style={{ marginTop: space.l }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={s.big}>{fmtNum(yieldNow * 100, 2)} %</Text>
          <Text style={s.muted}>Dividendenrendite</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          <Stat label="Dividende pro Jahr" value={`${fmtNum(perShare, 2)} ${cur}`} />
          <Stat label="Zahlung" value={st ? freq(st.perYear) : '–'} />
          <Stat label="Ausschüttungsquote" value={fund?.pay != null ? fmtPct(fund.pay, 0, false) : '–'} />
          <Stat label="Nächster Ex-Tag" value={exd ? fmtDate(exd) : '–'} />
          <Stat label="Ø Rendite 5 Jahre" value={fund?.dy5 != null ? fmtPct(fund.dy5, 2, false) : '–'} />
          <Stat label="Heute vs. 5-J-Schnitt" value={vs5 != null ? `${vs5 >= 0 ? '+' : ''}${fmtNum(vs5 * 100, 0)} %` : '–'} color={vs5 != null ? (vs5 > 0.3 ? colors.amber : undefined) : undefined} />
        </View>
        {vs5 != null && vs5 > 0.3 ? <Text style={[s.muted, { marginTop: 6, lineHeight: 17 }]}>Die Rendite liegt deutlich über dem 5-Jahres-Schnitt: Entweder ist die Aktie günstig geworden – oder der Markt erwartet eine Kürzung. Prüfe die Sicherheit unten.</Text> : null}
        <Text style={[s.muted, { marginTop: 6, lineHeight: 17 }]}>Den Ex-Tag musst du die Aktie spätestens am Vortag besitzen, um die Dividende zu bekommen. Der Kurs fällt am Ex-Tag meist um den Betrag der Dividende.</Text>
      </Card>

      {q ? (
        <>
          <SectionTitle>Wie sicher ist die Dividende?</SectionTitle>
          <Card style={{ borderColor: q.level === 'good' ? colors.green : q.level === 'ok' ? colors.amber : colors.red }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.label, { color: q.level === 'good' ? colors.green : q.level === 'ok' ? colors.amber : colors.red }]}>{q.label}</Text>
              <Text style={s.score}>{q.score} / 100</Text>
            </View>
            {q.trap ? (
              <View style={s.trap}>
                <Ionicons name="warning" size={16} color={colors.red} />
                <Text style={s.trapText}>Verdacht auf „Dividendenfalle": Die Rendite wirkt hoch, die Zahlung ist aber nicht gut abgesichert.</Text>
              </View>
            ) : null}
            {q.lines.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Ionicons name={l.v > 0 ? 'checkmark-circle' : l.v < 0 ? 'close-circle' : 'remove-circle'} size={16} color={l.v > 0 ? colors.green : l.v < 0 ? colors.red : colors.muted} style={{ marginTop: 1 }} />
                <Text style={[s.muted, { flex: 1, color: colors.text, lineHeight: 18 }]}>{l.text}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {years.length >= 2 ? (
        <>
          <SectionTitle>Dividende je Jahr</SectionTitle>
          <Card>
            <View style={s.bars}>
              {years.map((y, i) => {
                const prev = i > 0 ? years[i - 1].sum : null;
                const up = prev != null ? y.sum >= prev * 0.98 : true;
                return (
                  <View key={y.y} style={s.barCol}>
                    <Text style={s.barVal}>{fmtNum(y.sum, y.sum < 10 ? 2 : 1)}</Text>
                    <View style={[s.bar, { height: Math.max(4, (y.sum / max) * 90), backgroundColor: up ? colors.green : colors.red }]} />
                    <Text style={s.barLabel}>{String(y.y).slice(2)}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
              <Stat label="Wachstum p.a. (ca. 5 J.)" value={st?.cagr != null ? fmtPct(st.cagr, 1) : '–'} color={st?.cagr != null ? signColor(st.cagr) : undefined} />
              <Stat label="Jahre ohne Kürzung" value={st ? `${st.streak}` : '–'} />
              <Stat label="Davon erhöht" value={st ? `${st.raises}×` : '–'} />
              <Stat label="Letzte Kürzung" value={st?.cutYear ? String(st.cutYear) : 'keine'} color={st?.cutYear ? colors.red : undefined} />
            </View>
            <Text style={[s.muted, { marginTop: 4 }]}>Rot = Jahressumme niedriger als im Vorjahr. Balken in {cur}.</Text>
          </Card>
        </>
      ) : null}

      <SectionTitle>Was bringt das bei mir?</SectionTitle>
      <Card>
        <Text style={s.muted}>Anlagebetrag in € (bei der aktuellen Rendite)</Text>
        <View style={s.inputWrap}>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={s.input} placeholderTextColor={colors.muted} />
          <Text style={s.muted}>€</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          <Stat label="Dividende pro Jahr (brutto)" value={fmtMoney(gross)} />
          <Stat label="Nach Steuern (Deutschland)" value={fmtMoney(net.net)} color={colors.green} />
          <Stat label="Pro Monat (netto)" value={fmtMoney(net.net / 12)} />
          <Stat label="Steuer" value={fmtMoney(net.tax)} color={colors.red} />
        </View>
        <Text style={[s.muted, { marginTop: 6, lineHeight: 17 }]}>
          Vereinfacht: 26,375 % Abgeltungsteuer, abzüglich 1.000 € Sparerpauschbetrag pro Jahr (der gilt für alle deine Erträge zusammen, hier komplett angerechnet). Bei US-Aktien kommt oft eine Quellensteuer von 15 % dazu, die sich teilweise anrechnen lässt. Keine Steuerberatung.
        </Text>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  big: { color: colors.green, fontSize: 30, fontWeight: '800' },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 12 },
  label: { fontSize: 18, fontWeight: '800' },
  score: { color: colors.text, fontWeight: '700' },
  trap: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.redBg, borderRadius: 10, padding: 10, marginTop: 10 },
  trapText: { color: colors.red, fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 3 },
  barVal: { color: colors.muted, fontSize: 10, marginBottom: 2 },
  barLabel: { color: colors.muted, fontSize: 11, marginTop: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: radius.m, paddingHorizontal: 14, marginTop: 4 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
});
