import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmbeddedCtx, Segmented } from '../components/UI';
import { colors, space } from '../theme';
import HelpView from './HelpView';
import SettingsScreen from './SettingsScreen';
import ToolsView from './ToolsView';

/** Einstellungen + Hilfe in einem Tab */
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'help' | 'tools' | 'settings'>('help');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: space.l, paddingBottom: space.m }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'help', label: 'Hilfe' },
            { key: 'tools', label: 'Werkzeuge' },
            { key: 'settings', label: 'Einstellungen' },
          ]}
        />
      </View>
      <EmbeddedCtx.Provider value={true}>
        <View style={{ flex: 1 }}>{tab === 'help' ? <HelpView /> : tab === 'tools' ? <ToolsView /> : <SettingsScreen />}</View>
      </EmbeddedCtx.Provider>
    </View>
  );
}
