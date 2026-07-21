/** In-game HUD: level info top-left, play controls docked bottom-center
 * (the web app's phone layout). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEVELS } from '@purrkour/engine/game/levels.ts';
import { colors } from '../src/theme.ts';
import { Btn } from './ui.tsx';

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
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, { top: 12 + insets.top, left: 14 + insets.left }]}>
        <Btn label="Menu" small onPress={onMenu} />
        <View>
          <Text style={styles.levelName}>
            {levelIndex + 1}. {level.name}
          </Text>
          <Text style={styles.stats}>
            Moves {moves} · Par {level.par}
          </Text>
        </View>
      </View>
      <View style={[styles.controls, { bottom: 16 + insets.bottom }]}>
        <Btn label="Undo" onPress={onUndo} />
        <Btn label="Reset" onPress={onReset} />
        <Btn label="Hint" variant="accent" onPress={onHint} />
        <Btn
          label="♪"
          small
          onPress={onMusic}
          style={[styles.musicBtn, !musicOn && styles.musicMuted]}
          textStyle={!musicOn ? styles.musicMutedText : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  levelName: { fontSize: 19, fontWeight: '700', color: colors.ink },
  stats: { marginTop: 1, fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  controls: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  musicBtn: { minWidth: 44 },
  musicMuted: { opacity: 0.45 },
  musicMutedText: { textDecorationLine: 'line-through' },
});
