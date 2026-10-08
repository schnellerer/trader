import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmbeddedCtx, Segmented } from '../components/UI';
import { colors, space } from '../theme';
import DuellScreen from './DuellScreen';
import RuleLabScreen from './RuleLabScreen';
import TimeTravelScreen from './TimeTravelScreen';

type Mode = 'duell' | 'travel' | 'lab';

/** Alles zum Üben und Ausprobieren: Duell gegen die Bots, Zeitreise und Regel-Labor */
export default function TrainingScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const [mode, setMode] = useState<Mode>('duell');

  // Kaufidee aus dem Ranking → direkt ins Duell
  useEffect(() => {
    if (route.params?.symbol) setMode('duell');
  }, [route.params?.ts]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'duell', label: 'Duell' },
            { key: 'travel', label: 'Zeitreise' },
            { key: 'lab', label: 'Regel-Labor' },
          ]}
        />
      </View>
      <EmbeddedCtx.Provider value={true}>
        <View style={{ flex: 1 }}>
          {mode === 'duell' && <DuellScreen />}
          {mode === 'travel' && <TimeTravelScreen />}
          {mode === 'lab' && <RuleLabScreen />}
        </View>
      </EmbeddedCtx.Provider>
    </View>
  );
}
