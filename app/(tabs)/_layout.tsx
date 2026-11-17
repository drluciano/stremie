import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { C } from '@/constants/theme';

const icon =
  (ios: string, fallback: string) =>
  ({ color }: { color: any }) => (
    <SymbolView name={{ ios, android: fallback, web: fallback } as any} tintColor={color} size={24} />
  );

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.faint,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.border },
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerShadowVisible: false,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('house.fill', 'home') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('square.grid.2x2.fill', 'grid_view') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('magnifyingglass', 'search') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('gearshape.fill', 'settings') }} />
    </Tabs>
  );
}
