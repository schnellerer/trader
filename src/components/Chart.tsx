import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';

export interface Pt {
  t: number;
  v: number;
}

interface Props {
  data: Pt[];
  height?: number;
  color?: string;
  onScrub?: (p: Pt | null) => void;
  baseline?: number; // gestrichelte Referenzlinie (z.B. Vortagesschluss/Startkapital)
  minimal?: boolean; // Sparkline ohne Interaktion
  marks?: { t: number; color: string }[]; // Markierungen (z. B. Einstieg/Ausstieg eines Trades)
  compare?: Pt[]; // zweite Linie zum Vergleich (gleicher Zeitraum, gleiche Skala), z. B. S&P 500
}

export default function Chart({ data, height = 200, color, onScrub, baseline, minimal, marks, compare }: Props) {
  const [w, setW] = useState(0);
  const [idx, setIdx] = useState<number | null>(null);
  const wRef = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  const cbRef = useRef(onScrub);
  cbRef.current = onScrub;

  const up = data.length > 1 ? data[data.length - 1].v >= (baseline ?? data[0].v) : true;
  const line = color ?? (up ? colors.green : colors.red);
  const pad = minimal ? 2 : 6;

  const geo = useMemo(() => {
    if (data.length < 2 || w === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    data.forEach((d) => {
      if (d.v < min) min = d.v;
      if (d.v > max) max = d.v;
    });
    compare?.forEach((d) => {
      if (d.v < min) min = d.v;
      if (d.v > max) max = d.v;
    });
    if (baseline != null) {
      min = Math.min(min, baseline);
      max = Math.max(max, baseline);
    }
    const span = max - min || 1;
    const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
    let d = '';
    data.forEach((p, i) => {
      d += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `;
    });
    const area = `${d} L${x(data.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
    let cmp = '';
    if (compare && compare.length > 1)
      compare.forEach((p, i) => {
        const cx = pad + (i / (compare.length - 1)) * (w - pad * 2);
        cmp += `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${y(p.v).toFixed(1)} `;
      });
    // Markierungen: nächstgelegener Datenpunkt zur Zeit
    const pins = (marks ?? []).map((m) => {
      let best = 0;
      let bd = Infinity;
      data.forEach((p, i) => {
        const dd = Math.abs(p.t - m.t);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      return { cx: x(best), cy: y(data[best].v), color: m.color };
    });
    return { d, area, x, y, cmp, pins };
  }, [data, w, height, baseline, pad, compare, marks]);

  const pan = useMemo(() => {
    const set = (px: number) => {
      const n = dataRef.current.length;
      if (n < 2 || wRef.current === 0) return;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad) / (wRef.current - pad * 2)) * (n - 1))));
      setIdx(i);
      cbRef.current?.(dataRef.current[i]);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !minimal,
      onMoveShouldSetPanResponder: () => !minimal,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        setIdx(null);
        cbRef.current?.(null);
      },
      onPanResponderTerminate: () => {
        setIdx(null);
        cbRef.current?.(null);
      },
    });
  }, [minimal, pad]);

  const gid = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <View
      style={{ height }}
      onLayout={(e) => {
        wRef.current = e.nativeEvent.layout.width;
        setW(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
    >
      {geo && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={line} stopOpacity={minimal ? 0.18 : 0.28} />
              <Stop offset="1" stopColor={line} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {baseline != null && !minimal && (
            <Line x1={0} x2={w} y1={geo.y(baseline)} y2={geo.y(baseline)} stroke={colors.border} strokeDasharray="4,4" strokeWidth={1} />
          )}
          <Path d={geo.area} fill={`url(#${gid})`} />
          {geo.cmp ? <Path d={geo.cmp} stroke={colors.muted} strokeWidth={1.5} strokeDasharray="5,4" fill="none" strokeLinejoin="round" /> : null}
          <Path d={geo.d} stroke={line} strokeWidth={minimal ? 1.5 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {geo.pins.map((p, i) => (
            <Circle key={i} cx={p.cx} cy={p.cy} r={6} fill={p.color} stroke={colors.bg} strokeWidth={2} />
          ))}
          {idx != null && (
            <>
              <Line x1={geo.x(idx)} x2={geo.x(idx)} y1={0} y2={height} stroke={colors.muted} strokeWidth={1} />
              <Circle cx={geo.x(idx)} cy={geo.y(data[idx].v)} r={5} fill={line} stroke={colors.bg} strokeWidth={2} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}
