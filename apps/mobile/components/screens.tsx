/** Menu title screen + the modal cards (tutorial, level intro, win) — fed by
 * the shared engine content/progress. The menu is a full-screen layout over
 * the live 3D room: title block up top, a paper level sheet docked below. */
import React from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEVELS } from "@purrkour/engine/game/levels.ts";
import {
  TIER_STARS,
  tierOf,
  type Progress,
} from "@purrkour/engine/game/progress.ts";
import { TUTORIAL_PAGES } from "@purrkour/engine/game/tutorial.ts";
import { colors, radius } from "../src/theme.ts";
import { tapHaptic } from "../src/sound.ts";
import { BouncyPressable } from "./BouncyPressable.tsx";
import { PText } from "./PText.tsx";
import { Btn, CardScreen } from "./ui.tsx";

const logo = require("../assets/splash-icon.png");

export function MenuScreen({
  progress,
  onPlay,
  onHowTo,
  onLevel,
}: {
  progress: Progress;
  onPlay: () => void;
  onHowTo: () => void;
  onLevel: (i: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* warm scrim: keeps the room a soft backdrop, not the main attraction */}
      <Animated.View
        entering={FadeIn.duration(300)}
        style={styles.menuScrim}
        pointerEvents="none"
      />
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[styles.menuTop, { paddingTop: insets.top + 18 }]}
        pointerEvents="box-none"
      >
        <Image source={logo} style={styles.logo} />
        <PText weight="extraBold" style={styles.title}>
          PURRKOUR
        </PText>
        <View style={styles.starChip}>
          <PText weight="extraBold" style={styles.starChipText}>
            ★ {progress.totalStars()} / {LEVELS.length * 3}
          </PText>
        </View>
        <Btn
          label="Play"
          variant="accent"
          big
          onPress={onPlay}
          style={styles.playBtn}
        />
        <Btn label="How to play" small onPress={onHowTo} />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(320).easing(Easing.out(Easing.cubic))}
        style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}
      >
        <View style={styles.sheetHeader}>
          <PText weight="extraBold" style={styles.sheetTitle}>
            Levels
          </PText>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {LEVELS.map((level, i) => {
            const tier = tierOf(i);
            const unlocked = progress.isUnlocked(i);
            const stars = progress.stars(i);
            const tierBg =
              tier === 1
                ? colors.tier1Bg
                : tier === 2
                  ? colors.tier2Bg
                  : colors.tier0Bg;
            const tierInk =
              tier === 1
                ? colors.tier1Ink
                : tier === 2
                  ? colors.tier2Ink
                  : colors.ink;
            const starInk =
              tier === 1
                ? colors.tier1Ink
                : tier === 2
                  ? colors.tier2Ink
                  : colors.starOnCream;
            return (
              <BouncyPressable
                key={level.name}
                disabled={!unlocked}
                scaleTo={0.92}
                onPress={() => {
                  tapHaptic();
                  onLevel(i);
                }}
                style={[
                  styles.lvl,
                  unlocked
                    ? { backgroundColor: tierBg }
                    : { backgroundColor: colors.lockedBg, shadowOpacity: 0 },
                ]}
              >
                <PText
                  weight="extraBold"
                  style={[
                    styles.lvlNum,
                    { color: unlocked ? tierInk : colors.lockedInk },
                  ]}
                >
                  {i + 1}
                </PText>
                <PText
                  weight="bold"
                  style={[
                    styles.lvlStars,
                    { color: unlocked ? starInk : colors.lockedInk },
                  ]}
                >
                  {unlocked
                    ? stars > 0
                      ? "★".repeat(stars)
                      : " "
                    : `${TIER_STARS[tier]}★`}
                </PText>
              </BouncyPressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export function TutorialScreen({
  page,
  onBack,
  onNext,
}: {
  page: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const p = TUTORIAL_PAGES[page];
  return (
    <CardScreen>
      <PText weight="extraBold" style={styles.kicker}>
        HOW TO PLAY
      </PText>
      <PText weight="extraBold" style={styles.cardTitle}>
        {p.title}
      </PText>
      <PText weight="medium" style={styles.cardBody}>
        {p.body}
      </PText>
      <View style={styles.dots}>
        {TUTORIAL_PAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.cardButtons}>
        {page > 0 && (
          <Btn label="Back" onPress={onBack} style={styles.btnFlex} />
        )}
        <Btn
          label={page === TUTORIAL_PAGES.length - 1 ? "Let's play" : "Next"}
          variant="accent"
          onPress={onNext}
          style={styles.btnFlexWide}
        />
      </View>
    </CardScreen>
  );
}

export function IntroScreen({
  levelIndex,
  onMenu,
  onGo,
}: {
  levelIndex: number;
  onMenu: () => void;
  onGo: () => void;
}) {
  const level = LEVELS[levelIndex];
  return (
    <CardScreen>
      <PText weight="extraBold" style={styles.kicker}>
        LEVEL {levelIndex + 1} OF {LEVELS.length}
      </PText>
      <PText weight="extraBold" style={styles.cardTitle}>
        {level.name}
      </PText>
      <PText weight="medium" style={styles.cardBody}>
        {level.intro}
      </PText>
      <View style={styles.parChip}>
        <PText weight="bold" style={styles.parChipText}>
          Purrfect score: {level.par} move{level.par > 1 ? "s" : ""}
        </PText>
      </View>
      <View style={styles.cardButtons}>
        <Btn label="Menu" onPress={onMenu} style={styles.btnFlex} />
        <Btn
          label="Let's go"
          variant="accent"
          onPress={onGo}
          style={styles.btnFlexWide}
        />
      </View>
    </CardScreen>
  );
}

export interface WinInfo {
  title: string;
  stars: number;
  detail: string;
  hasNext: boolean;
}

export function WinScreen({
  win,
  onMenu,
  onRetry,
  onNext,
}: {
  win: WinInfo;
  onMenu: () => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  return (
    <CardScreen>
      <PText weight="extraBold" style={styles.winTitle}>
        {win.title}
      </PText>
      <PText style={styles.winStars}>
        {"★".repeat(win.stars)}
        {"☆".repeat(3 - win.stars)}
      </PText>
      <PText weight="semiBold" style={styles.winDetail}>
        {win.detail}
      </PText>
      {win.hasNext && (
        <Btn
          label="Next Level"
          variant="accent"
          big
          onPress={onNext}
          style={styles.winNext}
        />
      )}
      <View style={styles.cardButtons}>
        <Btn label="Menu" onPress={onMenu} style={styles.btnFlex} />
        <Btn label="Retry" onPress={onRetry} style={styles.btnFlex} />
      </View>
    </CardScreen>
  );
}

export function Toast({
  message,
  bottom,
}: {
  message: string;
  bottom: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      exiting={FadeOut.duration(200)}
      style={[styles.toast, { bottom }]}
      pointerEvents="none"
    >
      <PText weight="semiBold" style={styles.toastText}>
        {message}
      </PText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // --- menu title screen -------------------------------------------------------
  menuScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(249, 240, 225, 0.78)",
  },
  menuTop: {
    flex: 1,
    alignItems: "center",
  },
  logo: { width: 92, height: 92, marginBottom: 2 },
  title: {
    fontSize: 40,
    letterSpacing: 4,
    lineHeight: 54,
    textShadowColor: colors.titleShadow,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 1,
  },
  starChip: {
    backgroundColor: colors.starChip,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 22,
    shadowColor: "#33302b",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  starChipText: {
    fontSize: 17,
    letterSpacing: 1,
    lineHeight: 26,
  },
  playBtn: {
    minWidth: 224,
    marginBottom: 12,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "46%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: 14,
    paddingHorizontal: 18,
    shadowColor: "#2b2016",
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  sheetHeader: {
    alignItems: "center",
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 21,
    lineHeight: 28,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    paddingBottom: 8,
  },
  lvl: {
    width: "17.5%",
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: "center",
    shadowColor: "#33302b",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  lvlNum: { fontSize: 20, lineHeight: 27 },
  lvlStars: {
    fontSize: 12.5,
    letterSpacing: 0.5,
    lineHeight: 17,
    minHeight: 17,
  },

  // --- modal cards -------------------------------------------------------------
  kicker: {
    fontSize: 14,
    letterSpacing: 3,
    color: colors.clay,
  },
  cardTitle: {
    marginTop: 2,
    fontSize: 30,
    lineHeight: 40,
    textAlign: "center",
    textShadowColor: colors.titleShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 1,
  },
  cardBody: {
    marginTop: 10,
    maxWidth: 380,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 26,
    color: colors.inkSoft,
  },
  dots: { flexDirection: "row", gap: 8, marginTop: 22 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(46, 38, 32, 0.18)",
  },
  dotOn: { backgroundColor: colors.clay },
  cardButtons: {
    marginTop: 22,
    flexDirection: "row",
    gap: 12,
    alignSelf: "stretch",
  },
  btnFlex: { flex: 1 },
  btnFlexWide: { flex: 1.6 },
  parChip: {
    marginTop: 14,
    backgroundColor: colors.paperBtn,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.btnBorder,
  },
  parChipText: { fontSize: 15, lineHeight: 22 },
  winTitle: {
    fontSize: 32,
    letterSpacing: 2,
    lineHeight: 44,
    textAlign: "center",
    textShadowColor: colors.titleShadow,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 1,
  },
  winStars: {
    fontSize: 38,
    marginTop: 2,
    letterSpacing: 6,
    color: colors.amber,
    lineHeight: 48,
  },
  winDetail: {
    marginTop: 4,
    fontSize: 17,
    color: colors.inkSoft,
    textAlign: "center",
  },
  winNext: { marginTop: 22, alignSelf: "stretch" },
  toast: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: colors.ink,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 20,
    maxWidth: "88%",
    zIndex: 10,
  },
  toastText: { color: colors.paper, fontSize: 16, textAlign: "center" },
});
