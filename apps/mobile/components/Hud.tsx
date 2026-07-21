/**
 * In-game HUD, mobile-game grammar: round icon buttons in the top corners
 * (home, sound), a centered walnut plaque naming the level, and floating
 * action buttons in the bottom corners — undo/reset as a left cluster, the
 * clay hint bulb alone on the right. All chrome sits on walnut/paper
 * surfaces so it keeps contrast over the warm room.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEVELS } from '@purrkour/engine/game/levels.ts';
import { colors } from '../src/theme.ts';
import { tapHaptic } from '../src/sound.ts';
import { BouncyPressable } from './BouncyPressable.tsx';
import { PText } from './PText.tsx';
import { HintIcon, HomeIcon, MusicIcon, ResetIcon, UndoIcon } from './icons.tsx';

/** Round floating icon button. */
function IconFab({
  size = 56,
  variant = 'paper',
  label,
  onPress,
  children,
}: {
  size?: number;
  variant?: 'paper' | 'walnut' | 'clay';
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
        variant === 'paper' && styles.fabPaper,
        variant === 'walnut' && styles.fabWalnut,
        variant === 'clay' && styles.fabClay,
      ]}
    >
      {children}
    </BouncyPressable>
  );
}

export function Hud({
  levelIndex,
  moves,
  musicOn,
  onMenu,
  onUndo,
  onReset,
  onHint,
  onMusic,
}: {
  levelIndex: number;
  moves: number;
  musicOn: boolean;
  onMenu: () => void;
  onUndo: () => void;
  onReset: () => void;
  onHint: () => void;
  onMusic: () => void;
}) {
  const insets = useSafeAreaInsets();
  const level = LEVELS[levelIndex];
  const top = 10 + insets.top;
  const bottom = 20 + insets.bottom;
  const side = 16;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* top bar: corner icon buttons + centered level plaque */}
      <View style={[styles.topRow, { top }]} pointerEvents="box-none">
        <View style={styles.plaque}>
          <PText weight="extraBold" style={styles.levelName} numberOfLines={1}>
            {levelIndex + 1} · {level.name}
          </PText>
          <PText weight="semiBold" style={styles.stats}>
            Moves {moves} · Par {level.par}
          </PText>
        </View>
      </View>
      <View style={[styles.slot, { top, left: side + insets.left }]}>
        <IconFab size={48} variant="walnut" label="Menu" onPress={onMenu}>
          <HomeIcon size={24} color={colors.plaqueText} />
        </IconFab>
      </View>
      <View style={[styles.slot, { top, right: side + insets.right }]}>
        <IconFab
          size={48}
          variant="walnut"
          label={musicOn ? 'Music on' : 'Music off'}
          onPress={onMusic}
        >
          <MusicIcon
            size={24}
            color={musicOn ? colors.plaqueText : 'rgba(255, 243, 221, 0.55)'}
            muted={!musicOn}
            slashColor={colors.terracotta}
          />
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
      <View style={[styles.bottomRight, { bottom, right: side + insets.right }]}>
        <IconFab size={68} variant="clay" label="Show hint" onPress={onHint}>
          <HintIcon size={34} color="#fff6ea" />
        </IconFab>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  slot: { position: 'absolute' },
  plaque: {
    backgroundColor: colors.walnut,
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2b2016',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    maxWidth: 230,
  },
  levelName: {
    fontSize: 18,
    letterSpacing: 0.2,
    color: colors.plaqueText,
  },
  stats: {
    marginTop: -4,
    fontSize: 13.5,
    color: colors.plaqueSoft,
  },
  bottomLeft: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 12,
  },
  bottomRight: { position: 'absolute' },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#33302b',
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
});
