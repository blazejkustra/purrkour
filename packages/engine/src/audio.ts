/**
 * Procedural audio — no files, just oscillators and gain envelopes.
 *
 * Music: a sparse 4-bar music-box loop in C major pentatonic at 76 BPM
 * (pentatonic never lands on a tense interval, so it can loop for an hour
 * without grating; the rests are what keep it calm). A triangle bass note
 * anchors each bar. Notes are scheduled just-in-time against
 * AudioContext.currentTime by a 150ms setInterval with a 0.4s horizon, so
 * the loop is gapless and survives tab throttling.
 *
 * SFX: 1–3 tone blips, fast linear attack (kills clicks) + exponential
 * decay. "Cat-ness" is a downward frequency slide — instantly meow-like.
 * All volumes deliberately low (0.03–0.15).
 *
 * Platform-agnostic: the app injects an AudioContext factory (the browser's
 * AudioContext on web, react-native-audio-api's on mobile). The structural
 * types below are the tiny slice of the Web Audio API this engine uses.
 */

// module-local declares: both DOM and react-native type sets provide these
// globals, but the DOM-less engine typecheck does not.
declare function setInterval(handler: () => void, ms: number): number;
declare function clearInterval(id: number): void;

interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(value: number, time: number, constant: number): unknown;
}

interface AudioNodeLike {
  connect(target: unknown): unknown;
}

interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(time: number): void;
  stop(time: number): void;
}

interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface AudioContextLike {
  currentTime: number;
  state: string;
  destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void>;
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

const BPM = 76;
const EIGHTH = 60 / BPM / 2;

// C major pentatonic: C D E G A. Melody around C5, sparse — well over half
// the slots are rests. 4 bars x 8 eighths. (null = rest)
// bar 1: a curious upward peek     bar 2: answer, settling
// bar 3: wander a little higher    bar 4: come home, long rest
const MELODY: (number | null)[] = [
  72,
  null,
  76,
  null,
  79,
  null,
  null,
  74,
  null,
  null,
  76,
  null,
  72,
  null,
  null,
  null,
  81,
  null,
  79,
  null,
  76,
  null,
  74,
  null,
  72,
  null,
  null,
  67,
  null,
  null,
  null,
  null,
];
/** One triangle bass note per bar: C3, A2, G2, C3. */
const BASS = [48, 45, 43, 48];

export function createAudio(createContext: () => AudioContextLike) {
  let ctx: AudioContextLike | null = null;
  let master: GainLike | null = null;
  let musicBus: GainLike | null = null;
  let musicOn = false;
  let timer: number | null = null;
  let nextTime = 0;
  let slot = 0;

  function ensure(): AudioContextLike {
    if (!ctx) {
      ctx = createContext();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 1;
      musicBus.connect(master);
    }
    return ctx;
  }

  interface ToneOpts {
    freq: number;
    dur: number;
    type?: string;
    vol?: number;
    when?: number;
    /** Glide to this frequency over the tone's duration (meow-maker). */
    slide?: number;
    bus?: GainLike | null;
  }

  function tone({
    freq,
    dur,
    type = "sine",
    vol = 0.08,
    when,
    slide,
    bus,
  }: ToneOpts) {
    const ac = ensure();
    const t0 = when ?? ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    // fast linear attack so the waveform never starts mid-cycle (clicks),
    // then an exponential decay tail
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(bus ?? master ?? ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // --- background music --------------------------------------------------------

  function scheduleSlot(when: number, s: number) {
    const note = MELODY[s % MELODY.length];
    if (note !== null) {
      tone({
        freq: midiHz(note),
        dur: EIGHTH * 2.6,
        type: "triangle",
        vol: 0.055,
        when,
        bus: musicBus,
      });
      // a whisper of the octave above gives the music-box shimmer
      tone({
        freq: midiHz(note + 12),
        dur: EIGHTH * 1.6,
        type: "sine",
        vol: 0.018,
        when,
        bus: musicBus,
      });
    }
    if (s % 8 === 0) {
      const bass = BASS[(s / 8) % BASS.length];
      tone({
        freq: midiHz(bass),
        dur: EIGHTH * 7,
        type: "triangle",
        vol: 0.045,
        when,
        bus: musicBus,
      });
    }
  }

  function tick() {
    const ac = ensure();
    // schedule everything falling inside the lookahead horizon
    while (nextTime < ac.currentTime + 0.4) {
      scheduleSlot(nextTime, slot);
      slot++;
      nextTime += EIGHTH;
    }
  }

  function startMusic() {
    const ac = ensure();
    if (musicOn) return;
    musicOn = true;
    musicBus?.gain.setTargetAtTime(1, ac.currentTime, 0.1);
    nextTime = ac.currentTime + 0.05;
    slot = 0;
    timer = setInterval(tick, 150);
    tick();
  }

  function stopMusic() {
    if (!musicOn) return;
    musicOn = false;
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (ctx && musicBus)
      musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }

  /** Returns the new state. */
  function toggleMusic(): boolean {
    if (musicOn) stopMusic();
    else startMusic();
    return musicOn;
  }

  /** Call from any user gesture — browsers gate audio behind one. */
  function unlock() {
    const ac = ensure();
    if (ac.state === "suspended") void ac.resume();
  }

  // --- sound effects -----------------------------------------------------------

  const now = () => ensure().currentTime;

  /** Two-tone downward slide — the shape of a meow. */
  function meow() {
    const t = now();
    tone({
      freq: 640,
      slide: 430,
      dur: 0.16,
      type: "sine",
      vol: 0.07,
      when: t,
    });
    tone({
      freq: 520,
      slide: 320,
      dur: 0.22,
      type: "sine",
      vol: 0.06,
      when: t + 0.11,
    });
  }

  /** Low soft rumble — two close sawtooths beat against each other. */
  function purr() {
    const t = now();
    tone({ freq: 52, dur: 0.55, type: "sawtooth", vol: 0.04, when: t });
    tone({ freq: 57, dur: 0.55, type: "sawtooth", vol: 0.035, when: t });
  }

  /** Rising 3-note pentatonic arpeggio — something clicked into place. */
  function match() {
    const t = now();
    [72, 76, 79].forEach((m, i) =>
      tone({
        freq: midiHz(m),
        dur: 0.16,
        type: "triangle",
        vol: 0.09,
        when: t + i * 0.07,
      }),
    );
  }

  /** Gentle low wobble — "not quite", never harsh. */
  function wrong() {
    const t = now();
    tone({
      freq: 185,
      slide: 160,
      dur: 0.22,
      type: "sine",
      vol: 0.07,
      when: t,
    });
    tone({
      freq: 150,
      slide: 135,
      dur: 0.26,
      type: "sine",
      vol: 0.06,
      when: t + 0.12,
    });
  }

  /** Triumphant "ta-da-da-DAA!" — three quick stabs up the C major triad
   * into a held full chord with glitter on top. Unmistakably a win. */
  function win() {
    const t = now();
    // pickup stabs: G4 -> C5 -> E5
    [67, 72, 76].forEach((m, i) => {
      tone({
        freq: midiHz(m),
        dur: 0.13,
        type: "triangle",
        vol: 0.1,
        when: t + i * 0.11,
      });
    });
    // the DAA: full C major chord, held
    for (const m of [72, 76, 79, 84]) {
      tone({
        freq: midiHz(m),
        dur: 0.75,
        type: "triangle",
        vol: 0.06,
        when: t + 0.33,
      });
    }
    // glitter raining over the chord
    [84, 88, 91].forEach((m, i) => {
      tone({
        freq: midiHz(m),
        dur: 0.12,
        type: "sine",
        vol: 0.05,
        when: t + 0.42 + i * 0.08,
      });
    });
  }

  /** Tiny pop for picking up / selecting a piece. */
  function select() {
    tone({ freq: 880, slide: 1180, dur: 0.07, type: "sine", vol: 0.05 });
  }

  return {
    unlock,
    startMusic,
    stopMusic,
    toggleMusic,
    get musicOn() {
      return musicOn;
    },
    meow,
    purr,
    match,
    wrong,
    win,
    select,
  };
}

export type GameAudio = ReturnType<typeof createAudio>;

/** The SFX ids a play session emits — apps route them into GameAudio
 * (and, on mobile, into haptics). */
export type SfxId = "meow" | "select" | "match" | "wrong" | "win";
