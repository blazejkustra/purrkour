/**
 * Cat Jump — game shell. App flow: loading -> menu -> (tutorial) ->
 * level intro -> play -> win. Owns input (cell picking, selection,
 * legal-target clicks), move animation, HUD, hints and persistence.
 * Rules live in game/model.ts; drawing in render/renderer.ts.
 */
import {
  type Cell,
  type GameState,
  type Move,
  N,
  catMoves,
  cellAt,
  col,
  createState,
  dogCells,
  dogMoves,
  dogTrackCells,
  isWon,
  row,
  undo,
  applyMove,
} from './game/model.ts';
import { LEVELS } from './game/levels.ts';
import { solve } from './game/solver.ts';
import { createAudio } from './audio.ts';
import { createRenderer, type InstanceSpec } from './render/renderer.ts';
import {
  cardboardBoxMesh,
  catMesh,
  particleMesh,
  discMesh,
  corgiMesh,
  dogMesh,
  foliageMesh,
  potMesh,
  tileMesh,
  trayMesh,
  yarnMesh,
  type Rgb,
} from './render/shapes.ts';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('canvas');

// --- board metrics -------------------------------------------------------------

const TILE_H = 0.18;
const RAISED_H = 0.34;
const cellX = (c: Cell) => col(c) - 2;
const cellZ = (c: Cell) => row(c) - 2;

const CAT_BODY: Record<string, Rgb> = {
  red: [0.95, 0.42, 0.4],
  blue: [0.42, 0.66, 0.96],
  violet: [0.66, 0.52, 0.88],
  yellow: [0.98, 0.8, 0.42],
};

// Cozy living-room palette: walnut tray on a rust-bordered rug, warm cream
// carpet tiles, clay dog runners, amber/coral accents. Cats stay colorful.
const TILE_A: [number, number, number] = [0.97, 0.93, 0.85];
const TILE_B: [number, number, number] = [0.91, 0.85, 0.73];
const TILE_RAISED: [number, number, number] = [0.88, 0.6, 0.46];
const TRAY: [number, number, number] = [0.44, 0.32, 0.24];
const RUG_BORDER: [number, number, number] = [0.71, 0.4, 0.31];
const RUG_INNER: [number, number, number] = [0.93, 0.79, 0.66];
const PAD_GLOW: [number, number, number] = [1.0, 0.78, 0.4];
const HINT_PINK: [number, number, number] = [0.95, 0.45, 0.42];
const WHITE: [number, number, number] = [1, 1, 1];

// --- app/session state ---------------------------------------------------------

type Ui = 'loading' | 'menu' | 'tutorial' | 'intro' | 'play';
let ui: Ui = 'loading';

interface Selection {
  kind: 'cat' | 'dog';
  id: number;
}

interface Anim {
  move: Move;
  start: number;
  dur: number;
  /** Drag-drop: animate from this world position instead of the from-cell. */
  from?: { x: number; y: number; z: number };
}

/** Live drag of a cat/dog (starts on press, activates past a threshold). */
interface Drag {
  kind: 'cat' | 'dog';
  id: number;
  active: boolean;
  wasSelected: boolean;
  startPx: number;
  startPy: number;
  wx: number;
  wz: number;
  /** Recent world positions for release-velocity estimation (fling). */
  trail: { t: number; x: number; z: number }[];
}
let drag: Drag | null = null;

/** World-space velocity over the drag's last ~120ms. */
function dragVelocity(d: Drag): [number, number] {
  const trail = d.trail;
  if (trail.length < 2) return [0, 0];
  const last = trail[trail.length - 1];
  let ref = trail[0];
  for (const s of trail) {
    if (last.t - s.t <= 0.12) {
      ref = s;
      break;
    }
  }
  const dt = last.t - ref.t;
  if (dt < 0.016) return [0, 0];
  return [(last.x - ref.x) / dt, (last.z - ref.z) / dt];
}

/** Forgiving drop resolution: the release doesn't need to hit the target
 * cell — closeness, drag direction, and fling velocity all vote. Essential
 * for touch, where precise drops are hard. */
function resolveDropTarget(d: Drag): Move | undefined {
  const map = legalTargets();
  if (map.size === 0) return undefined;
  let origin: { x: number; z: number };
  if (d.kind === 'cat') {
    const cat = state.cats[d.id];
    origin = { x: cellX(cat.cell), z: cellZ(cat.cell) };
  } else {
    const dog = state.dogs[d.id];
    const [c1] = dogCells(dog);
    origin = {
      x: cellX(c1) + (dog.axis === 'h' ? 0.5 : 0),
      z: cellZ(c1) + (dog.axis === 'v' ? 0.5 : 0),
    };
  }
  const rx = d.wx - origin.x;
  const rz = d.wz - origin.z;
  const rLen = Math.hypot(rx, rz);
  const [vx, vz] = dragVelocity(d);
  const speed = Math.hypot(vx, vz);
  let best: Move | undefined;
  let bestScore = 0;
  for (const [cell, m] of map) {
    const tx = cellX(cell) - origin.x;
    const tz = cellZ(cell) - origin.z;
    const tLen = Math.hypot(tx, tz) || 1;
    // (a) released close to the target cell — the strongest signal
    const near = 1 - Math.hypot(d.wx - cellX(cell), d.wz - cellZ(cell)) / 0.85;
    // (b) dragged decisively TOWARD it (direction + at least 30% of the way)
    const dirR = rLen > 0.35 ? (rx * tx + rz * tz) / (rLen * tLen) : -1;
    const progress = (rx * tx + rz * tz) / (tLen * tLen);
    const dragScore = dirR > 0.72 && progress > 0.3 ? dirR : -1;
    // (c) flung toward it at release
    const dirV = speed > 2.5 ? (vx * tx + vz * tz) / (speed * tLen) : -1;
    const flingScore = dirV > 0.72 ? dirV : -1;
    const score = Math.max(near > 0 ? 1 + near : -1, dragScore, flingScore);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

let levelIndex = 0;
let state: GameState = createState(LEVELS[0]);
let track = dogTrackCells(state);
let selected: Selection | null = null;
let anim: Anim | null = null;
let won = false;
/** Active hint: first move of an optimal line from the current position. */
let hint: { move: Move; until: number } | null = null;
let hintsUsed = 0;

const topY = (cell: Cell) => (track.has(cell) ? RAISED_H : TILE_H);

function loadLevel(i: number) {
  levelIndex = i;
  state = createState(LEVELS[i]);
  track = dogTrackCells(state);
  selected = null;
  anim = null;
  won = false;
  hint = null;
  hintsUsed = 0;
  el('win').classList.add('hidden');
  updateHud();
}

function updateHud() {
  el('level-name').textContent = `${levelIndex + 1}. ${LEVELS[levelIndex].name}`;
  el('moves').textContent = `${state.history.length}`;
  el('par').textContent = `${LEVELS[levelIndex].par}`;
}

// --- persistence ---------------------------------------------------------------

const BEST_KEY = 'catjump.best';
const TUTORIAL_KEY = 'catjump.tutorialSeen';
const MUSIC_KEY = 'catjump.music';

const audio = createAudio();
const musicWanted = () => localStorage.getItem(MUSIC_KEY) !== '0';
function refreshMusicButton() {
  el('music').classList.toggle('muted', !musicWanted());
}
/** Every meaningful gesture routes through here: unlocks the context and
 * (first time) starts the loop if the player hasn't muted it. */
function audioGesture() {
  audio.unlock();
  if (musicWanted() && !audio.musicOn) audio.startMusic();
}
const loadBest = (): Record<number, number> => {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const best = loadBest();

const stars = (i: number) =>
  best[i] === undefined ? 0 : best[i] <= LEVELS[i].par ? 3 : best[i] <= LEVELS[i].par + 2 ? 2 : 1;
const totalStars = () => LEVELS.reduce((sum, _, i) => sum + stars(i), 0);

/** Rocket-League-style tiers: the first two rows are open to everyone,
 * later rows unlock on TOTAL star count (not level order). */
const TIER_STARS = [0, 12, 26]; // levels 1-10 | 11-15 | 16-20
const tierOf = (i: number) => (i < 10 ? 0 : i < 15 ? 1 : 2);
const isUnlocked = (i: number) => totalStars() >= TIER_STARS[tierOf(i)];

function recordWin(moves: number) {
  const unlockedBefore = LEVELS.filter((_, i) => isUnlocked(i)).length;
  if (best[levelIndex] === undefined || moves < best[levelIndex]) best[levelIndex] = moves;
  localStorage.setItem(BEST_KEY, JSON.stringify(best));
  const unlockedAfter = LEVELS.filter((_, i) => isUnlocked(i)).length;
  if (unlockedAfter > unlockedBefore) {
    setTimeout(() => toast('New row of levels unlocked!', 3200), 1200);
  }
}

// --- screens -------------------------------------------------------------------

const SCREENS = ['menu', 'tutorial', 'intro'] as const;
function showScreen(which: (typeof SCREENS)[number] | null) {
  for (const s of SCREENS) el(s).classList.toggle('hidden', s !== which);
  el('hud').classList.toggle('hidden', which !== null);
}

function showMenu() {
  ui = 'menu';
  el('win').classList.add('hidden');
  buildLevelGrid();
  showScreen('menu');
  el('hud').classList.add('hidden');
}

function buildLevelGrid() {
  el('star-total').textContent = `★ ${totalStars()} / ${LEVELS.length * 3}`;
  const grid = el('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const tier = tierOf(i);
    const b = document.createElement('button');
    const unlocked = isUnlocked(i);
    b.className = `lvl tier-${tier}${unlocked ? '' : ' locked'}`;
    b.disabled = !unlocked;
    const s = stars(i);
    b.innerHTML = unlocked
      ? `${i + 1}<span class="lvl-stars">${s > 0 ? '★'.repeat(s) : ''}</span>`
      : `${i + 1}<span class="lvl-stars need">${TIER_STARS[tier]}★</span>`;
    b.title = unlocked ? level.name : `Earn ${TIER_STARS[tier]} stars to unlock this row`;
    b.addEventListener('click', () => showIntro(i));
    grid.appendChild(b);
  });
}

/** First unlocked level that isn't solved yet (or the last level). */
function nextCampaignLevel(): number {
  for (let i = 0; i < LEVELS.length; i++) {
    if (isUnlocked(i) && best[i] === undefined) return i;
  }
  return LEVELS.length - 1;
}

function showIntro(i: number) {
  ui = 'intro';
  loadLevel(i); // board renders behind the card
  const level = LEVELS[i];
  el('intro-kicker').textContent = `Level ${i + 1} of ${LEVELS.length}`;
  el('intro-name').textContent = level.name;
  el('intro-text').textContent = level.intro;
  el('intro-par').textContent = `Purrfect score: ${level.par} move${level.par > 1 ? 's' : ''}`;
  showScreen('intro');
}

function startPlay() {
  ui = 'play';
  showScreen(null);
  audioGesture();
}

// --- tutorial ------------------------------------------------------------------

const TUTORIAL_PAGES = [
  {
    title: "Cats don't walk",
    body: 'A cat moves ONLY by jumping over things — plants, dogs, other cats, any unbroken line of them — and lands on the first free square after. Never a single step. Walking is for dogs.',
  },
  {
    title: 'The box is home',
    body: 'Get every cat into a box to win. If it fits, it sits. A cat in a box becomes an obstacle too (a very smug one) — and can hop back out if the plan requires it.',
  },
  {
    title: 'Dogs slide',
    body: "Dogs snooze across two squares and slide along their clay runners, one square at a time. They can't jump and can't turn — just another obstacle in a cat's life. Occasionally a useful one.",
  },
  {
    title: 'Stuck?',
    body: 'Undo takes back a move, Reset starts the level over, and Hint shows the next best move. Match the purrfect score for three stars!',
  },
];
let tutPage = 0;
let afterTutorial: (() => void) | null = null;

function showTutorial(page: number, then: (() => void) | null) {
  ui = 'tutorial';
  tutPage = page;
  afterTutorial = then;
  renderTutorial();
  showScreen('tutorial');
}

function renderTutorial() {
  const page = TUTORIAL_PAGES[tutPage];
  el('tut-title').textContent = page.title;
  el('tut-body').textContent = page.body;
  el('tut-dots').innerHTML = TUTORIAL_PAGES.map(
    (_, i) => `<span class="dot${i === tutPage ? ' on' : ''}"></span>`,
  ).join('');
  el('tut-back').classList.toggle('hidden', tutPage === 0);
  el('tut-next').textContent = tutPage === TUTORIAL_PAGES.length - 1 ? "Let's play" : 'Next';
}

el('tut-next').addEventListener('click', () => {
  if (tutPage < TUTORIAL_PAGES.length - 1) {
    tutPage++;
    renderTutorial();
  } else {
    localStorage.setItem(TUTORIAL_KEY, '1');
    const cont = afterTutorial;
    afterTutorial = null;
    if (cont) cont();
    else showMenu();
  }
});
el('tut-back').addEventListener('click', () => {
  if (tutPage > 0) {
    tutPage--;
    renderTutorial();
  }
});

// --- toasts & hints ------------------------------------------------------------

let toastTimer = 0;
function toast(msg: string, ms = 2600) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.add('hidden'), ms);
}

/** The cell a hinted move visibly ENTERS (dog forward moves enter the cell
 * past the old far end, same mapping as legalTargets' click cells). */
function hintTargetCell(m: Move): Cell {
  if (m.kind === 'cat') return m.to;
  const step = state.dogs[m.id].axis === 'h' ? 1 : N;
  return m.to < m.from ? m.to : m.to + step;
}

function showHint() {
  if (ui !== 'play' || anim || won) return;
  const sol = solve(state);
  if (!sol || sol.line.length === 0) {
    toast('No way to win from here — undo or reset!');
    audio.wrong();
    return;
  }
  const move = sol.line[0];
  hintsUsed++;
  selected = { kind: move.kind, id: move.id };
  hint = { move, until: performance.now() / 1000 + 3 };
  const what = move.kind === 'cat' ? 'cat' : 'dog';
  toast(`Try the glowing ${what} — ${sol.minMoves} move${sol.minMoves > 1 ? 's' : ''} to go!`);
}

// --- moves & win ---------------------------------------------------------------

/** Legal moves for the current selection, mapped by the CLICKABLE cell. */
function legalTargets(): Map<Cell, Move> {
  const map = new Map<Cell, Move>();
  if (!selected || anim || won || ui !== 'play') return map;
  if (selected.kind === 'cat') {
    for (const m of catMoves(state, selected.id)) map.set(m.to, m);
  } else {
    const dog = state.dogs[selected.id];
    const step = dog.axis === 'h' ? 1 : N;
    for (const m of dogMoves(state, selected.id)) {
      // clickable cell = the newly entered cell (back -> new anchor,
      // forward -> the cell past the old far end)
      map.set(m.to < m.from ? m.to : m.to + step, m);
    }
  }
  return map;
}

function startMove(m: Move, now: number, from?: { x: number; y: number; z: number }) {
  selected = null;
  hint = null;
  const dur = from ? (m.kind === 'cat' ? 0.22 : 0.16) : m.kind === 'cat' ? 0.42 : 0.28;
  anim = from ? { move: m, start: now, dur, from } : { move: m, start: now, dur };
  if (m.kind === 'cat' && !from) puffAt(m.from, 5); // take-off kick of dust
}

// --- particles -----------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: [number, number, number];
  spin: number;
  gravity: number;
}
const particles: Particle[] = [];
const MAX_PARTICLES = 140;

const DUST: [number, number, number] = [0.93, 0.87, 0.76];
const SPARK_COLORS: [number, number, number][] = [
  [0.95, 0.45, 0.42],
  [0.96, 0.75, 0.32],
  [0.56, 0.75, 0.58],
  [0.48, 0.65, 0.92],
  [0.75, 0.58, 0.9],
];

function spawnBurst(
  x: number,
  y: number,
  z: number,
  count: number,
  opts: {
    colors?: [number, number, number][];
    speed?: number;
    up?: number;
    life?: number;
    size?: number;
    gravity?: number;
  } = {},
) {
  const colors = opts.colors ?? [DUST];
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (opts.speed ?? 0.9) * (0.5 + Math.random() * 0.8);
    const life = (opts.life ?? 0.45) * (0.7 + Math.random() * 0.6);
    particles.push({
      x,
      y: y + 0.05,
      z,
      vx: Math.cos(a) * sp,
      vy: (opts.up ?? 0.9) * (0.6 + Math.random() * 0.8),
      vz: Math.sin(a) * sp,
      life,
      maxLife: life,
      size: (opts.size ?? 0.07) * (0.7 + Math.random() * 0.7),
      color: colors[Math.floor(Math.random() * colors.length)],
      spin: (Math.random() - 0.5) * 12,
      gravity: opts.gravity ?? -3.2,
    });
  }
}

const cellTop = (c: Cell) => topY(c);
const puffAt = (c: Cell, n = 8) => spawnBurst(cellX(c), cellTop(c), cellZ(c), n);
const confettiAt = (c: Cell) =>
  spawnBurst(cellX(c), cellTop(c) + 0.35, cellZ(c), 16, {
    colors: SPARK_COLORS,
    speed: 1.1,
    up: 2.2,
    life: 0.8,
    size: 0.06,
    gravity: -4.2,
  });

function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.02) {
      p.y = 0.02;
      p.vy = 0;
      p.vx *= 0.8;
      p.vz *= 0.8;
    }
  }
}

/** The two yarn balls on the rug — clickable toys. */
const YARNS: { x: number; z: number; baseRot: number; s: number; tint: [number, number, number] }[] = [
  { x: 3.5, z: 0.7, baseRot: 2.2, s: 1, tint: [0.93, 0.7, 0.34] },
  { x: -3.55, z: 1.0, baseRot: 5.1, s: 0.85, tint: [0.56, 0.66, 0.86] },
];
const yarnPoke = [-10, -10];

/** Off-board click on a yarn ball? Returns its index, or -1. */
function yarnAt(px: number, py: number): number {
  const hit = renderer.pickGround(px, py, -0.33);
  if (!hit) return -1;
  for (const [i, y] of YARNS.entries()) {
    if (Math.hypot(hit[0] - y.x, hit[1] - y.z) < 0.55 * y.s) return i;
  }
  return -1;
}

function pokeYarn(i: number, now: number) {
  yarnPoke[i] = now;
  audio.select();
  const y = YARNS[i];
  spawnBurst(y.x, -0.15, y.z, 9, {
    colors: [y.tint, [0.98, 0.95, 0.88]],
    speed: 0.8,
    up: 1.7,
    life: 0.5,
    size: 0.05,
    gravity: -4,
  });
}

const CONFETTI_COLORS = ['#d9714e', '#f0b64e', '#8fb996', '#2b6b5f', '#e8a58c', '#c9a86a'];
function burstConfetti() {
  const host = el('win');
  for (let i = 0; i < 36; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    bit.style.animationDelay = `${Math.random() * 0.6}s`;
    bit.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    host.appendChild(bit);
    setTimeout(() => bit.remove(), 3600);
  }
}

function finishMove() {
  if (!anim) return;
  const m = anim.move;
  applyMove(state, m);
  anim = null;
  updateHud();
  if (m.kind === 'cat') {
    const inBox = state.boxes.includes(m.to) && !state.cappedBoxes.includes(m.to);
    if (inBox) {
      confettiAt(m.to); // a cat found its box!
      audio.match();
    } else puffAt(m.to, 9);
  }
  if (isWon(state)) {
    won = true;
    const moves = state.history.length;
    const par = LEVELS[levelIndex].par;
    const starCount = moves <= par ? 3 : moves <= par + 2 ? 2 : 1;
    el('win-title').textContent =
      levelIndex === LEVELS.length - 1 ? 'CHAMPION NAPPER!' : 'PURRFECT!';
    el('win-stars').textContent = '★'.repeat(starCount) + '☆'.repeat(3 - starCount);
    const hintNote = hintsUsed > 0 ? ` · ${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}` : '';
    el('win-detail').textContent =
      (moves <= par ? `Solved in ${moves} — purrfect!` : `Solved in ${moves} (best is ${par})`) +
      hintNote;
    el('win-next').classList.toggle('hidden', levelIndex >= LEVELS.length - 1);
    recordWin(moves);
    setTimeout(() => {
      el('win').classList.remove('hidden');
      burstConfetti();
      audio.win();
    }, 350);
  }
}

// --- boot ----------------------------------------------------------------------

const loadProgress = (frac: number, note: string) => {
  el('load-fill').style.width = `${Math.round(frac * 100)}%`;
  el('loading-note').textContent = note;
};

loadProgress(0.1, 'warming up the rug…');
const renderer = await createRenderer(canvas);
loadProgress(0.35, 'brushing the cats…');

const white = await renderer.whiteTexture();
loadProgress(0.6, 'walking the dogs…');

renderer.addBatch('rug', discMesh(0.06), white, 2);
renderer.addBatch('yarn', yarnMesh(), white, 2);
renderer.addBatch('pad', renderer.boxMesh(), white, 32);
renderer.addBatch('tray', trayMesh(), white, 1);
renderer.addBatch('tile', tileMesh(TILE_H), white, 32);
renderer.addBatch('tileRaised', tileMesh(RAISED_H), white, 16);
for (const color of ['red', 'blue', 'violet', 'yellow'] as const) {
  renderer.addBatch(`cat_${color}`, catMesh(CAT_BODY[color]), white, 4);
}
renderer.addBatch('dog0', dogMesh(), white, 4); // dachshund
renderer.addBatch('dog1', corgiMesh(), white, 4); // corgi
renderer.addBatch('pot', potMesh(), white, 12);
for (const kind of [0, 1, 2] as const) {
  renderer.addBatch(`foliage${kind}`, foliageMesh(kind), white, 12);
}
renderer.addBatch('crate', cardboardBoxMesh(), white, 8);
renderer.addBatch('particle', particleMesh(), white, MAX_PARTICLES);
loadProgress(0.85, 'watering the plants…');

// --- per-frame scene build -----------------------------------------------------

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function pieceGlow(kind: 'cat' | 'dog', id: number): number {
  return selected && selected.kind === kind && selected.id === id ? 0.28 : 0;
}

/** Animated world position/lift for a piece mid-move; null when static. */
function animLift(kind: 'cat' | 'dog', id: number, now: number): { x: number; z: number; y: number; squash: number } | null {
  if (!anim || anim.move.kind !== kind || anim.move.id !== id) return null;
  const t = Math.min(1, (now - anim.start) / anim.dur);
  const m = anim.move;
  if (kind === 'dog') {
    const e = easeOut(t);
    const fx = anim.from?.x ?? cellX(m.from) + (state.dogs[id].axis === 'h' ? 0.5 : 0);
    const fz = anim.from?.z ?? cellZ(m.from) + (state.dogs[id].axis === 'v' ? 0.5 : 0);
    const tx = cellX(m.to) + (state.dogs[id].axis === 'h' ? 0.5 : 0);
    const tz = cellZ(m.to) + (state.dogs[id].axis === 'v' ? 0.5 : 0);
    return { x: fx + (tx - fx) * e, z: fz + (tz - fz) * e, y: RAISED_H, squash: 1 };
  }
  // cat: parabolic hop with squash & stretch (short low drop when the move
  // comes from a drag release)
  const e = t;
  const x0 = anim.from?.x ?? cellX(m.from);
  const z0 = anim.from?.z ?? cellZ(m.from);
  const y0 = anim.from?.y ?? topY(m.from);
  const x = x0 + (cellX(m.to) - x0) * e;
  const z = z0 + (cellZ(m.to) - z0) * e;
  const y1 = topY(m.to);
  const arc = (anim.from ? 0.3 : 1.05) * Math.sin(Math.PI * Math.min(1, t));
  const y = y0 + (y1 - y0) * e + arc;
  const squash = t < 0.12 ? 0.82 : t > 0.9 ? 0.86 : 1.06;
  return { x, z, y, squash };
}

function buildScene(now: number) {
  if (hint && now >= hint.until) hint = null;
  const tray = renderer.instances('tray');
  tray.length = 0;
  tray.push({ pos: [0, -0.3, 0], rot: 0, scl: [1, 1, 1], tint: TRAY, glow: 0 });
  // round rug under the board: rust border ring + warm inner disc
  const rug = renderer.instances('rug');
  rug.length = 0;
  rug.push({ pos: [0, -0.4, 0], rot: 0.13, scl: [4.35, 1, 4.35], tint: RUG_BORDER, glow: 0 });
  rug.push({ pos: [0, -0.395, 0], rot: 0.13, scl: [3.95, 1, 3.95], tint: RUG_INNER, glow: 0 });
  // yarn balls lounging on the rug's visible sides — poke them!
  const yarn = renderer.instances('yarn');
  yarn.length = 0;
  for (const [i, y] of YARNS.entries()) {
    const t = now - yarnPoke[i];
    let hop = 0;
    let spin = 0;
    let squash = 1;
    if (t >= 0 && t < 0.65) {
      const k = t / 0.65;
      hop = 0.55 * Math.sin(Math.PI * k);
      // exactly two full turns: easeOut(1) === 1, so the ball lands back on
      // its resting rotation with no end-of-animation snap
      spin = easeOut(k) * Math.PI * 4;
      squash = k < 0.12 ? 0.8 : k > 0.88 ? 0.85 : 1.08;
    }
    yarn.push({
      pos: [y.x, -0.335 + hop, y.z],
      rot: y.baseRot + spin + 0.05 * Math.sin(now * 0.8 + i * 2),
      scl: [y.s * (2 - squash) * 0.94, y.s * squash, y.s * (2 - squash) * 0.94],
      tint: y.tint,
      glow: 0,
    });
  }
  const tiles = renderer.instances('tile');
  tiles.length = 0;
  const raisedTiles = renderer.instances('tileRaised');
  raisedTiles.length = 0;
  const pads = renderer.instances('pad');
  pads.length = 0;
  // board tiles (+ raised dog tracks)
  const targets = legalTargets();
  for (let cell = 0; cell < N * N; cell++) {
    const raised = track.has(cell);
    const h = raised ? RAISED_H : TILE_H;
    const checker = (row(cell) + col(cell)) % 2 === 0;
    (raised ? raisedTiles : tiles).push({
      pos: [cellX(cell), 0, cellZ(cell)],
      rot: 0,
      scl: [1, 1, 1],
      tint: raised ? TILE_RAISED : checker ? TILE_A : TILE_B,
      glow: 0,
    });
    if (targets.has(cell)) {
      // a landing inside a cardboard box sits ON the box floor (which is
      // thicker than the pad — at tile height it would be swallowed)
      const inBox = state.boxes.includes(cell);
      pads.push({
        pos: [cellX(cell), h + (inBox ? 0.07 : 0), cellZ(cell)],
        rot: 0,
        scl: [inBox ? 0.6 : 0.72, 0.05, inBox ? 0.6 : 0.72],
        tint: PAD_GLOW,
        glow: 0.85,
      });
    }
  }
  // hint: coral pad on the cell the optimal move enters (over the amber pad)
  if (hint) {
    const hc = hintTargetCell(hint.move);
    const hh = track.has(hc) ? RAISED_H : TILE_H;
    const inBox = state.boxes.includes(hc);
    pads.push({
      pos: [cellX(hc), hh + (inBox ? 0.075 : 0.005), cellZ(hc)],
      rot: 0,
      scl: [inBox ? 0.66 : 0.8, 0.07, inBox ? 0.66 : 0.8],
      tint: HINT_PINK,
      glow: 0.9,
    });
  }

  // crates (boxes) + capping plants
  const crates = renderer.instances('crate');
  crates.length = 0;
  const pots = renderer.instances('pot');
  pots.length = 0;
  for (const kind of [0, 1, 2]) renderer.instances(`foliage${kind}`).length = 0;
  /** Pot stays put; only the foliage rustles. Same origin, same scale.
   * The plant variety is picked deterministically from the cell. */
  const plantAt = (cell: Cell, x: number, y: number, z: number, baseRot: number, s: number) => {
    pots.push({ pos: [x, y, z], rot: baseRot, scl: [s, s, s], tint: WHITE, glow: 0 });
    const sway = 0.06 * Math.sin(now * 1.5 + cell * 1.3);
    renderer.instances(`foliage${cell % 3}`).push({
      pos: [x, y, z],
      rot: baseRot + sway,
      scl: [s, s * (1 + 0.012 * Math.sin(now * 1.9 + cell * 1.3)), s],
      tint: WHITE,
      glow: 0,
    });
  };
  for (const b of state.boxes) {
    crates.push({ pos: [cellX(b), topY(b), cellZ(b)], rot: 0, scl: [1, 1, 1], tint: WHITE, glow: 0 });
    if (state.cappedBoxes.includes(b)) {
      // the squatter plant sits INSIDE the box opening
      plantAt(b, cellX(b), topY(b) + 0.06, cellZ(b), 0.6, 0.95);
    }
  }
  // cushions: potted plants
  for (const c of state.cushions) {
    plantAt(c, cellX(c), topY(c), cellZ(c), (c * 37) % 7, 1.08);
  }

  // cats
  for (const color of ['red', 'blue', 'violet', 'yellow']) {
    renderer.instances(`cat_${color}`).length = 0;
  }
  for (const cat of state.cats) {
    const list = renderer.instances(`cat_${cat.color}`);
    const a = animLift('cat', cat.id, now);
    const inBox = !a && state.boxes.includes(cat.cell) && !state.cappedBoxes.includes(cat.cell);
    const glow = pieceGlow('cat', cat.id);
    const bob = selected?.kind === 'cat' && selected.id === cat.id ? 0.06 * Math.abs(Math.sin(now * 5)) : 0;
    const scl = inBox ? 0.78 : 0.8;
    if (a) {
      // face the jump direction mid-air
      const m = anim!.move;
      const rot = Math.atan2(cellX(m.to) - cellX(m.from), cellZ(m.to) - cellZ(m.from));
      list.push({
        pos: [a.x, a.y, a.z],
        rot,
        scl: [0.8 * (2 - a.squash) * 0.9, 0.8 * a.squash, 0.8 * (2 - a.squash) * 0.9],
        tint: WHITE,
        glow: 0,
      });
    } else if (drag?.active && drag.kind === 'cat' && drag.id === cat.id) {
      // picked up: hover under the pointer, slightly larger
      list.push({
        pos: [drag.wx, 0.6 + 0.03 * Math.sin(now * 5), drag.wz],
        rot: 0,
        scl: [0.86, 0.86, 0.86],
        tint: WHITE,
        glow: 0.2,
      });
    } else {
      // idle breathing; happy victory hops once every cat is home
      const breathe = 1 + 0.02 * Math.sin(now * 2.3 + cat.id * 2.1);
      const hop = won ? 0.1 * Math.abs(Math.sin(now * 4.2 + cat.id * 1.4)) : 0;
      list.push({
        pos: [cellX(cat.cell), topY(cat.cell) + (inBox ? 0.06 : 0) + bob + hop, cellZ(cat.cell)],
        rot: 0,
        scl: [scl, scl * breathe, scl],
        tint: WHITE,
        glow,
      });
    }
  }

  // dogs
  renderer.instances('dog0').length = 0;
  renderer.instances('dog1').length = 0;
  for (const dog of state.dogs) {
    // alternate breeds: first dog is the dachshund, second the corgi
    const dogs = renderer.instances(`dog${dog.id % 2}`);
    const a = animLift('dog', dog.id, now);
    const dragging = drag?.active && drag.kind === 'dog' && drag.id === dog.id;
    const dc = dragging && drag ? dragDogCenter(dog, drag) : null;
    const [c1] = dogCells(dog);
    const cx = dc ? dc.x : a ? a.x : cellX(c1) + (dog.axis === 'h' ? 0.5 : 0);
    const cz = dc ? dc.z : a ? a.z : cellZ(c1) + (dog.axis === 'v' ? 0.5 : 0);
    // slow sleepy breathing
    const snooze = 1 + 0.018 * Math.sin(now * 1.6 + dog.id * 3.3);
    dogs.push({
      pos: [cx, RAISED_H + (dc ? 0.12 : 0), cz],
      rot: dog.axis === 'h' ? Math.PI / 2 : 0,
      scl: [0.85, 0.85 * snooze, 0.85],
      tint: WHITE,
      glow: dc ? 0.2 : pieceGlow('dog', dog.id),
    });
  }

  // particles: bursts + the lamp-light motes
  const bits = renderer.instances('particle');
  bits.length = 0;
  for (const p of particles) {
    const t = p.life / p.maxLife;
    const s = p.size * (t < 0.7 ? 1 : (1 - t) / 0.3) * (0.6 + 0.4 * t);
    bits.push({
      pos: [p.x, p.y, p.z],
      rot: p.spin * (p.maxLife - p.life),
      scl: [s, s, s],
      tint: p.color,
      glow: 0,
    });
  }
}

// --- input ---------------------------------------------------------------------

function cellFromMouse(px: number, py: number): Cell | null {
  const hit = renderer.pickGround(px, py, TILE_H);
  if (!hit) return null;
  const c = Math.round(hit[0] + 2);
  const r = Math.round(hit[1] + 2);
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return cellAt(r, c);
}

canvas.addEventListener('pointermove', (ev) => {
  if (ui !== 'play' || anim || won) {
    canvas.style.cursor = 'default';
    return;
  }
  // live drag: follow the pointer once it travels past a small threshold
  if (drag) {
    if (!drag.active && Math.hypot(ev.offsetX - drag.startPx, ev.offsetY - drag.startPy) > 7) {
      drag.active = true;
    }
    const hit = renderer.pickGround(ev.offsetX, ev.offsetY, TILE_H);
    if (hit) {
      drag.wx = Math.max(-2.6, Math.min(2.6, hit[0]));
      drag.wz = Math.max(-2.6, Math.min(2.6, hit[1]));
      drag.trail.push({ t: performance.now() / 1000, x: drag.wx, z: drag.wz });
      if (drag.trail.length > 8) drag.trail.shift();
    }
    canvas.style.cursor = 'grabbing';
    return;
  }
  const cell = cellFromMouse(ev.offsetX, ev.offsetY);
  const interactive =
    cell !== null
      ? legalTargets().has(cell) ||
        state.cats.some((c) => c.cell === cell) ||
        state.dogs.some((dg) => dogCells(dg).includes(cell))
      : yarnAt(ev.offsetX, ev.offsetY) >= 0;
  canvas.style.cursor = interactive ? 'pointer' : 'default';
});

function beginDrag(kind: 'cat' | 'dog', id: number, ev: PointerEvent, wx: number, wz: number) {
  const wasSelected = selected?.kind === kind && selected.id === id;
  selected = { kind, id };
  drag = {
    kind,
    id,
    active: false,
    wasSelected,
    startPx: ev.offsetX,
    startPy: ev.offsetY,
    wx,
    wz,
    trail: [{ t: performance.now() / 1000, x: wx, z: wz }],
  };
  canvas.setPointerCapture(ev.pointerId);
  audioGesture();
  if (!wasSelected) {
    if (kind === 'cat') audio.meow();
    else audio.select();
  }
}

canvas.addEventListener('pointerdown', (ev) => {
  if (ui !== 'play' || anim || won) return;
  const cell = cellFromMouse(ev.offsetX, ev.offsetY);
  if (cell === null) {
    const yi = yarnAt(ev.offsetX, ev.offsetY);
    if (yi >= 0) pokeYarn(yi, performance.now() / 1000);
    else selected = null;
    return;
  }
  const targets = legalTargets();
  const target = targets.get(cell);
  if (target) {
    startMove(target, performance.now() / 1000);
    return;
  }
  const cat = state.cats.find((c) => c.cell === cell);
  if (cat) {
    beginDrag('cat', cat.id, ev, cellX(cat.cell), cellZ(cat.cell));
    return;
  }
  const dog = state.dogs.find((dg) => dogCells(dg).includes(cell));
  if (dog) {
    const [c1] = dogCells(dog);
    beginDrag(
      'dog',
      dog.id,
      ev,
      cellX(c1) + (dog.axis === 'h' ? 0.5 : 0),
      cellZ(c1) + (dog.axis === 'v' ? 0.5 : 0),
    );
    return;
  }
  selected = null;
});

canvas.addEventListener('pointerup', (ev) => {
  const d = drag;
  drag = null;
  if (!d || ui !== 'play' || anim || won) return;
  if (!d.active) {
    // plain click: toggle off if it was already selected
    if (d.wasSelected) selected = null;
    return;
  }
  // update to the exact release point, then resolve the INTENDED target
  // (closeness / drag direction / fling all count — no precision required)
  const hit = renderer.pickGround(ev.offsetX, ev.offsetY, TILE_H);
  if (hit) {
    d.wx = Math.max(-2.6, Math.min(2.6, hit[0]));
    d.wz = Math.max(-2.6, Math.min(2.6, hit[1]));
    d.trail.push({ t: performance.now() / 1000, x: d.wx, z: d.wz });
  }
  const m = resolveDropTarget(d);
  if (m && m.kind === d.kind && m.id === d.id) {
    // drop into place from where the piece hovers right now
    const from =
      d.kind === 'cat'
        ? { x: d.wx, y: 0.6, z: d.wz }
        : dragDogCenter(state.dogs[d.id], d);
    startMove(m, performance.now() / 1000, from);
  }
  // no confident target: the piece simply snaps home and stays selected
});
canvas.addEventListener('pointercancel', () => {
  drag = null;
});

/** A dragged dog stays glued to its runner: free along its axis only. */
function dragDogCenter(dog: (typeof state.dogs)[number], d: Drag) {
  const [c1] = dogCells(dog);
  return dog.axis === 'h'
    ? { x: d.wx, y: RAISED_H, z: cellZ(c1) }
    : { x: cellX(c1), y: RAISED_H, z: d.wz };
}

function doUndo() {
  if (ui !== 'play' || anim) return;
  if (won) {
    won = false;
    el('win').classList.add('hidden');
  }
  undo(state);
  selected = null;
  hint = null;
  updateHud();
}

el('undo').addEventListener('click', doUndo);
el('reset').addEventListener('click', () => loadLevel(levelIndex));
el('hint').addEventListener('click', showHint);
el('music').addEventListener('click', () => {
  audio.unlock();
  const on = audio.toggleMusic();
  localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  refreshMusicButton();
});
refreshMusicButton();
el('menu-btn').addEventListener('click', showMenu);
el('win-menu').addEventListener('click', showMenu);
el('win-retry').addEventListener('click', () => {
  loadLevel(levelIndex);
  ui = 'play';
});
el('win-next').addEventListener('click', () => showIntro(Math.min(levelIndex + 1, LEVELS.length - 1)));
el('intro-go').addEventListener('click', startPlay);
el('intro-menu').addEventListener('click', showMenu);
el('play-btn').addEventListener('click', () => {
  const target = nextCampaignLevel();
  if (!localStorage.getItem(TUTORIAL_KEY)) showTutorial(0, () => showIntro(target));
  else showIntro(target);
});
el('howto-btn').addEventListener('click', () => showTutorial(0, null));

window.addEventListener('keydown', (ev) => {
  if (ui !== 'play') return;
  if (ev.key === 'z' || ev.key === 'u') doUndo();
  if (ev.key === 'r') loadLevel(levelIndex);
  if (ev.key === 'h') showHint();
  if (ev.key === 'Escape') showMenu();
});

// --- frame loop ----------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
window.addEventListener('resize', resize);
resize();
loadLevel(0);

// QA/debug bridge: lets automation project a cell to viewport coords and
// inspect live state without scraping pixels.
Object.assign(window as object, {
  __catjump: {
    cellScreen: (cell: Cell, h = 0.3) => renderer.project(cellX(cell), h, cellZ(cell)),
    worldScreen: (x: number, y: number, z: number) => renderer.project(x, y, z),
    state: () => ({
      cats: state.cats.map((c) => ({ ...c })),
      dogs: state.dogs.map((dg) => ({ ...dg })),
      moves: state.history.length,
      selected,
      won,
      level: levelIndex,
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
    showHint,
    hint: () => hint,
    particles: () => particles.length,
  },
});

let lastNow = performance.now() / 1000;
let dogDustAcc = 0;
/** Dust scuffs out from UNDER a sliding dog's body — it leaves the puffs
 * behind as it moves, so the wake forms without ever coming from his face. */
function emitDogDust(dt: number, now: number) {
  if (!anim || anim.move.kind !== 'dog') return;
  const a = animLift('dog', anim.move.id, now);
  if (!a) return;
  dogDustAcc += dt;
  const dog = state.dogs[anim.move.id];
  while (dogDustAcc > 0.03) {
    dogDustAcc -= 0.03;
    // anywhere along the body length, hugging the ground at the paws
    const along = (Math.random() - 0.5) * 1.2;
    const side = (Math.random() < 0.5 ? -1 : 1) * (0.14 + Math.random() * 0.1);
    spawnBurst(
      a.x + (dog.axis === 'h' ? along : side),
      RAISED_H,
      a.z + (dog.axis === 'v' ? along : side),
      1,
      { speed: 0.2, up: 0.35, life: 0.32, size: 0.05, gravity: -2 },
    );
  }
}

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - lastNow);
  lastNow = now;
  if (anim && now - anim.start >= anim.dur) finishMove();
  emitDogDust(dt, now);
  updateParticles(dt);
  buildScene(now);
  renderer.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// boot complete: fade the loader, land on the menu
loadProgress(1, 'ready!');
setTimeout(() => {
  el('loading').classList.add('fade-out');
  setTimeout(() => el('loading').classList.add('hidden'), 500);
  showMenu();
}, 300);
