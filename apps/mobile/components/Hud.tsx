/**
 * In-game HUD, mobile-game grammar: a round paper home button in the top-left
 * corner, a centered washi-label plaque naming the level — a tilted paper
 * card "taped" at its corners — and floating action buttons in the bottom
 * corners: undo/reset as a left cluster, the clay hint bulb alone on the
 * right. (Music toggle lives on the menu.)
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEVELS } from "@purrkour/engine/game/levels.ts";
import { colors } from "../src/theme.ts";
import { openAdInspector } from "../src/ads.ts";
import { PText } from "./PText.tsx";
import { IconFab } from "./ui.tsx";
import { HintIcon, HomeIcon, ResetIcon, UndoIcon } from "./icons.tsx";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The web bulb's recharge sweep: a dark pie over the fab whose angle is the
 * remaining cooldown fraction, draining clockwise from 12 o'clock. */
function CooldownSweep({
  size,
  progress,
}: {
  size: number;
  progress: SharedValue<number>;
}) {
  const r = size / 2;
  const animatedProps = useAnimatedProps(() => {
    const frac = Math.min(0.9999, Math.max(0, progress.value));
    const angle = frac * 2 * Math.PI;
    const x = r + r * Math.sin(angle);
    const y = r - r * Math.cos(angle);
    const large = angle > Math.PI ? 1 : 0;
    return { d: `M ${r} ${r} L ${r} 0 A ${r} ${r} 0 ${large} 1 ${x} ${y} Z` };
  });
  return (
    <Svg
      width={size}
      height={size}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <AnimatedPath
        animatedProps={animatedProps}
        fill="rgba(43, 32, 22, 0.45)"
      />
    </Svg>
  );
}

export function Hud({
  levelIndex,
  moves,
  hintCooldown,
  hintCdProgress,
  onMenu,
  onUndo,
  onReset,
  onHint,
}: {
  levelIndex: number;
  moves: number;
  /** Seconds until the hint bulb is ready again (0 = ready). */
  hintCooldown: number;
  /** Remaining cooldown as 1 → 0 — drives the recharge sweep. */
  hintCdProgress: SharedValue<number>;
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
        <IconFab
          size={68}
          variant="clay"
          label={hintCooldown > 0 ? "Hint recharging" : "Show hint"}
          disabled={hintCooldown > 0}
          style={hintCooldown > 0 && styles.hintCooling}
          onPress={onHint}
          // dev tool: long-press opens Google's Ad Inspector to see why an
          // ad request filled or failed on this exact device
          onLongPress={__DEV__ ? openAdInspector : undefined}
        >
          <HintIcon size={34} color="#fff6ea" />
          {hintCooldown > 0 && (
            <CooldownSweep size={68} progress={hintCdProgress} />
          )}
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
  /* recharging bulb: pressed clay under the draining sweep */
  hintCooling: {
    backgroundColor: colors.clayPressed,
    shadowOpacity: 0,
  },
});
