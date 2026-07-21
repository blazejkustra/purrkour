import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, ZoomIn } from 'react-native-reanimated';
import { colors, radius } from '../src/theme.ts';
import { tapHaptic } from '../src/sound.ts';
import { BouncyPressable } from './BouncyPressable.tsx';
import { PText } from './PText.tsx';

type BtnVariant = 'card' | 'accent' | 'primary' | 'dark';

const BTN_BG: Record<BtnVariant, string> = {
  card: colors.paperBtn,
  accent: colors.clay,
  primary: colors.teal,
  dark: colors.walnut,
};
const BTN_INK: Record<BtnVariant, string> = {
  card: colors.ink,
  accent: '#fff8f2',
  primary: '#f5ede2',
  dark: colors.plaqueText,
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
    <BouncyPressable
      accessibilityRole="button"
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={[
        styles.btn,
        { backgroundColor: BTN_BG[variant] },
        variant === 'card' && styles.btnOutlined,
        big && styles.btnBig,
        small && styles.btnSmall,
        style,
      ]}
    >
      <PText
        weight="extraBold"
        style={[
          styles.btnText,
          { color: BTN_INK[variant] },
          big && styles.btnTextBig,
          small && styles.btnTextSmall,
          textStyle,
        ]}
      >
        {label}
      </PText>
    </BouncyPressable>
  );
}

/** The web's .card: warm rounded panel appearing over a dimmed backdrop. */
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
    backgroundColor: 'rgba(46, 36, 26, 0.38)',
    zIndex: 3,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '92%',
    maxWidth: 560,
    maxHeight: '88%',
    shadowColor: '#2b2016',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  btn: {
    borderRadius: radius.btn,
    paddingVertical: 13,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#33302b',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  btnOutlined: {
    borderWidth: 1,
    borderColor: colors.btnBorder,
  },
  btnBig: { paddingVertical: 16, paddingHorizontal: 46, borderRadius: 26 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 18 },
  btnText: { fontSize: 18, letterSpacing: 0.3 },
  btnTextBig: { fontSize: 21, letterSpacing: 0.5 },
  btnTextSmall: { fontSize: 16 },
});
