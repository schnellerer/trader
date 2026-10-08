import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { History, idxAt, loadHistory } from '../analysis/history';
import { PRESET_RULES, runRule } from '../analysis/ruleLab';
import Chart from '../components/Chart';
import { PctText } from '../components/Rows';
import { Button, Card, Disclaimer, ErrorBox, Screen, SectionTitle, Stat } from '../components/UI';
import { fmtDate, fmtMoney, fmtNum, fmtPct } from '../format';
import { colors, radius, signColor, space } from '../theme';

const WEEKS = 52;
const BARS = 5;
const CAPITAL = 10000;
const FEE = 0.0005;

interface Pos {
  qty: number;
  avg: number;
}

interface Game {
  start: number; // Startindex im S&P-500-Verlauf (verborgen)
  week: number;
  cash: number;
  pos: Record<string, Pos>;
  eq: number[]; // Depotwert je Woche
  spx: number[]; // S&P 500, normiert auf CAPITAL
  trades: number;
}

export default function TimeTravelScreen() {
  const [h, setH] = useState<History | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const start = async () => {
    setBusy(true);
    setErr('');
    try {
      const hist = h ?? (await loadHistory((d, t) => setProgress(`Kursdaten laden … ${d} / ${t}`)));
      setH(hist);
      const n = hist.spx.t.length;
      const lo = 260;
      const hi = n - 1 - WEEKS * BARS;
      const st = lo + Math.floor(Math.random() * Math.max(1, hi - lo));
      setGame({ start: st, week: 0, cash: CAPITAL, pos: {}, eq: [CAPITAL], spx: [CAPITAL], trades: 0 });
      setOpen(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Konnte Kursdaten nicht laden');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  if (!game || !h)
    return (
      <Screen title="Zeitreise" subtitle="Trainiere in einem unbekannten Börsenjahr">
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40 }}>
          <Card>
            <Text style={s.title}>Reise in ein geheimes Börsenjahr</Text>
            <Text style={[s.muted, { marginTop: 8, lineHeight: 19 }]}>
              Du bekommst {fmtMoney(CAPITAL, '€', 0)} Spielgeld und handelst 52 Wochen lang in einem zufälligen Zeitraum der letzten 10 Jahre. Welcher es ist, erfährst du erst am Ende. Pro Klick läuft die Zeit 1 oder 4 Wochen weiter.{'\n\n'}
              Am Ende vergleichst du dich mit dem S&P 500 und mit dem Momentum-Bot im selben Zeitraum. In Minuten lernst du, wofür man sonst ein Jahr bräuchte – inklusive Crashs und Rallyes.
            </Text>
            <Button label={busy ? progress || 'Lädt …' : 'Zeitreise starten'} icon="time" onPress={start} disabled={busy} />
          </Card>
          {err ? <ErrorBox text={err} onRetry={start} /> : null}
          <Disclaimer />
        </ScrollView>
      </Screen>
    );

  return <Play h={h} game={game} setGame={setGame} open={open} setOpen={setOpen} amount={amount} setAmount={setAmount} onRestart={start} busy={busy} />;
}

function Play({
  h,
  game,
  setGame,
  open,
  setOpen,
  amount,
  setAmount,
  onRestart,
  busy,
}: {
  h: History;
  game: Game;
  setGame: (g: Game) => void;
  open: string | null;
  setOpen: (s: string | null) => void;
  amount: string;
  setAmount: (s: string) => void;
  onRestart: () => void;
  busy: boolean;
}) {
  const idx = game.start + game.week * BARS;
  const t = h.spx.t[idx];
  const done = game.week >= WEEKS;
  const price = (sym: string) => {
    const s = h.stocks.get(sym)!;
    return s.c[idxAt(s, t)];
  };
  const value = game.cash + Object.entries(game.pos).reduce((a, [sy, p]) => a + p.qty * price(sy), 0);

  const symbols = useMemo(() => [...h.stocks.keys()], [h]);
  const rows = useMemo(
    () =>
      symbols.map((sy) => {
        const s = h.stocks.get(sy)!;
        const j = idxAt(s, t);
        const hist = s.c.slice(Math.max(0, j - 120), j + 1);
        return { sy, p: s.c[j], m3: s.c[j] / s.c[j - 63] - 1, m12: s.c[j] / s.c[j - 251] - 1, series: hist.map((v, i) => ({ t: i, v })) };
      }),
    [h, symbols, t],
  );

  const advance = (weeks: number) => {
    const w = Math.min(WEEKS, game.week + weeks);
    const ni = game.start + w * BARS;
    const nt = h.spx.t[ni];
    const eq = [...game.eq];
    const spx = [...game.spx];
    for (let k = game.week + 1; k <= w; k++) {
      const ti = h.spx.t[game.start + k * BARS];
      eq.push(game.cash + Object.entries(game.pos).reduce((a, [sy, p]) => {
        const s = h.stocks.get(sy)!;
        return a + p.qty * s.c[idxAt(s, ti)];
      }, 0));
      spx.push((CAPITAL * h.spx.c[game.start + k * BARS]) / h.spx.c[game.start]);
    }
    void nt;
    setGame({ ...game, week: w, eq, spx });
    setOpen(null);
  };

  const buy = (sy: string) => {
    const amt = Number(amount.replace(',', '.'));
    if (!isFinite(amt) || amt < 20 || amt > game.cash + 0.005) return;
    const p = price(sy);
    const qty = (amt * (1 - FEE)) / p;
    const old = game.pos[sy];
    const pos = { ...game.pos, [sy]: { qty: (old?.qty ?? 0) + qty, avg: ((old?.avg ?? 0) * (old?.qty ?? 0) + p * qty) / ((old?.qty ?? 0) + qty) } };
    setGame({ ...game, cash: game.cash - amt, pos, trades: game.trades + 1, eq: [...game.eq.slice(0, -1), game.eq[game.eq.length - 1]] });
    setAmount('');
  };

  const sell = (sy: string, f: number) => {
    const old = game.pos[sy];
    if (!old) return;
    const qty = old.qty * f;
    const gross = qty * price(sy);
    const pos = { ...game.pos };
    if (f >= 0.999) delete pos[sy];
    else pos[sy] = { qty: old.qty - qty, avg: old.avg };
    setGame({ ...game, cash: game.cash + gross * (1 - FEE), pos, trades: game.trades + 1 });
  };

  if (done) return <Finish h={h} game={game} value={value} onRestart={onRestart} busy={busy} />;

  const equityPts = game.eq.map((v, i) => ({ t: i, v }));
  const spxPts = game.spx.map((v, i) => ({ t: i, v }));
  return (
    <Screen title="Zeitreise" subtitle={`Woche ${game.week} von ${WEEKS} · Zeitraum geheim`}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={s.big}>{fmtMoney(value, '€', 0)}</Text>
            <PctText v={value / CAPITAL - 1} />
          </View>
          <Text style={s.muted}>Cash {fmtMoney(game.cash, '€', 0)} · gestrichelt = S&P 500</Text>
          {equityPts.length > 1 ? (
            <View style={{ marginTop: 8 }}>
              <Chart data={equityPts} height={100} baseline={CAPITAL} compare={spxPts} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Button label="+1 Woche" icon="play-forward" kind="ghost" onPress={() => advance(1)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="+4 Wochen" icon="play-skip-forward" onPress={() => advance(4)} />
            </View>
          </View>
        </Card>

        <SectionTitle>Aktien</SectionTitle>
        {rows.map((r) => {
          const held = game.pos[r.sy];
          const isOpen = open === r.sy;
          return (
            <Card key={r.sy} style={{ marginBottom: 8, padding: 12 }}>
              <Pressable onPress={() => setOpen(isOpen ? null : r.sy)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 84 }}>
                    <Text style={s.sym}>{r.sy.replace('.DE', '')}</Text>
                    {held ? <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>GEHALTEN</Text> : null}
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Chart data={r.series} height={32} minimal />
                  </View>
                  <View style={{ alignItems: 'flex-end', width: 92 }}>
                    <Text style={s.price}>{fmtNum(r.p)}</Text>
                    <Text style={{ color: signColor(r.m3), fontSize: 12 }}>3 Mon. {fmtPct(r.m3, 0)}</Text>
                  </View>
                </View>
              </Pressable>
              {isOpen ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={s.muted}>
                    12 Monate {fmtPct(r.m12, 0)}
                    {held ? ` · du hältst ${fmtNum(held.qty, 2)} Stk. (${fmtPct(r.p / held.avg - 1, 1)})` : ''}
                  </Text>
                  <View style={s.inputWrap}>
                    <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Betrag in €" placeholderTextColor={colors.muted} style={s.input} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Kaufen" icon="cart" onPress={() => buy(r.sy)} />
                    </View>
                    {held ? (
                      <>
                        <View style={{ flex: 1 }}>
                          <Button label="50 % verk." kind="ghost" onPress={() => sell(r.sy, 0.5)} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button label="Alles verk." kind="danger" onPress={() => sell(r.sy, 1)} />
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

function Finish({ h, game, value, onRestart, busy }: { h: History; game: Game; value: number; onRestart: () => void; busy: boolean }) {
  const endIdx = game.start + WEEKS * BARS;
  const mine = value / CAPITAL - 1;
  const spx = h.spx.c[endIdx] / h.spx.c[game.start] - 1;
  let bot: number | null = null;
  try {
    const r = runRule(PRESET_RULES[0].rule, h, game.start, endIdx);
    bot = r.totalReturn;
  } catch {
    bot = null;
  }
  const verdict =
    mine > Math.max(spx, bot ?? -9)
      ? 'Stark: Du hast den Markt UND den Bot geschlagen.'
      : mine > spx
      ? 'Du hast den Markt geschlagen – der Bot war aber besser.'
      : mine > 0
      ? 'Im Plus, aber der Markt war besser. Das gelingt den meisten Profis auch nicht dauerhaft.'
      : 'Im Minus. Genau dafür ist die Zeitreise da: Fehler kosten hier nichts.';
  return (
    <Screen title="Zeitreise beendet" subtitle="Jetzt wird enthüllt">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 60 }}>
        <Card>
          <Text style={s.muted}>Das war der Zeitraum</Text>
          <Text style={s.big}>
            {fmtDate(h.spx.t[game.start])} – {fmtDate(h.spx.t[endIdx])}
          </Text>
          <Text style={[s.text, { marginTop: 8 }]}>{verdict}</Text>
        </Card>
        <Card style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Stat label="Du" value={fmtPct(mine, 1)} color={signColor(mine)} />
            <Stat label="S&P 500" value={fmtPct(spx, 1)} color={signColor(spx)} />
            <Stat label="Momentum-Bot" value={bot == null ? '–' : fmtPct(bot, 1)} color={bot == null ? undefined : signColor(bot)} />
            <Stat label="Deine Trades" value={String(game.trades)} />
          </View>
          <View style={{ marginTop: 8 }}>
            <Chart data={game.eq.map((v, i) => ({ t: i, v }))} height={120} baseline={CAPITAL} compare={game.spx.map((v, i) => ({ t: i, v }))} />
          </View>
          <Text style={[s.muted, { marginTop: 6 }]}>Farbige Linie = dein Depot · gestrichelt = S&P 500</Text>
        </Card>
        <Button label={busy ? 'Lädt …' : 'Neue Zeitreise'} icon="refresh" onPress={onRestart} disabled={busy} />
        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  big: { color: colors.text, fontSize: 24, fontWeight: '800' },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 12 },
  sym: { color: colors.text, fontWeight: '700', fontSize: 14 },
  price: { color: colors.text, fontWeight: '700', fontSize: 14 },
  inputWrap: { backgroundColor: colors.card2, borderRadius: radius.m, paddingHorizontal: 14, marginTop: 8 },
  input: { color: colors.text, fontSize: 16, paddingVertical: 10 },
});
