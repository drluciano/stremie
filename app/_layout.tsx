import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { C } from '@/constants/theme';
import { SettingsProvider, useSettings } from '@/lib/settings';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { anchor: '(tabs)' };

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent, text: C.text, border: C.border },
};

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <Nav />
        </ThemeProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

function Nav() {
  const { loaded } = useSettings();
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;
  return (
    <Stack screenOptions={{ headerTintColor: C.text, headerStyle: { backgroundColor: C.bg }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="title/[type]/[id]" options={{ headerTransparent: true, title: '' }} />
      <Stack.Screen name="streams" options={{ title: 'Streams', presentation: 'modal' }} />
      <Stack.Screen name="player" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}
