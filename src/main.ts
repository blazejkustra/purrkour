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
import { createRenderer, type InstanceSpec } from './render/renderer.ts';
import {
  cardboardBoxMesh,
  catMesh,
  discMesh,
  dogMesh,
  plantMesh,
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

function startMove(m: Move, now: number) {
  selected = null;
  hint = null;
  anim = { move: m, start: now, dur: m.kind === 'cat' ? 0.42 : 0.28 };
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
  applyMove(state, anim.move);
  anim = null;
  updateHud();
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
renderer.addBatch('dog', dogMesh(), white, 4);
renderer.addBatch('plant', plantMesh(), white, 12);
renderer.addBatch('crate', cardboardBoxMesh(), white, 8);
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
    const fx = cellX(m.from) + (state.dogs[id].axis === 'h' ? 0.5 : 0);
    const fz = cellZ(m.from) + (state.dogs[id].axis === 'v' ? 0.5 : 0);
    const tx = cellX(m.to) + (state.dogs[id].axis === 'h' ? 0.5 : 0);
    const tz = cellZ(m.to) + (state.dogs[id].axis === 'v' ? 0.5 : 0);
    return { x: fx + (tx - fx) * e, z: fz + (tz - fz) * e, y: RAISED_H, squash: 1 };
  }
  // cat: parabolic hop with squash & stretch
  const e = t;
  const x = cellX(m.from) + (cellX(m.to) - cellX(m.from)) * e;
  const z = cellZ(m.from) + (cellZ(m.to) - cellZ(m.from)) * e;
  const y0 = topY(m.from);
  const y1 = topY(m.to);
  const arc = 1.05 * Math.sin(Math.PI * Math.min(1, t));
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
  // yarn balls lounging on the rug's visible sides
  const yarn = renderer.instances('yarn');
  yarn.length = 0;
  yarn.push({ pos: [3.5, -0.335, 0.7], rot: 2.2, scl: [1, 1, 1], tint: [0.93, 0.7, 0.34], glow: 0 });
  yarn.push({ pos: [-3.55, -0.335, 1.0], rot: 5.1, scl: [0.85, 0.85, 0.85], tint: [0.56, 0.66, 0.86], glow: 0 });
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
      pads.push({
        pos: [cellX(cell), h, cellZ(cell)],
        rot: 0,
        scl: [0.72, 0.05, 0.72],
        tint: PAD_GLOW,
        glow: 0.85,
      });
    }
  }
  // hint: coral pad on the cell the optimal move enters (over the amber pad)
  if (hint) {
    const hc = hintTargetCell(hint.move);
    const hh = track.has(hc) ? RAISED_H : TILE_H;
    pads.push({
      pos: [cellX(hc), hh + 0.005, cellZ(hc)],
      rot: 0,
      scl: [0.8, 0.07, 0.8],
      tint: HINT_PINK,
      glow: 0.9,
    });
  }

  // crates (boxes) + capping plants
  const crates = renderer.instances('crate');
  crates.length = 0;
  const plants = renderer.instances('plant');
  plants.length = 0;
  for (const b of state.boxes) {
    crates.push({ pos: [cellX(b), topY(b), cellZ(b)], rot: 0, scl: [1, 1, 1], tint: WHITE, glow: 0 });
    if (state.cappedBoxes.includes(b)) {
      // the squatter plant sits INSIDE the box opening
      plants.push({
        pos: [cellX(b), topY(b) + 0.06, cellZ(b)],
        rot: 0.6,
        scl: [0.95, 0.95, 0.95],
        tint: WHITE,
        glow: 0,
      });
    }
  }
  // cushions: potted plants
  for (const c of state.cushions) {
    plants.push({
      pos: [cellX(c), topY(c), cellZ(c)],
      rot: (c * 37) % 7,
      scl: [1.08, 1.08, 1.08],
      tint: WHITE,
      glow: 0,
    });
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
    } else {
      list.push({
        pos: [cellX(cat.cell), topY(cat.cell) + (inBox ? 0.06 : 0) + bob, cellZ(cat.cell)],
        rot: 0,
        scl: [scl, scl, scl],
        tint: WHITE,
        glow,
      });
    }
  }

  // dogs
  const dogs = renderer.instances('dog');
  dogs.length = 0;
  for (const dog of state.dogs) {
    const a = animLift('dog', dog.id, now);
    const [c1] = dogCells(dog);
    const cx = a ? a.x : cellX(c1) + (dog.axis === 'h' ? 0.5 : 0);
    const cz = a ? a.z : cellZ(c1) + (dog.axis === 'v' ? 0.5 : 0);
    dogs.push({
      pos: [cx, RAISED_H, cz],
      rot: dog.axis === 'h' ? Math.PI / 2 : 0,
      scl: [0.85, 0.85, 0.85],
      tint: WHITE,
      glow: pieceGlow('dog', dog.id),
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
  const cell = cellFromMouse(ev.offsetX, ev.offsetY);
  const interactive =
    cell !== null &&
    (legalTargets().has(cell) ||
      state.cats.some((c) => c.cell === cell) ||
      state.dogs.some((dg) => dogCells(dg).includes(cell)));
  canvas.style.cursor = interactive ? 'pointer' : 'default';
});

canvas.addEventListener('pointerdown', (ev) => {
  if (ui !== 'play' || anim || won) return;
  const cell = cellFromMouse(ev.offsetX, ev.offsetY);
  if (cell === null) {
    selected = null;
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
    selected = selected?.kind === 'cat' && selected.id === cat.id ? null : { kind: 'cat', id: cat.id };
    return;
  }
  const dog = state.dogs.find((dg) => dogCells(dg).includes(cell));
  if (dog) {
    selected = selected?.kind === 'dog' && selected.id === dog.id ? null : { kind: 'dog', id: dog.id };
    return;
  }
  selected = null;
});

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
  },
});

function frame() {
  const now = performance.now() / 1000;
  if (anim && now - anim.start >= anim.dur) finishMove();
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
