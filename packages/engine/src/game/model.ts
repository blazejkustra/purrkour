/**
 * Purrkour core rules. Pure logic, no DOM/GPU imports — unit-tested in node.
 *
 * Board: 5×5 cells, index = row * 5 + col.
 * - Cats move ONLY by jumping over 1+ contiguous obstacles (any mix of cats,
 *   dog segments, cushions, occupied boxes), landing on the first empty
 *   square past them. An empty box is landable (that's the goal) but is
 *   never an obstacle — so a jump can't pass over it (the scan stops there).
 * - Dogs occupy two cells on one axis and slide 1 cell forward/back per
 *   move into a free plain cell (never onto boxes/cushions/cats).
 * - Cushions never move. A cushion may also sit ON a box, making that box
 *   a permanent obstacle instead of a target.
 * - Win: every cat sits in a box.
 */

export const N = 5;
export const CELLS = N * N;

export type Cell = number; // 0..24
export type CatColor = "red" | "blue" | "violet" | "yellow";
export type Axis = "h" | "v";

export interface Cat {
  id: number;
  color: CatColor;
  cell: Cell;
}

/** Anchor cell is the min index of the two covered cells. */
export interface Dog {
  id: number;
  cell: Cell;
  axis: Axis;
}

export interface LevelDef {
  name: string;
  cats: { color: CatColor; cell: Cell }[];
  dogs: { cell: Cell; axis: Axis }[];
  cushions: Cell[];
  boxes: Cell[];
  /** Boxes (subset of `boxes`) permanently blocked by a cushion on top. */
  cappedBoxes?: Cell[];
}

export type Move =
  | { kind: "cat"; id: number; from: Cell; to: Cell }
  | { kind: "dog"; id: number; from: Cell; to: Cell };

export interface GameState {
  cats: Cat[];
  dogs: Dog[];
  cushions: Cell[];
  boxes: Cell[];
  cappedBoxes: Cell[];
  history: Move[];
}

export const row = (c: Cell) => Math.floor(c / N);
export const col = (c: Cell) => c % N;
export const cellAt = (r: number, c: number) => r * N + c;

export const dogCells = (d: Dog): [Cell, Cell] => [
  d.cell,
  d.cell + (d.axis === "h" ? 1 : N),
];

export function createState(def: LevelDef): GameState {
  const state: GameState = {
    cats: def.cats.map((c, i) => ({ id: i, color: c.color, cell: c.cell })),
    dogs: def.dogs.map((d, i) => ({ id: i, cell: d.cell, axis: d.axis })),
    cushions: [...def.cushions],
    boxes: [...def.boxes],
    cappedBoxes: [...(def.cappedBoxes ?? [])],
    history: [],
  };
  validateLevel(state);
  return state;
}

function validateLevel(s: GameState) {
  const seen = new Set<Cell>();
  const claim = (c: Cell, what: string) => {
    if (c < 0 || c >= CELLS) throw new Error(`${what} out of board: ${c}`);
    if (seen.has(c))
      throw new Error(`${what} overlaps another piece at cell ${c}`);
    seen.add(c);
  };
  for (const c of s.cushions) claim(c, "cushion");
  for (const d of s.dogs) {
    const [a, b] = dogCells(d);
    if (d.axis === "h" && col(a) === N - 1)
      throw new Error("h-dog crosses row edge");
    claim(a, "dog");
    claim(b, "dog");
  }
  // boxes may coincide with a cat (pre-solved cat) but nothing else
  for (const b of s.boxes) {
    if (b < 0 || b >= CELLS) throw new Error(`box out of board: ${b}`);
    if (s.cushions.includes(b) || s.dogs.some((d) => dogCells(d).includes(b))) {
      throw new Error(`box under a solid piece at cell ${b}`);
    }
  }
  for (const c of s.cats) claim(c.cell, "cat");
  for (const capped of s.cappedBoxes) {
    if (!s.boxes.includes(capped))
      throw new Error(`capped box ${capped} is not a box`);
  }
  const freeBoxes = s.boxes.filter((b) => !s.cappedBoxes.includes(b)).length;
  if (s.cats.length > freeBoxes) throw new Error("more cats than open boxes");
}

/** Solid occupant lookup for jumping/sliding. Empty boxes are NOT obstacles. */
export function isObstacle(s: GameState, c: Cell): boolean {
  if (s.cushions.includes(c) || s.cappedBoxes.includes(c)) return true;
  if (s.cats.some((cat) => cat.cell === c)) return true; // incl. cat-in-box
  return s.dogs.some((d) => dogCells(d).includes(c));
}

/** Can a cat END a jump here? Plain empty cell or an uncapped, empty box. */
function isLandable(s: GameState, c: Cell): boolean {
  return !isObstacle(s, c);
}

/** Plain-empty check for dog sliding: no piece AND no box at all. */
function isPlainFree(s: GameState, c: Cell): boolean {
  return !isObstacle(s, c) && !s.boxes.includes(c);
}

const DIRS: { dr: number; dc: number }[] = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

export function catMoves(s: GameState, catId: number): Move[] {
  const cat = s.cats[catId];
  const out: Move[] = [];
  const r0 = row(cat.cell);
  const c0 = col(cat.cell);
  for (const { dr, dc } of DIRS) {
    let r = r0 + dr;
    let c = c0 + dc;
    let jumped = 0;
    while (r >= 0 && r < N && c >= 0 && c < N && isObstacle(s, cellAt(r, c))) {
      jumped++;
      r += dr;
      c += dc;
    }
    if (jumped === 0) continue; // adjacent step is never allowed
    if (r < 0 || r >= N || c < 0 || c >= N) continue; // flew off the board
    const landing = cellAt(r, c);
    if (isLandable(s, landing)) {
      out.push({ kind: "cat", id: catId, from: cat.cell, to: landing });
    }
  }
  return out;
}

export function dogMoves(s: GameState, dogId: number): Move[] {
  const dog = s.dogs[dogId];
  const out: Move[] = [];
  const step = dog.axis === "h" ? 1 : N;
  const [a, b] = dogCells(dog);
  // backward: cell before the anchor must be free and stay on the dog's line
  const back = a - step;
  const backOk =
    dog.axis === "h"
      ? col(a) > 0 && isPlainFree(s, back)
      : row(a) > 0 && isPlainFree(s, back);
  if (backOk) out.push({ kind: "dog", id: dogId, from: dog.cell, to: back });
  // forward: cell past the far end
  const fwd = b + step;
  const fwdOk =
    dog.axis === "h"
      ? col(b) < N - 1 && isPlainFree(s, fwd)
      : row(b) < N - 1 && isPlainFree(s, fwd);
  if (fwdOk) out.push({ kind: "dog", id: dogId, from: dog.cell, to: a + step });
  return out;
}

export function allMoves(s: GameState): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < s.cats.length; i++) out.push(...catMoves(s, i));
  for (let i = 0; i < s.dogs.length; i++) out.push(...dogMoves(s, i));
  return out;
}

export function applyMove(s: GameState, m: Move, record = true) {
  if (m.kind === "cat") s.cats[m.id].cell = m.to;
  else s.dogs[m.id].cell = m.to;
  if (record) s.history.push(m);
}

export function undo(s: GameState): Move | undefined {
  const m = s.history.pop();
  if (!m) return undefined;
  if (m.kind === "cat") s.cats[m.id].cell = m.from;
  else s.dogs[m.id].cell = m.from;
  return m;
}

export function catInBox(s: GameState, cat: Cat): boolean {
  return s.boxes.includes(cat.cell) && !s.cappedBoxes.includes(cat.cell);
}

export function isWon(s: GameState): boolean {
  return s.cats.every((c) => catInBox(s, c));
}

/** Every cell of every dog's slide line — these render as raised squares. */
export function dogTrackCells(s: GameState): Set<Cell> {
  const track = new Set<Cell>();
  for (const d of s.dogs) {
    if (d.axis === "h") {
      const r = row(d.cell);
      for (let c = 0; c < N; c++) track.add(cellAt(r, c));
    } else {
      const c = col(d.cell);
      for (let r = 0; r < N; r++) track.add(cellAt(r, c));
    }
  }
  return track;
}
