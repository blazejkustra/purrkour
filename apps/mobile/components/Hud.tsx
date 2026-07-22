/**
 * In-game HUD, mobile-game grammar: a round paper home button in the top-left
 * corner, a centered washi-label plaque naming the level — a tilted paper
 * card "taped" at its corners — and floating action buttons in the bottom
 * corners: undo/reset as a left cluster, the clay hint bulb alone on the
 * right. (Music toggle lives on the menu.)
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEVELS } from "@purrkour/engine/game/levels.ts";
import { colors } from "../src/theme.ts";
import { PText } from "./PText.tsx";
import { IconFab } from "./ui.tsx";
import { HintIcon, HomeIcon, ResetIcon, UndoIcon } from "./icons.tsx";

export function Hud({
  levelIndex,
  moves,
  onMenu,
  onUndo,
  onReset,
  onHint,
}: {
  levelIndex: number;
  moves: number;
  onMenu: () => void;
  onUndo: () => void;
  onReset: () => void;
  onHint: () => void;
}) {
  const insets = useSafeAreaInsets();
  const level = LEVELS[levelIndex];
  const top = 10 + insets.top;
  const bottom = 20 + insets.bottom;
  const side = 16;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* top bar: corner icon buttons + centered washi level label */}
      <View style={[styles.topRow, { top }]} pointerEvents="box-none">
        <View style={styles.plaque}>
          <View style={[styles.tape, styles.tapeL]} />
          <View style={[styles.tape, styles.tapeR]} />
          <PText weight="extraBold" style={styles.levelName} numberOfLines={1}>
            {level.name}
          </PText>
          <PText weight="semiBold" style={styles.stats}>
            Moves {moves} · Par {level.par}
          </PText>
        </View>
      </View>
      <View style={[styles.slot, { top, left: side + insets.left }]}>
        <IconFab size={48} label="Menu" onPress={onMenu}>
          <HomeIcon size={24} color={colors.ink} />
        </IconFab>
      </View>
      {/* bottom corners: undo/reset cluster left, hint bulb right */}
      <View style={[styles.bottomLeft, { bottom, left: side + insets.left }]}>
        <IconFab label="Undo move" onPress={onUndo}>
          <UndoIcon size={26} color={colors.ink} />
        </IconFab>
        <IconFab label="Reset level" onPress={onReset}>
          <ResetIcon size={26} color={colors.ink} />
        </IconFab>
      </View>
      <View
        style={[styles.bottomRight, { bottom, right: side + insets.right }]}
      >
        <IconFab size={68} variant="clay" label="Show hint" onPress={onHint}>
          <HintIcon size={34} color="#fff6ea" />
        </IconFab>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  slot: { position: "absolute" },
  /* washi label: tilted paper card, "taped" to the screen at its corners */
  plaque: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.btnBorder,
    borderRadius: 20,
    paddingTop: 7,
    paddingBottom: 3,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 240,
    transform: [{ rotate: "2deg" }],
    shadowColor: "#2b2016",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tape: {
    position: "absolute",
    top: -7,
    width: 36,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(46, 38, 32, 0.08)",
  },
  tapeL: { left: -10, transform: [{ rotate: "-35deg" }] },
  tapeR: { right: -10, transform: [{ rotate: "35deg" }] },
  levelName: {
    fontSize: 19,
    letterSpacing: 0.2,
    lineHeight: 25,
    color: colors.ink,
  },
  stats: {
    marginTop: -2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  bottomLeft: {
    position: "absolute",
    flexDirection: "row",
    gap: 12,
  },
  bottomRight: { position: "absolute" },
});
