import React, { type ReactNode } from "react";
import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, radius } from "../src/theme.ts";
import { tapHaptic } from "../src/sound.ts";
import { BouncyPressable } from "./BouncyPressable.tsx";
import { PText } from "./PText.tsx";

type BtnVariant = "card" | "accent" | "primary" | "dark";

const BTN_BG: Record<BtnVariant, string> = {
  card: colors.paperBtn,
  accent: colors.clay,
  primary: colors.teal,
  dark: colors.walnut,
};
const BTN_INK: Record<BtnVariant, string> = {
  card: colors.ink,
  accent: "#fff8f2",
  primary: "#f5ede2",
  dark: colors.plaqueText,
};

export function Btn({
  label,
  onPress,
  variant = "card",
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
        variant === "card" && styles.btnOutlined,
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

/** Round floating icon button — HUD corners and the menu's music toggle. */
export function IconFab({
  size = 56,
  variant = "paper",
  label,
  onPress,
  children,
}: {
  size?: number;
  variant?: "paper" | "walnut" | "clay";
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <BouncyPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.92}
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={[
        styles.fab,
        { width: size, height: size, borderRadius: size / 2 },
        variant === "paper" && styles.fabPaper,
        variant === "walnut" && styles.fabWalnut,
        variant === "clay" && styles.fabClay,
      ]}
    >
      {children}
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#33302b",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  fabPaper: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.btnBorder,
  },
  fabWalnut: { backgroundColor: colors.walnut },
  fabClay: { backgroundColor: colors.clay },
  btn: {
    borderRadius: radius.btn,
    paddingVertical: 13,
    paddingHorizontal: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#33302b",
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
