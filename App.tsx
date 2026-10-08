import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BotsScreen from './src/screens/BotsScreen';
import DetailScreen from './src/screens/DetailScreen';
import DuellScreen from './src/screens/DuellScreen';
import MarketsScreen from './src/screens/MarketsScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TopScreen from './src/screens/TopScreen';
import { initStore, useStore } from './src/store';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent, text: colors.text },
};

const icons: Record<string, [string, string]> = {
  Märkte: ['pulse', 'pulse-outline'],
  Suche: ['search', 'search-outline'],
  Ranking: ['trophy', 'trophy-outline'],
  Bots: ['hardware-chip', 'hardware-chip-outline'],
  Duell: ['game-controller', 'game-controller-outline'],
  Mehr: ['settings', 'settings-outline'],
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => <Ionicons name={(icons[route.name][focused ? 0 : 1]) as any} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Märkte" component={MarketsScreen} />
      <Tab.Screen name="Suche" component={SearchScreen} />
      <Tab.Screen name="Ranking" component={TopScreen} />
      <Tab.Screen name="Bots" component={BotsScreen} />
      <Tab.Screen name="Duell" component={DuellScreen} />
      <Tab.Screen name="Mehr" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const loaded = useStore((s) => s.loaded);
  useEffect(() => {
    initStore();
  }, []);
  if (!loaded)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Detail" component={DetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Root />
    </SafeAreaProvider>
  );
}
