/**
 * Purrkour play session — the platform-neutral heart of the game shell.
 * Owns board state, selection, drag & fling, move animation, particles,
 * hints and per-frame scene building. Apps (web DOM / React Native) own
 * screens, HUD chrome, audio routing and persistence, and feed pointer
 * events in css-px/dp coordinates.
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
} from "./model.ts";
import { LEVELS } from "./levels.ts";
import { solve } from "./solver.ts";
import type { SfxId } from "../audio.ts";
import type { Renderer } from "../render/renderer.ts";
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
} from "../render/shapes.ts";
import { boxMesh } from "../render/gltf.ts";

// --- board metrics -------------------------------------------------------------

export const TILE_H = 0.18;
export const RAISED_H = 0.34;
export const cellX = (c: Cell) => col(c) - 2;
export const cellZ = (c: Cell) => row(c) - 2;

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

const MAX_PARTICLES = 140;

/** Register every mesh batch the session's buildScene fills. Call once after
 * creating the renderer, before the first frame. */
export function registerGameBatches(renderer: Renderer) {
  const white = renderer.whiteTexture();
  renderer.addBatch("rug", discMesh(0.06), white, 2);
  renderer.addBatch("yarn", yarnMesh(), white, 2);
  renderer.addBatch("pad", boxMesh(), white, 32);
  renderer.addBatch("tray", trayMesh(), white, 1);
  renderer.addBatch("tile", tileMesh(TILE_H), white, 32);
  renderer.addBatch("tileRaised", tileMesh(RAISED_H), white, 16);
  for (const color of ["red", "blue", "violet", "yellow"] as const) {
    renderer.addBatch(`cat_${color}`, catMesh(CAT_BODY[color]), white, 4);
  }
  renderer.addBatch("dog0", dogMesh(), white, 4); // dachshund
  renderer.addBatch("dog1", corgiMesh(), white, 4); // corgi
  renderer.addBatch("pot", potMesh(), white, 12);
  for (const kind of [0, 1, 2] as const) {
    renderer.addBatch(`foliage${kind}`, foliageMesh(kind), white, 12);
  }
  renderer.addBatch("crate", cardboardBoxMesh(), white, 8);
  renderer.addBatch("particle", particleMesh(), white, MAX_PARTICLES);
}

// --- session -------------------------------------------------------------------

export interface WinResult {
  levelIndex: number;
  moves: number;
  par: number;
  hintsUsed: number;
}

export interface SessionEvents {
  /** Route to the audio engine (and haptics on mobile). */
  sound(id: SfxId): void;
  /** Move count changed (applied or undone) — refresh the HUD. */
  onMoves(moves: number): void;
  /** Every cat is home. The app records progress and shows the win card. */
  onWin(result: WinResult): void;
  /** A hint is glowing: `minMoves` to go, moving a `kind`. */
  onHintShown(minMoves: number, kind: "cat" | "dog"): void;
  /** The current position is unwinnable — undo or reset. */
  onHintUnavailable(): void;
}

interface Selection {
  kind: "cat" | "dog";
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
  kind: "cat" | "dog";
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

const DUST: [number, number, number] = [0.93, 0.87, 0.76];
const SPARK_COLORS: [number, number, number][] = [
  [0.95, 0.45, 0.42],
  [0.96, 0.75, 0.32],
  [0.56, 0.75, 0.58],
  [0.48, 0.65, 0.92],
  [0.75, 0.58, 0.9],
];

/** The two yarn balls on the rug — clickable toys. */
const YARNS: {
  x: number;
  z: number;
  baseRot: number;
  s: number;
  tint: [number, number, number];
}[] = [
  { x: 3.5, z: 0.7, baseRot: 2.2, s: 1, tint: [0.93, 0.7, 0.34] },
  { x: -3.55, z: 1.0, baseRot: 5.1, s: 0.85, tint: [0.56, 0.66, 0.86] },
];

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export function createSession(renderer: Renderer, events: SessionEvents) {
  let levelIndex = 0;
  let state: GameState = createState(LEVELS[0]);
  let track = dogTrackCells(state);
  let selected: Selection | null = null;
  let anim: Anim | null = null;
  let drag: Drag | null = null;
  let won = false;
  /** Active hint: first move of an optimal line from the current position. */
  let hint: { move: Move; until: number } | null = null;
  let hintsUsed = 0;
  /** Input only flows while the app is on the play screen. */
  let active = false;
  const particles: Particle[] = [];
  const yarnPoke = [-10, -10];
  let dogDustAcc = 0;

  const topY = (cell: Cell) => (track.has(cell) ? RAISED_H : TILE_H);

  function loadLevel(i: number) {
    levelIndex = i;
    state = createState(LEVELS[i]);
    track = dogTrackCells(state);
    selected = null;
    anim = null;
    drag = null;
    won = false;
    hint = null;
    hintsUsed = 0;
    events.onMoves(0);
  }

  // --- drag & fling ------------------------------------------------------------

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
    if (d.kind === "cat") {
      const cat = state.cats[d.id];
      origin = { x: cellX(cat.cell), z: cellZ(cat.cell) };
    } else {
      const dog = state.dogs[d.id];
      const [c1] = dogCells(dog);
      origin = {
        x: cellX(c1) + (dog.axis === "h" ? 0.5 : 0),
        z: cellZ(c1) + (dog.axis === "v" ? 0.5 : 0),
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

  /** A dragged dog stays glued to its runner: free along its axis only. */
  function dragDogCenter(dog: GameState["dogs"][number], d: Drag) {
    const [c1] = dogCells(dog);
    return dog.axis === "h"
      ? { x: d.wx, y: RAISED_H, z: cellZ(c1) }
      : { x: cellX(c1), y: RAISED_H, z: d.wz };
  }

  // --- hints -------------------------------------------------------------------

  /** The cell a hinted move visibly ENTERS (dog forward moves enter the cell
   * past the old far end, same mapping as legalTargets' click cells). */
  function hintTargetCell(m: Move): Cell {
    if (m.kind === "cat") return m.to;
    const step = state.dogs[m.id].axis === "h" ? 1 : N;
    return m.to < m.from ? m.to : m.to + step;
  }

  function showHint(now: number) {
    if (!active || anim || won) return;
    const sol = solve(state);
    if (!sol || sol.line.length === 0) {
      events.onHintUnavailable();
      events.sound("wrong");
      return;
    }
    const move = sol.line[0];
    hintsUsed++;
    selected = { kind: move.kind, id: move.id };
    hint = { move, until: now + 3 };
    events.onHintShown(sol.minMoves, move.kind);
  }

  // --- moves & win ---------------------------------------------------------------

  /** Legal moves for the current selection, mapped by the CLICKABLE cell. */
  function legalTargets(): Map<Cell, Move> {
    const map = new Map<Cell, Move>();
    if (!selected || anim || won || !active) return map;
    if (selected.kind === "cat") {
      for (const m of catMoves(state, selected.id)) map.set(m.to, m);
    } else {
      const dog = state.dogs[selected.id];
      const step = dog.axis === "h" ? 1 : N;
      for (const m of dogMoves(state, selected.id)) {
        // clickable cell = the newly entered cell (back -> new anchor,
        // forward -> the cell past the old far end)
        map.set(m.to < m.from ? m.to : m.to + step, m);
      }
    }
    return map;
  }

  function startMove(
    m: Move,
    now: number,
    from?: { x: number; y: number; z: number },
  ) {
    selected = null;
    hint = null;
    const dur = from
      ? m.kind === "cat"
        ? 0.22
        : 0.16
      : m.kind === "cat"
        ? 0.42
        : 0.28;
    anim = from
      ? { move: m, start: now, dur, from }
      : { move: m, start: now, dur };
    if (m.kind === "cat" && !from) puffAt(m.from, 5); // take-off kick of dust
  }

  function finishMove() {
    if (!anim) return;
    const m = anim.move;
    applyMove(state, m);
    anim = null;
    events.onMoves(state.history.length);
    if (m.kind === "cat") {
      const inBox =
        state.boxes.includes(m.to) && !state.cappedBoxes.includes(m.to);
      if (inBox) {
        confettiAt(m.to); // a cat found its box!
        events.sound("match");
      } else puffAt(m.to, 9);
    }
    if (isWon(state)) {
      won = true;
      events.onWin({
        levelIndex,
        moves: state.history.length,
        par: LEVELS[levelIndex].par,
        hintsUsed,
      });
    }
  }

  function undoMove() {
    if (!active || anim) return;
    won = false;
    undo(state);
    selected = null;
    hint = null;
    events.onMoves(state.history.length);
  }

  // --- particles -----------------------------------------------------------------

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

  const puffAt = (c: Cell, n = 8) => spawnBurst(cellX(c), topY(c), cellZ(c), n);
  const confettiAt = (c: Cell) =>
    spawnBurst(cellX(c), topY(c) + 0.35, cellZ(c), 16, {
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

  /** Dust scuffs out from UNDER a sliding dog's body — it leaves the puffs
   * behind as it moves, so the wake forms without ever coming from his face. */
  function emitDogDust(dt: number, now: number) {
    if (!anim || anim.move.kind !== "dog") return;
    const a = animLift("dog", anim.move.id, now);
    if (!a) return;
    dogDustAcc += dt;
    const dog = state.dogs[anim.move.id];
    while (dogDustAcc > 0.03) {
      dogDustAcc -= 0.03;
      // anywhere along the body length, hugging the ground at the paws
      const along = (Math.random() - 0.5) * 1.2;
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.14 + Math.random() * 0.1);
      spawnBurst(
        a.x + (dog.axis === "h" ? along : side),
        RAISED_H,
        a.z + (dog.axis === "v" ? along : side),
        1,
        { speed: 0.2, up: 0.35, life: 0.32, size: 0.05, gravity: -2 },
      );
    }
  }

  // --- yarn toys -----------------------------------------------------------------

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
    events.sound("select");
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

  // --- input ---------------------------------------------------------------------

  function cellFromPoint(px: number, py: number): Cell | null {
    const hit = renderer.pickGround(px, py, TILE_H);
    if (!hit) return null;
    const c = Math.round(hit[0] + 2);
    const r = Math.round(hit[1] + 2);
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return cellAt(r, c);
  }

  /** Would a press here do something? (web uses it for cursor styling) */
  function interactiveAt(px: number, py: number): boolean {
    if (!active || anim || won) return false;
    const cell = cellFromPoint(px, py);
    return cell !== null
      ? legalTargets().has(cell) ||
          state.cats.some((c) => c.cell === cell) ||
          state.dogs.some((dg) => dogCells(dg).includes(cell))
      : yarnAt(px, py) >= 0;
  }

  function beginDrag(
    kind: "cat" | "dog",
    id: number,
    px: number,
    py: number,
    wx: number,
    wz: number,
    now: number,
  ) {
    const wasSelected = selected?.kind === kind && selected.id === id;
    selected = { kind, id };
    drag = {
      kind,
      id,
      active: false,
      wasSelected,
      startPx: px,
      startPy: py,
      wx,
      wz,
      trail: [{ t: now, x: wx, z: wz }],
    };
    if (!wasSelected) {
      if (kind === "cat") events.sound("meow");
      else events.sound("select");
    }
  }

  function pointerDown(px: number, py: number, now: number) {
    if (!active || anim || won) return;
    const cell = cellFromPoint(px, py);
    if (cell === null) {
      const yi = yarnAt(px, py);
      if (yi >= 0) pokeYarn(yi, now);
      else selected = null;
      return;
    }
    const targets = legalTargets();
    const target = targets.get(cell);
    if (target) {
      startMove(target, now);
      return;
    }
    const cat = state.cats.find((c) => c.cell === cell);
    if (cat) {
      beginDrag("cat", cat.id, px, py, cellX(cat.cell), cellZ(cat.cell), now);
      return;
    }
    const dog = state.dogs.find((dg) => dogCells(dg).includes(cell));
    if (dog) {
      const [c1] = dogCells(dog);
      beginDrag(
        "dog",
        dog.id,
        px,
        py,
        cellX(c1) + (dog.axis === "h" ? 0.5 : 0),
        cellZ(c1) + (dog.axis === "v" ? 0.5 : 0),
        now,
      );
      return;
    }
    selected = null;
  }

  function pointerMove(px: number, py: number, now: number) {
    if (!active || anim || won || !drag) return;
    // live drag: follow the pointer once it travels past a small threshold
    if (
      !drag.active &&
      Math.hypot(px - drag.startPx, py - drag.startPy) > 7
    ) {
      drag.active = true;
    }
    const hit = renderer.pickGround(px, py, TILE_H);
    if (hit) {
      drag.wx = Math.max(-2.6, Math.min(2.6, hit[0]));
      drag.wz = Math.max(-2.6, Math.min(2.6, hit[1]));
      drag.trail.push({ t: now, x: drag.wx, z: drag.wz });
      if (drag.trail.length > 8) drag.trail.shift();
    }
  }

  function pointerUp(px: number, py: number, now: number) {
    const d = drag;
    drag = null;
    if (!d || !active || anim || won) return;
    if (!d.active) {
      // plain click: toggle off if it was already selected
      if (d.wasSelected) selected = null;
      return;
    }
    // update to the exact release point, then resolve the INTENDED target
    // (closeness / drag direction / fling all count — no precision required)
    const hit = renderer.pickGround(px, py, TILE_H);
    if (hit) {
      d.wx = Math.max(-2.6, Math.min(2.6, hit[0]));
      d.wz = Math.max(-2.6, Math.min(2.6, hit[1]));
      d.trail.push({ t: now, x: d.wx, z: d.wz });
    }
    const m = resolveDropTarget(d);
    if (m && m.kind === d.kind && m.id === d.id) {
      // drop into place from where the piece hovers right now
      const from =
        d.kind === "cat"
          ? { x: d.wx, y: 0.6, z: d.wz }
          : dragDogCenter(state.dogs[d.id], d);
      startMove(m, now, from);
    }
    // no confident target: the piece simply snaps home and stays selected
  }

  function pointerCancel() {
    drag = null;
  }

  // --- per-frame scene build -----------------------------------------------------

  function pieceGlow(kind: "cat" | "dog", id: number): number {
    return selected && selected.kind === kind && selected.id === id ? 0.28 : 0;
  }

  /** Animated world position/lift for a piece mid-move; null when static. */
  function animLift(
    kind: "cat" | "dog",
    id: number,
    now: number,
  ): { x: number; z: number; y: number; squash: number } | null {
    if (!anim || anim.move.kind !== kind || anim.move.id !== id) return null;
    const t = Math.min(1, (now - anim.start) / anim.dur);
    const m = anim.move;
    if (kind === "dog") {
      const e = easeOut(t);
      const fx =
        anim.from?.x ?? cellX(m.from) + (state.dogs[id].axis === "h" ? 0.5 : 0);
      const fz =
        anim.from?.z ?? cellZ(m.from) + (state.dogs[id].axis === "v" ? 0.5 : 0);
      const tx = cellX(m.to) + (state.dogs[id].axis === "h" ? 0.5 : 0);
      const tz = cellZ(m.to) + (state.dogs[id].axis === "v" ? 0.5 : 0);
      return {
        x: fx + (tx - fx) * e,
        z: fz + (tz - fz) * e,
        y: RAISED_H,
        squash: 1,
      };
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
    const tray = renderer.instances("tray");
    tray.length = 0;
    tray.push({ pos: [0, -0.3, 0], rot: 0, scl: [1, 1, 1], tint: TRAY, glow: 0 });
    // round rug under the board: rust border ring + warm inner disc
    const rug = renderer.instances("rug");
    rug.length = 0;
    rug.push({
      pos: [0, -0.4, 0],
      rot: 0.13,
      scl: [4.35, 1, 4.35],
      tint: RUG_BORDER,
      glow: 0,
    });
    rug.push({
      pos: [0, -0.395, 0],
      rot: 0.13,
      scl: [3.95, 1, 3.95],
      tint: RUG_INNER,
      glow: 0,
    });
    // yarn balls lounging on the rug's visible sides — poke them!
    const yarn = renderer.instances("yarn");
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
    const tiles = renderer.instances("tile");
    tiles.length = 0;
    const raisedTiles = renderer.instances("tileRaised");
    raisedTiles.length = 0;
    const pads = renderer.instances("pad");
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
    const crates = renderer.instances("crate");
    crates.length = 0;
    const pots = renderer.instances("pot");
    pots.length = 0;
    for (const kind of [0, 1, 2]) renderer.instances(`foliage${kind}`).length = 0;
    /** Pot stays put; only the foliage rustles. Same origin, same scale.
     * The plant variety is picked deterministically from the cell. */
    const plantAt = (
      cell: Cell,
      x: number,
      y: number,
      z: number,
      baseRot: number,
      s: number,
    ) => {
      pots.push({
        pos: [x, y, z],
        rot: baseRot,
        scl: [s, s, s],
        tint: WHITE,
        glow: 0,
      });
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
      crates.push({
        pos: [cellX(b), topY(b), cellZ(b)],
        rot: 0,
        scl: [1, 1, 1],
        tint: WHITE,
        glow: 0,
      });
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
    for (const color of ["red", "blue", "violet", "yellow"]) {
      renderer.instances(`cat_${color}`).length = 0;
    }
    for (const cat of state.cats) {
      const list = renderer.instances(`cat_${cat.color}`);
      const a = animLift("cat", cat.id, now);
      const inBox =
        !a &&
        state.boxes.includes(cat.cell) &&
        !state.cappedBoxes.includes(cat.cell);
      const glow = pieceGlow("cat", cat.id);
      const bob =
        selected?.kind === "cat" && selected.id === cat.id
          ? 0.06 * Math.abs(Math.sin(now * 5))
          : 0;
      const scl = inBox ? 0.78 : 0.8;
      if (a) {
        // face the jump direction mid-air
        const m = anim!.move;
        const rot = Math.atan2(
          cellX(m.to) - cellX(m.from),
          cellZ(m.to) - cellZ(m.from),
        );
        list.push({
          pos: [a.x, a.y, a.z],
          rot,
          scl: [
            0.8 * (2 - a.squash) * 0.9,
            0.8 * a.squash,
            0.8 * (2 - a.squash) * 0.9,
          ],
          tint: WHITE,
          glow: 0,
        });
      } else if (drag?.active && drag.kind === "cat" && drag.id === cat.id) {
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
          pos: [
            cellX(cat.cell),
            topY(cat.cell) + (inBox ? 0.06 : 0) + bob + hop,
            cellZ(cat.cell),
          ],
          rot: 0,
          scl: [scl, scl * breathe, scl],
          tint: WHITE,
          glow,
        });
      }
    }

    // dogs
    renderer.instances("dog0").length = 0;
    renderer.instances("dog1").length = 0;
    for (const dog of state.dogs) {
      // alternate breeds: first dog is the dachshund, second the corgi
      const dogs = renderer.instances(`dog${dog.id % 2}`);
      const a = animLift("dog", dog.id, now);
      const dragging = drag?.active && drag.kind === "dog" && drag.id === dog.id;
      const dc = dragging && drag ? dragDogCenter(dog, drag) : null;
      const [c1] = dogCells(dog);
      const cx = dc ? dc.x : a ? a.x : cellX(c1) + (dog.axis === "h" ? 0.5 : 0);
      const cz = dc ? dc.z : a ? a.z : cellZ(c1) + (dog.axis === "v" ? 0.5 : 0);
      // slow sleepy breathing
      const snooze = 1 + 0.018 * Math.sin(now * 1.6 + dog.id * 3.3);
      dogs.push({
        pos: [cx, RAISED_H + (dc ? 0.12 : 0), cz],
        rot: dog.axis === "h" ? Math.PI / 2 : 0,
        scl: [0.85, 0.85 * snooze, 0.85],
        tint: WHITE,
        glow: dc ? 0.2 : pieceGlow("dog", dog.id),
      });
    }

    // particles: bursts + the lamp-light motes
    const bits = renderer.instances("particle");
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

  /** Advance simulation: finish due animations, dust, particles. Call once
   * per frame before buildScene. */
  function tick(now: number, dt: number) {
    if (anim && now - anim.start >= anim.dur) finishMove();
    emitDogDust(dt, now);
    updateParticles(dt);
  }

  return {
    loadLevel,
    tick,
    buildScene,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    interactiveAt,
    showHint,
    undo: undoMove,
    reset: () => loadLevel(levelIndex),
    setActive(value: boolean) {
      active = value;
      if (!value) {
        drag = null;
        selected = null;
      }
    },
    /** True while a drag is live and past its activation threshold. */
    get dragging() {
      return drag?.active === true;
    },
    get levelIndex() {
      return levelIndex;
    },
    get state() {
      return state;
    },
    get selected() {
      return selected;
    },
    get won() {
      return won;
    },
    get hint() {
      return hint;
    },
    get hintsUsed() {
      return hintsUsed;
    },
    get particleCount() {
      return particles.length;
    },
    get moves() {
      return state.history.length;
    },
  };
}

export type Session = ReturnType<typeof createSession>;
