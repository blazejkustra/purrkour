/**
 * Purrkour — web shell. App flow: loading -> menu -> (tutorial) ->
 * level intro -> play -> win. Owns the DOM screens, HUD, toasts and
 * persistence wiring; the game itself (rules, scene, input resolution)
 * lives in @purrkour/engine's play session.
 */
import tgpu from "typegpu";
import { LEVELS } from "@purrkour/engine/game/levels.ts";
import {
  cellX,
  cellZ,
  createSession,
  registerGameBatches,
} from "@purrkour/engine/game/session.ts";
import {
  createProgress,
  starsFor,
  TIER_STARS,
  tierOf,
} from "@purrkour/engine/game/progress.ts";
import { TUTORIAL_PAGES } from "@purrkour/engine/game/tutorial.ts";
import { createAudio, type SfxId } from "@purrkour/engine/audio.ts";
import { createRenderer } from "@purrkour/engine/render/renderer.ts";
import type { Cell } from "@purrkour/engine/game/model.ts";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("canvas");

// --- app/session state ---------------------------------------------------------

type Ui = "loading" | "menu" | "tutorial" | "intro" | "play";
let ui: Ui = "loading";

const nowSec = () => performance.now() / 1000;

// --- persistence & audio -------------------------------------------------------

const progress = createProgress(localStorage);
const audio = createAudio(() => new AudioContext());

function refreshMusicButton() {
  el("music").classList.toggle("muted", !progress.musicWanted);
}
/** Every meaningful gesture routes through here: unlocks the context and
 * (first time) starts the loop if the player hasn't muted it. */
function audioGesture() {
  audio.unlock();
  if (progress.musicWanted && !audio.musicOn) audio.startMusic();
}
// music should already be playing in the MENU — autoplay policy just needs
// one gesture, so the very first click/tap anywhere starts it
window.addEventListener("pointerdown", audioGesture);

// --- screens -------------------------------------------------------------------

const SCREENS = ["menu", "tutorial", "intro"] as const;
function showScreen(which: (typeof SCREENS)[number] | null) {
  for (const s of SCREENS) el(s).classList.toggle("hidden", s !== which);
  el("hud").classList.toggle("hidden", which !== null);
}

function showMenu() {
  ui = "menu";
  session.setActive(false);
  el("win").classList.add("hidden");
  buildLevelGrid();
  showScreen("menu");
  el("hud").classList.add("hidden");
}

function buildLevelGrid() {
  el("star-total").textContent =
    `★ ${progress.totalStars()} / ${LEVELS.length * 3}`;
  const grid = el("level-grid");
  grid.innerHTML = "";
  LEVELS.forEach((level, i) => {
    const tier = tierOf(i);
    const b = document.createElement("button");
    const unlocked = progress.isUnlocked(i);
    b.className = `lvl tier-${tier}${unlocked ? "" : " locked"}`;
    b.disabled = !unlocked;
    const s = progress.stars(i);
    b.innerHTML = unlocked
      ? `${i + 1}<span class="lvl-stars">${"★".repeat(s)}${"☆".repeat(3 - s)}</span>`
      : `${i + 1}<span class="lvl-stars need">${TIER_STARS[tier]}★</span>`;
    b.title = unlocked
      ? level.name
      : `Earn ${TIER_STARS[tier]} stars to unlock this row`;
    b.addEventListener("click", () => showIntro(i));
    grid.appendChild(b);
  });
}

function updateLevelHud() {
  el("level-name").textContent = LEVELS[session.levelIndex].name;
  el("par").textContent = `${LEVELS[session.levelIndex].par}`;
}

function loadLevel(i: number) {
  session.loadLevel(i);
  el("win").classList.add("hidden");
  updateLevelHud();
}

function showIntro(i: number) {
  ui = "intro";
  session.setActive(false);
  loadLevel(i); // board renders behind the card
  const level = LEVELS[i];
  el("intro-kicker").textContent = `Level ${i + 1} of ${LEVELS.length}`;
  el("intro-name").textContent = level.name;
  el("intro-text").textContent = level.intro;
  el("intro-par").textContent =
    `Purrfect score: ${level.par} move${level.par > 1 ? "s" : ""}`;
  showScreen("intro");
}

function startPlay() {
  ui = "play";
  session.setActive(true);
  showScreen(null);
  audioGesture();
}

// --- tutorial ------------------------------------------------------------------

let tutPage = 0;
let afterTutorial: (() => void) | null = null;

function showTutorial(page: number, then: (() => void) | null) {
  ui = "tutorial";
  session.setActive(false);
  tutPage = page;
  afterTutorial = then;
  renderTutorial();
  showScreen("tutorial");
}

function renderTutorial() {
  const page = TUTORIAL_PAGES[tutPage];
  el("tut-title").textContent = page.title;
  el("tut-body").textContent = page.body;
  el("tut-dots").innerHTML = TUTORIAL_PAGES.map(
    (_, i) => `<span class="dot${i === tutPage ? " on" : ""}"></span>`,
  ).join("");
  el("tut-back").classList.toggle("hidden", tutPage === 0);
  el("tut-next").textContent =
    tutPage === TUTORIAL_PAGES.length - 1 ? "Let's play" : "Next";
}

el("tut-next").addEventListener("click", () => {
  if (tutPage < TUTORIAL_PAGES.length - 1) {
    tutPage++;
    renderTutorial();
  } else {
    progress.markTutorialSeen();
    const cont = afterTutorial;
    afterTutorial = null;
    if (cont) cont();
    else showMenu();
  }
});
el("tut-back").addEventListener("click", () => {
  if (tutPage > 0) {
    tutPage--;
    renderTutorial();
  }
});

// --- toasts --------------------------------------------------------------------

let toastTimer = 0;
function toast(msg: string, ms = 2600) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.add("hidden"), ms);
}

// --- win celebration -----------------------------------------------------------

const CONFETTI_COLORS = [
  "#d9714e",
  "#f0b64e",
  "#8fb996",
  "#2b6b5f",
  "#e8a58c",
  "#c9a86a",
];
function burstConfetti() {
  const host = el("win");
  for (let i = 0; i < 36; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti";
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    bit.style.animationDelay = `${Math.random() * 0.6}s`;
    bit.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    host.appendChild(bit);
    setTimeout(() => bit.remove(), 3600);
  }
}

// --- boot ----------------------------------------------------------------------

const loadProgress = (frac: number, note: string) => {
  el("load-fill").style.width = `${Math.round(frac * 100)}%`;
  el("loading-note").textContent = note;
};

loadProgress(0.1, "warming up the rug…");
const root = await tgpu.init();
const context = canvas.getContext("webgpu");
if (!context) throw new Error("WebGPU canvas context unavailable");
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device: root.device, format, alphaMode: "premultiplied" });
const renderer = createRenderer({ root, context, surface: canvas, format });
loadProgress(0.35, "brushing the cats…");

registerGameBatches(renderer);
loadProgress(0.85, "watering the plants…");

const session = createSession(renderer, {
  sound: (id: SfxId) => audio[id](),
  onMoves(moves) {
    el("moves").textContent = `${moves}`;
  },
  onWin({ levelIndex, moves, par, hintsUsed }) {
    const starCount = starsFor(par, moves);
    el("win-title").textContent =
      levelIndex === LEVELS.length - 1 ? "CHAMPION NAPPER!" : "PURRFECT!";
    el("win-stars").textContent =
      "★".repeat(starCount) + "☆".repeat(3 - starCount);
    const hintNote =
      hintsUsed > 0 ? ` · ${hintsUsed} hint${hintsUsed > 1 ? "s" : ""}` : "";
    el("win-detail").textContent =
      (moves <= par
        ? `Solved in ${moves} — purrfect!`
        : `Solved in ${moves} (best is ${par})`) + hintNote;
    el("win-next").classList.toggle("hidden", levelIndex >= LEVELS.length - 1);
    if (progress.recordWin(levelIndex, moves)) {
      setTimeout(() => toast("New row of levels unlocked!", 3200), 1200);
    }
    setTimeout(() => {
      el("win").classList.remove("hidden");
      burstConfetti();
      audio.win();
    }, 350);
  },
  onHintShown(minMoves, kind) {
    const what = kind === "cat" ? "cat" : "dog";
    toast(
      `Try the glowing ${what} — ${minMoves} move${minMoves > 1 ? "s" : ""} to go!`,
    );
    startHintCooldown();
  },
  onHintUnavailable() {
    toast("No way to win from here — undo or reset!");
  },
});

// --- input ---------------------------------------------------------------------

canvas.addEventListener("pointermove", (ev) => {
  if (ui !== "play") {
    canvas.style.cursor = "default";
    return;
  }
  session.pointerMove(ev.offsetX, ev.offsetY, nowSec());
  canvas.style.cursor = session.dragging
    ? "grabbing"
    : session.interactiveAt(ev.offsetX, ev.offsetY)
      ? "pointer"
      : "default";
});

canvas.addEventListener("pointerdown", (ev) => {
  if (ui !== "play") return;
  canvas.setPointerCapture(ev.pointerId);
  session.pointerDown(ev.offsetX, ev.offsetY, nowSec());
});

canvas.addEventListener("pointerup", (ev) => {
  session.pointerUp(ev.offsetX, ev.offsetY, nowSec());
});
canvas.addEventListener("pointercancel", () => {
  session.pointerCancel();
});

function doUndo() {
  if (ui !== "play") return;
  if (session.won) el("win").classList.add("hidden");
  session.undo();
}

el("undo").addEventListener("click", doUndo);
el("reset").addEventListener("click", () => loadLevel(session.levelIndex));
// The bulb recharges after each shown hint, so it can't be chain-clicked
// through a whole solution.
const HINT_COOLDOWN_S = 20;
let hintTimer: ReturnType<typeof setInterval> | null = null;

function startHintCooldown() {
  const btn = el("hint") as HTMLButtonElement;
  const readyAt = nowSec() + HINT_COOLDOWN_S;
  btn.disabled = true;
  btn.classList.add("cooling");
  if (hintTimer) clearInterval(hintTimer);
  hintTimer = setInterval(() => {
    const left = readyAt - nowSec();
    if (left <= 0) {
      if (hintTimer) clearInterval(hintTimer);
      hintTimer = null;
      btn.disabled = false;
      btn.classList.remove("cooling");
      btn.style.removeProperty("--cd");
    } else {
      btn.style.setProperty("--cd", `${(left / HINT_COOLDOWN_S) * 100}%`);
    }
  }, 100);
}

el("hint").addEventListener("click", () => session.showHint(nowSec()));
el("music").addEventListener("click", () => {
  audio.unlock();
  const on = audio.toggleMusic();
  progress.setMusicWanted(on);
  refreshMusicButton();
});
refreshMusicButton();
el("menu-btn").addEventListener("click", showMenu);
el("win-menu").addEventListener("click", showMenu);
el("win-retry").addEventListener("click", () => {
  loadLevel(session.levelIndex);
  ui = "play";
  session.setActive(true);
});
el("win-next").addEventListener("click", () =>
  showIntro(Math.min(session.levelIndex + 1, LEVELS.length - 1)),
);
el("intro-go").addEventListener("click", startPlay);
el("intro-menu").addEventListener("click", showMenu);
el("play-btn").addEventListener("click", () => {
  const target = progress.nextCampaignLevel();
  if (!progress.tutorialSeen) showTutorial(0, () => showIntro(target));
  else showIntro(target);
});
el("howto-btn").addEventListener("click", () => showTutorial(0, null));

window.addEventListener("keydown", (ev) => {
  if (ui !== "play") return;
  if (ev.key === "z" || ev.key === "u") doUndo();
  if (ev.key === "r") loadLevel(session.levelIndex);
  if (ev.key === "h") session.showHint(nowSec());
  if (ev.key === "Escape") showMenu();
});

// --- frame loop ----------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
window.addEventListener("resize", resize);
resize();
loadLevel(0);

// QA/debug bridge: lets automation project a cell to viewport coords and
// inspect live state without scraping pixels.
Object.assign(window as object, {
  __purrkour: {
    cellScreen: (cell: Cell, h = 0.3) =>
      renderer.project(cellX(cell), h, cellZ(cell)),
    worldScreen: (x: number, y: number, z: number) => renderer.project(x, y, z),
    state: () => ({
      cats: session.state.cats.map((c) => ({ ...c })),
      dogs: session.state.dogs.map((dg) => ({ ...dg })),
      moves: session.moves,
      selected: session.selected,
      won: session.won,
      level: session.levelIndex,
      ui,
    }),
    loadLevel,
    showIntro,
    showMenu,
    /** QA: jump straight into playing level i, skipping all cards. */
    debugStart: (i: number) => {
      loadLevel(i);
      startPlay();
    },
    showHint: () => session.showHint(nowSec()),
    hint: () => session.hint,
    particles: () => session.particleCount,
  },
});

let lastNow = nowSec();
function frame() {
  const now = nowSec();
  const dt = Math.min(0.05, now - lastNow);
  lastNow = now;
  session.tick(now, dt);
  session.buildScene(now);
  renderer.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// boot complete: fade the loader, land on the menu
loadProgress(1, "ready!");
setTimeout(() => {
  el("loading").classList.add("fade-out");
  setTimeout(() => el("loading").classList.add("hidden"), 500);
  showMenu();
}, 300);
