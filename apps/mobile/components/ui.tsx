import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, ZoomIn } from 'react-native-reanimated';
import { colors } from '../src/theme.ts';

type BtnVariant = 'card' | 'accent' | 'primary';

const BTN_BG: Record<BtnVariant, string> = {
  card: colors.card,
  accent: colors.terracotta,
  primary: colors.teal,
};
const BTN_INK: Record<BtnVariant, string> = {
  card: colors.ink,
  accent: '#fff8f2',
  primary: '#f0faf6',
};

export function Btn({
  label,
  onPress,
  variant = 'card',
  big = false,
  small = false,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  big?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: BTN_BG[variant] },
        big && styles.btnBig,
        small && styles.btnSmall,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          { color: BTN_INK[variant] },
          big && styles.btnTextBig,
          small && styles.btnTextSmall,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The web's .card: warm rounded panel popping in over a dimmed backdrop. */
export function CardScreen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen} pointerEvents="box-none">
      <Animated.View
        entering={ZoomIn.duration(220).easing(Easing.out(Easing.cubic))}
        style={styles.card}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(58, 45, 33, 0.32)',
    zIndex: 3,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '90%',
    maxWidth: 560,
    maxHeight: '88%',
    shadowColor: '#33281e',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 20,
    shadowColor: '#33302b',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    alignItems: 'center',
  },
  btnPressed: { transform: [{ translateY: 1 }], shadowOpacity: 0.1 },
  btnBig: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 18 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnTextBig: { fontSize: 19 },
  btnTextSmall: { fontSize: 14 },
});
