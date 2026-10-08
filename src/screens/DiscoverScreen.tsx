import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChipTabs, EmbeddedCtx } from '../components/UI';
import { colors, space } from '../theme';
import DividendView from './DividendView';
import ScannerScreen from './ScannerScreen';
import SearchScreen from './SearchScreen';
import SectorsView from './SectorsView';
import TopScreen from './TopScreen';

type Tab = 'search' | 'scan' | 'top' | 'ideas' | 'div' | 'sectors';

/** Ein Tab für alles, was mit dem Finden von Aktien zu tun hat */
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('search');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m }}>
        <ChipTabs
          value={tab}
          onChange={setTab}
          options={[
            { key: 'search', label: 'Suche' },
            { key: 'scan', label: 'Scanner' },
            { key: 'top', label: 'Top 10' },
            { key: 'ideas', label: 'Ideen' },
            { key: 'div', label: 'Dividenden' },
            { key: 'sectors', label: 'Sektoren' },
          ]}
        />
      </View>
      <EmbeddedCtx.Provider value={true}>
        <View style={{ flex: 1 }}>
          {tab === 'search' && <SearchScreen />}
          {tab === 'scan' && <ScannerScreen />}
          {tab === 'top' && <TopScreen view="top" />}
          {tab === 'ideas' && <TopScreen view="ideas" />}
          {tab === 'div' && <DividendView />}
          {tab === 'sectors' && <SectorsView />}
        </View>
      </EmbeddedCtx.Provider>
    </View>
  );
}
