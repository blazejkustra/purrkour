import React from "react";
import { Text, type TextProps } from "react-native";
import { colors, font, type FontWeight } from "../src/theme.ts";

interface Props extends TextProps {
  weight?: FontWeight;
}

/** Baloo 2 text, ink by default — the app's only text primitive. */
export function PText({ weight = "bold", style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: font[weight], color: colors.ink }, style]}
    />
  );
}
