/** The full-screen cards: menu, tutorial, level intro, win — RN ports of
 * the web app's DOM screens, fed by the shared engine content/progress. */
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { LEVELS } from '@purrkour/engine/game/levels.ts';
import { TIER_STARS, tierOf, type Progress } from '@purrkour/engine/game/progress.ts';
import { TUTORIAL_PAGES } from '@purrkour/engine/game/tutorial.ts';
import { colors } from '../src/theme.ts';
import { Btn, CardScreen } from './ui.tsx';

const logo = require('../assets/splash-icon.png');

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
  return (
    <CardScreen>
      <Image source={logo} style={styles.logo} />
      <Text style={styles.title}>PURRKOUR</Text>
      <Text style={styles.tagline}>
        Parkour for cats — a cozy puzzle about boxes and the jumps in between.
      </Text>
      <Text style={styles.starTotal}>
        ★ {progress.totalStars()} / {LEVELS.length * 3}
      </Text>
      <Btn label="Play" variant="accent" big onPress={onPlay} style={styles.playBtn} />
      <Btn label="How to play" onPress={onHowTo} />
      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
        {LEVELS.map((level, i) => {
          const tier = tierOf(i);
          const unlocked = progress.isUnlocked(i);
          const stars = progress.stars(i);
          const tierBg =
            tier === 1 ? colors.tier1Bg : tier === 2 ? colors.tier2Bg : colors.paper;
          const tierInk =
            tier === 1 ? colors.tier1Ink : tier === 2 ? colors.tier2Ink : colors.ink;
          const starInk =
            tier === 1 ? colors.tier1Star : tier === 2 ? colors.tier2Star : colors.starGold;
          return (
            <Pressable
              key={level.name}
              disabled={!unlocked}
              onPress={() => onLevel(i)}
              style={({ pressed }) => [
                styles.lvl,
                { backgroundColor: unlocked ? tierBg : 'rgba(58, 49, 41, 0.06)' },
                pressed && { transform: [{ translateY: 1 }] },
              ]}
            >
              <Text style={[styles.lvlNum, { color: unlocked ? tierInk : 'rgba(58,49,41,0.32)' }]}>
                {i + 1}
              </Text>
              <Text
                style={[
                  styles.lvlStars,
                  { color: unlocked ? starInk : 'rgba(58,49,41,0.4)' },
                ]}
              >
                {unlocked ? (stars > 0 ? '★'.repeat(stars) : ' ') : `${TIER_STARS[tier]}★`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </CardScreen>
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
      <Text style={styles.tutTitle}>{p.title}</Text>
      <Text style={styles.tutBody}>{p.body}</Text>
      <View style={styles.dots}>
        {TUTORIAL_PAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.cardButtons}>
        {page > 0 && <Btn label="Back" onPress={onBack} />}
        <Btn
          label={page === TUTORIAL_PAGES.length - 1 ? "Let's play" : 'Next'}
          variant="accent"
          onPress={onNext}
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
      <Text style={styles.kicker}>
        LEVEL {levelIndex + 1} OF {LEVELS.length}
      </Text>
      <Text style={styles.introName}>{level.name}</Text>
      <Text style={styles.tutBody}>{level.intro}</Text>
      <Text style={styles.introPar}>
        Purrfect score: {level.par} move{level.par > 1 ? 's' : ''}
      </Text>
      <View style={styles.cardButtons}>
        <Btn label="Menu" onPress={onMenu} />
        <Btn label="Let's go" variant="accent" big onPress={onGo} />
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
      <Text style={styles.winTitle}>{win.title}</Text>
      <Text style={styles.winStars}>
        {'★'.repeat(win.stars)}
        {'☆'.repeat(3 - win.stars)}
      </Text>
      <Text style={styles.winDetail}>{win.detail}</Text>
      <View style={styles.cardButtons}>
        <Btn label="Menu" onPress={onMenu} />
        <Btn label="Retry" onPress={onRetry} />
        {win.hasNext && <Btn label="Next Level" variant="primary" onPress={onNext} />}
      </View>
    </CardScreen>
  );
}

export function Toast({ message, bottom }: { message: string; bottom: number }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      exiting={FadeOut.duration(200)}
      style={[styles.toast, { bottom }]}
      pointerEvents="none"
    >
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 96, height: 96, marginBottom: 6 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: 7, color: colors.ink },
  tagline: {
    marginTop: 8,
    marginBottom: 14,
    maxWidth: 320,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.inkSoft,
  },
  starTotal: {
    marginBottom: 14,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.starGold,
  },
  playBtn: { marginBottom: 10, alignSelf: 'center' },
  gridScroll: { marginTop: 18, alignSelf: 'stretch', flexGrow: 0 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'center',
  },
  lvl: {
    width: '17.5%',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
    shadowColor: '#33302b',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  lvlNum: { fontSize: 17, fontWeight: '700' },
  lvlStars: { fontSize: 11, fontWeight: '800', letterSpacing: 1, minHeight: 14 },
  tutTitle: { fontSize: 25, fontWeight: '800', letterSpacing: 1, color: colors.ink },
  tutBody: {
    marginTop: 14,
    maxWidth: 380,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 25,
    color: colors.inkSoft,
  },
  dots: { flexDirection: 'row', gap: 8, marginTop: 20 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: 'rgba(58, 49, 41, 0.18)',
  },
  dotOn: { backgroundColor: colors.terracotta },
  cardButtons: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.terracotta,
  },
  introName: { marginTop: 6, fontSize: 30, fontWeight: '800', color: colors.ink },
  introPar: { marginTop: 14, fontSize: 15, fontWeight: '700', color: colors.ink },
  winTitle: { fontSize: 30, fontWeight: '800', letterSpacing: 3, color: colors.ink },
  winStars: { fontSize: 36, marginTop: 8, letterSpacing: 6, color: colors.amber },
  winDetail: { marginTop: 10, fontSize: 16, fontWeight: '600', color: colors.inkSoft },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.ink,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 16,
    maxWidth: '88%',
    zIndex: 10,
  },
  toastText: { color: colors.paper, fontWeight: '600', fontSize: 15, textAlign: 'center' },
});
