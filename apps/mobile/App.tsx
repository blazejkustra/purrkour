// Install native WebGPU eagerly so navigator.gpu exists before tgpu.init().
import 'react-native-webgpu';
import {
  Baloo2_500Medium,
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/baloo-2';
import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import tgpu, { type TgpuRoot } from 'typegpu';
import { GameScreen } from './components/GameScreen.tsx';
import { colors } from './src/theme.ts';

export default function App() {
  const [fontsLoaded] = useFonts({
    Baloo2_500Medium,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
  });
  const [root, setRoot] = useState<TgpuRoot | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    tgpu
      .init({
        device: {
          // Dawn is NOT thread-safe without this toggle, and react-native-
          // webgpu's async event pump touches the device off the JS thread.
          // Cost is one uncontended mutex per API call.
          dawnToggles: { enabledToggles: ['implicit_device_synchronization'] },
        },
      })
      .then(
        (r) => {
          if (!disposed) setRoot(r);
        },
        (err) => {
          console.error(err instanceof Error ? (err.stack ?? err.message) : err);
          if (!disposed) setInitError(err instanceof Error ? err.message : String(err));
        },
      );
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={[styles.fill, { backgroundColor: colors.paper }]}>
          <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
          {root && fontsLoaded && <GameScreen root={root} />}
          {initError !== null && (
            <View style={styles.fatal}>
              <Text style={styles.fatalTitle}>WebGPU unavailable</Text>
              <Text style={styles.fatalNote}>{initError}</Text>
            </View>
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fatal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fatalTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 16,
  },
  fatalNote: {
    color: colors.inkSoft,
    fontSize: 14,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
});
