/**
 * Audio + haptics routing. The audio engine itself is the shared procedural
 * one from @purrkour/engine (react-native-audio-api implements the Web Audio
 * slice it needs). Haptics ride the same SFX events via react-native-pulsar
 * presets — every sound the session emits is offered to the motor too.
 */
import { AudioContext, AudioManager } from 'react-native-audio-api';
import { HapticSupport, Presets, Settings as PulsarSettings } from 'react-native-pulsar';
import {
  createAudio,
  type AudioContextLike,
  type SfxId,
} from '@purrkour/engine/audio.ts';

try {
  // game audio keeps playing with the ringer switch on silent; the motor
  // must stay allowed while the audio session is active
  AudioManager.setAudioSessionOptions({ iosCategory: 'playback', iosAllowHaptics: true });
} catch {
  // older audio-api or missing native module — defaults are fine
}

export const audio = createAudio(
  () => new AudioContext() as unknown as AudioContextLike,
);

let hapticsOn = false;
try {
  hapticsOn = PulsarSettings.getHapticsSupportLevel() !== HapticSupport.NO_SUPPORT;
  // presets can carry a sound layer on some platforms — audio is ours alone
  PulsarSettings.enableSound(false);
  PulsarSettings.enableCache(true);
  PulsarSettings.enableHaptics(hapticsOn);
} catch {
  // native module unavailable — haptics just no-op
}

const HAPTIC: Record<SfxId, () => void> = {
  meow: Presets.catPaw, // picking up a cat, obviously
  select: Presets.System.selection,
  match: Presets.plink,
  wrong: Presets.System.notificationError,
  win: Presets.fanfare,
};

/** Light tick for every UI button press (quizit-style tactility). */
export function tapHaptic() {
  if (hapticsOn) {
    try {
      Presets.System.impactLight();
    } catch {
      hapticsOn = false;
    }
  }
}

/** Route a session SFX to speaker + motor. */
export function playSfx(id: SfxId) {
  audio[id]();
  if (hapticsOn) {
    try {
      HAPTIC[id]();
    } catch {
      hapticsOn = false;
    }
  }
}
