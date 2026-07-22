/**
 * Purrkour — mobile shell. Owns the WebGPU canvas + frame loop, the screen
 * state machine (loading -> menu -> tutorial/intro -> play -> win), touch
 * routing into the shared engine session, and toast/HUD chrome. The game
 * itself lives in @purrkour/engine.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Image, PixelRatio, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, type CanvasRef } from "react-native-webgpu";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import type { TgpuRoot } from "typegpu";
import { createRenderer } from "@purrkour/engine/render/renderer.ts";
import {
  cellX,
  cellZ,
  createSession,
  registerGameBatches,
  type Session,
} from "@purrkour/engine/game/session.ts";
import { createProgress, starsFor } from "@purrkour/engine/game/progress.ts";
import { LEVELS } from "@purrkour/engine/game/levels.ts";
import { storage } from "../src/storage.ts";
import { audio, playSfx } from "../src/sound.ts";
import { colors } from "../src/theme.ts";
import { Hud } from "./Hud.tsx";
import { PText } from "./PText.tsx";
import {
  IntroScreen,
  MenuScreen,
  Toast,
  TutorialScreen,
  WinScreen,
  type WinInfo,
} from "./screens.tsx";

const progress = createProgress(storage);
const logo = require("../assets/splash-icon.png");

type Ui = "loading" | "menu" | "tutorial" | "intro" | "play";

// Hermes provides performance.now(); the DOM-less lib config doesn't type it.
declare const performance: { now(): number };

const nowSec = () => performance.now() / 1000;

/** Every meaningful gesture routes through here, mirroring the web shell:
 * resume the context and (first time) start the loop unless muted. */
function audioGesture() {
  audio.unlock();
  if (progress.musicWanted && !audio.musicOn) audio.startMusic();
}

/** Rendered only while playing — puzzling takes staring time. */
function KeepAwakeWhilePlaying() {
  useKeepAwake();
  return null;
}

/** The web page's warm lamp glow (top-right) + soft edge vignette, painted
 * over the opaque canvas instead of behind a transparent one. */
function CozyLight() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="lamp" cx="78%" cy="10%" rx="72%" ry="55%">
          <Stop offset="0" stopColor="#ffd896" stopOpacity={0.4} />
          <Stop offset="1" stopColor="#ffd896" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="vignette" cx="50%" cy="45%" rx="85%" ry="75%">
          <Stop offset="0.55" stopColor="#604028" stopOpacity={0} />
          <Stop offset="1" stopColor="#604028" stopOpacity={0.2} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#lamp)" />
      <Rect width="100%" height="100%" fill="url(#vignette)" />
    </Svg>
  );
}

export function GameScreen({ root }: { root: TgpuRoot }) {
  const insets = useSafeAreaInsets();
  const canvasRef = useRef<CanvasRef>(null);
  const booting = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const rafRef = useRef(0);
  const foreground = useRef(true);
  // live layout size in dp — the renderer reads it for picking each call
  const surface = useRef({ clientWidth: 1, clientHeight: 1 }).current;
  // the native canvas whose width/height set the drawing-buffer size (px)
  const nativeCanvas = useRef<{ width: number; height: number } | null>(null);

  const [ui, setUi] = useState<Ui>("loading");
  const [fatal, setFatal] = useState<string | null>(null);
  const [levelIndex, setLevelIndex] = useState(0);
  const [moves, setMoves] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [win, setWin] = useState<WinInfo | null>(null);
  const [tutPage, setTutPage] = useState(0);
  const afterTutorial = useRef<(() => void) | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, ms = 2600) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), ms);
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      foreground.current = s === "active";
    });
    return () => {
      sub.remove();
      cancelAnimationFrame(rafRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Boot once the surface has a layout (getBoundingClientRect is valid then).
  const onLayout = (event: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => {
    const { width, height } = event.nativeEvent.layout;
    surface.clientWidth = Math.max(1, width);
    surface.clientHeight = Math.max(1, height);
    // like web's resize(): drawing buffer = layout dp × device pixel ratio,
    // else the swapchain stays at 1x and the scene upscales blurry
    const dpr = PixelRatio.get();
    if (nativeCanvas.current) {
      nativeCanvas.current.width = Math.max(1, Math.round(width * dpr));
      nativeCanvas.current.height = Math.max(1, Math.round(height * dpr));
    }
    if (booting.current || !canvasRef.current) return;
    booting.current = true;
    try {
      const context = canvasRef.current.getContext("webgpu");
      if (!context) throw new Error("WebGPU canvas context unavailable");
      const canvas = (
        context as unknown as { canvas: { width: number; height: number } }
      ).canvas;
      canvas.width = Math.max(1, Math.round(surface.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(surface.clientHeight * dpr));
      nativeCanvas.current = canvas;
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device: root.device, format });
      const renderer = createRenderer({
        root,
        context,
        surface,
        format,
        // opaque warm paper — the page gradient's midpoint (web clears to
        // transparent over CSS; here CozyLight paints the glow on top)
        clearColor: { r: 0.957, g: 0.89, b: 0.769, a: 1 },
      });
      registerGameBatches(renderer);
      const session = createSession(renderer, {
        sound: playSfx,
        onMoves: setMoves,
        onWin({ levelIndex: level, moves: m, par, hintsUsed }) {
          const rowUnlocked = progress.recordWin(level, m);
          const hintNote =
            hintsUsed > 0
              ? ` · ${hintsUsed} hint${hintsUsed > 1 ? "s" : ""}`
              : "";
          setTimeout(() => {
            setWin({
              title:
                level === LEVELS.length - 1 ? "CHAMPION NAPPER!" : "PURRFECT!",
              stars: starsFor(par, m),
              detail:
                (m <= par
                  ? `Solved in ${m} — purrfect!`
                  : `Solved in ${m} (best is ${par})`) + hintNote,
              hasNext: level < LEVELS.length - 1,
            });
            playSfx("win");
            if (rowUnlocked) showToast("New row of levels unlocked!", 3200);
          }, 350);
        },
        onHintShown(minMoves, kind) {
          showToast(
            `Try the glowing ${kind} — ${minMoves} move${minMoves > 1 ? "s" : ""} to go!`,
          );
        },
        onHintUnavailable() {
          showToast("No way to win from here — undo or reset!");
        },
      });
      session.loadLevel(0);
      sessionRef.current = session;

      // QA/debug bridge (mirrors the web build's window.__purrkour): lets
      // automation project a board cell to normalized viewport coords and
      // inspect live state via the Metro debugger instead of scraping pixels.
      (globalThis as unknown as Record<string, unknown>).__purrkour = {
        cellScreen: (cell: number, h = 0.3) =>
          renderer.project(cellX(cell), h, cellZ(cell)),
        worldScreen: (x: number, y: number, z: number) =>
          renderer.project(x, y, z),
        state: () => ({
          cats: session.state.cats.map((c) => ({ ...c })),
          dogs: session.state.dogs.map((dg) => ({ ...dg })),
          moves: session.moves,
          selected: session.selected,
          won: session.won,
          level: session.levelIndex,
        }),
        hint: () => session.hint,
        particles: () => session.particleCount,
      };

      let last = nowSec();
      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        const now = nowSec();
        if (!foreground.current) {
          last = now;
          return; // backgrounded apps must not submit GPU work
        }
        const dt = Math.min(0.05, now - last);
        last = now;
        session.tick(now, dt);
        session.buildScene(now);
        renderer.frame(now);
      };
      rafRef.current = requestAnimationFrame(tick);

      setMusicOn(progress.musicWanted);
      if (progress.musicWanted) audio.startMusic();
      setUi("menu");
    } catch (err) {
      console.error(err instanceof Error ? (err.stack ?? err.message) : err);
      setFatal(err instanceof Error ? err.message : String(err));
    }
  };

  // --- touch routing (Manual gesture: raw touches, never activates, so it
  // --- can't steal from the RN Pressables layered above) -----------------------
  const trackedId = useRef<number | null>(null);
  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .onTouchesDown((e) => {
          audioGesture();
          if (trackedId.current !== null) return;
          const t = e.changedTouches[0];
          trackedId.current = t.id;
          sessionRef.current?.pointerDown(t.x, t.y, nowSec());
        })
        .onTouchesMove((e) => {
          const t = e.changedTouches.find((c) => c.id === trackedId.current);
          if (t) sessionRef.current?.pointerMove(t.x, t.y, nowSec());
        })
        .onTouchesUp((e) => {
          const t = e.changedTouches.find((c) => c.id === trackedId.current);
          if (t) {
            trackedId.current = null;
            sessionRef.current?.pointerUp(t.x, t.y, nowSec());
          }
        })
        .onTouchesCancelled(() => {
          trackedId.current = null;
          sessionRef.current?.pointerCancel();
        }),
    [],
  );

  // --- navigation ----------------------------------------------------------------

  const session = () => sessionRef.current!;

  const toMenu = () => {
    setWin(null);
    sessionRef.current?.setActive(false);
    setUi("menu");
  };
  const showIntro = (i: number) => {
    session().loadLevel(i); // board renders behind the card
    setLevelIndex(i);
    setWin(null);
    session().setActive(false);
    setUi("intro");
  };
  const startPlay = () => {
    session().setActive(true);
    setUi("play");
    audioGesture();
  };
  const openTutorial = (then: (() => void) | null) => {
    afterTutorial.current = then;
    setTutPage(0);
    setUi("tutorial");
  };
  const tutorialNext = () => {
    if (tutPage < 3) {
      setTutPage(tutPage + 1);
      return;
    }
    progress.markTutorialSeen();
    const cont = afterTutorial.current;
    afterTutorial.current = null;
    if (cont) cont();
    else toMenu();
  };

  const doUndo = () => {
    if (sessionRef.current?.won) setWin(null);
    sessionRef.current?.undo();
  };

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.fill} onLayout={onLayout} />
      </GestureDetector>
      <CozyLight />

      {ui === "play" && <KeepAwakeWhilePlaying />}
      {ui === "play" && (
        <Hud
          levelIndex={levelIndex}
          moves={moves}
          musicOn={musicOn}
          onMenu={toMenu}
          onUndo={doUndo}
          onReset={() => session().reset()}
          onHint={() => session().showHint(nowSec())}
          onMusic={() => {
            audio.unlock();
            const on = audio.toggleMusic();
            progress.setMusicWanted(on);
            setMusicOn(on);
          }}
        />
      )}

      {ui === "menu" && (
        <MenuScreen
          progress={progress}
          onPlay={() => {
            const target = progress.nextCampaignLevel();
            if (!progress.tutorialSeen) openTutorial(() => showIntro(target));
            else showIntro(target);
          }}
          onHowTo={() => openTutorial(null)}
          onLevel={showIntro}
        />
      )}
      {ui === "tutorial" && (
        <TutorialScreen
          page={tutPage}
          onBack={() => setTutPage(Math.max(0, tutPage - 1))}
          onNext={tutorialNext}
        />
      )}
      {ui === "intro" && (
        <IntroScreen levelIndex={levelIndex} onMenu={toMenu} onGo={startPlay} />
      )}
      {win !== null && (
        <WinScreen
          win={win}
          onMenu={toMenu}
          onRetry={() => {
            session().loadLevel(levelIndex);
            setWin(null);
            session().setActive(true);
            setUi("play");
          }}
          onNext={() => showIntro(Math.min(levelIndex + 1, LEVELS.length - 1))}
        />
      )}

      {toastMsg !== null && (
        <Toast message={toastMsg} bottom={106 + insets.bottom} />
      )}

      {ui === "loading" && !fatal && (
        <View style={[styles.overlay, styles.center]}>
          <Image source={logo} style={styles.loadLogo} />
          <PText weight="extraBold" style={styles.loadTitle}>
            PURRKOUR
          </PText>
          <PText weight="semiBold" style={styles.loadNote}>
            warming up the rug…
          </PText>
        </View>
      )}
      {fatal !== null && (
        <View style={[styles.overlay, styles.center]}>
          <PText weight="extraBold" style={styles.fatalTitle}>
            WebGPU unavailable
          </PText>
          <PText weight="semiBold" style={styles.loadNote}>
            {fatal}
          </PText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paper,
    zIndex: 5,
  },
  center: { alignItems: "center", justifyContent: "center" },
  loadLogo: { width: 110, height: 110, marginBottom: 8 },
  loadTitle: {
    fontSize: 34,
    letterSpacing: 5,
    lineHeight: 46,
    textShadowColor: colors.titleShadow,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 1,
  },
  loadNote: {
    marginTop: 8,
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  fatalTitle: {
    fontSize: 24,
    letterSpacing: 2,
  },
});
