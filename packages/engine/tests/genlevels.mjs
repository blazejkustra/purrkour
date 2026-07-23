/**
 * Level search v3, tuned to the original designer's principles:
 *  - FEW pieces: difficulty comes from cat-jump x dog-slide interaction,
 *    never from clutter (2-3 cats, 1-2 dogs, 0-2 plants).
 *  - Dogs must MATTER: cats-only BFS must fail (the dog has to move), and
 *    every dog must appear in the optimal line — a dog that never moves
 *    disqualifies the level outright.
 *  - Difficulty != move count: we also score first-move narrowness
 *    (many legal first moves, few of them optimal = non-obvious start).
 * Run: node --experimental-strip-types tests/genlevels.mjs
 */
import {
  createState,
  isWon,
  cellAt,
  catMoves,
  allMoves,
  applyMove,
  undo,
} from "../src/game/model.ts";
import { solve } from "../src/game/solver.ts";

// mulberry32: integer-safe PRNG. The previous LCG multiplied past 2^53 and
// float precision loss collapsed EVERY seed into the same sequence.
let seed = 96261;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (n) => Math.floor(rand() * n);

const COLORS = ["red", "blue", "violet", "yellow"];

function randomLevel(catCount, dogCount, cushionCount, capped) {
  const free = new Set(Array.from({ length: 25 }, (_, i) => i));
  const take = (c) => {
    if (!free.has(c)) return false;
    free.delete(c);
    return true;
  };
  const dogs = [];
  for (let i = 0; i < dogCount; i++) {
    for (let tries = 0; tries < 50; tries++) {
      const axis = rand() < 0.5 ? "h" : "v";
      const r = ri(axis === "h" ? 5 : 4);
      const c = ri(axis === "h" ? 4 : 5);
      const a = cellAt(r, c);
      const b = axis === "h" ? a + 1 : a + 5;
      if (free.has(a) && free.has(b)) {
        take(a);
        take(b);
        dogs.push({ cell: a, axis });
        break;
      }
    }
  }
  const grab = (n) => {
    const out = [];
    while (out.length < n) {
      const c = ri(25);
      if (take(c)) out.push(c);
    }
    return out;
  };
  const cushions = grab(cushionCount);
  const boxes = grab(catCount + (capped ? 1 : 0));
  const cappedBoxes = capped ? [boxes[boxes.length - 1]] : [];
  const cats = grab(catCount).map((cell, i) => ({
    color: COLORS[i % 4],
    cell,
  }));
  return { name: "?", cats, dogs, cushions, boxes, cappedBoxes };
}

/** BFS over CAT moves only — false means the dogs must move to win. */
function solvableCatsOnly(s, maxStates = 100_000) {
  const key = () =>
    s.cats
      .map((c) => c.cell)
      .sort((a, b) => a - b)
      .join(",");
  if (isWon(s)) return true;
  const seen = new Set([key()]);
  let frontier = [[]];
  while (frontier.length > 0) {
    const next = [];
    for (const moves of frontier) {
      for (const m of moves) applyMove(s, m, true);
      const all = [];
      for (let i = 0; i < s.cats.length; i++) all.push(...catMoves(s, i));
      let result = null;
      for (const m of all) {
        applyMove(s, m, true);
        const k = key();
        const won = isWon(s);
        undo(s);
        if (won) result = true;
        else if (!seen.has(k)) {
          seen.add(k);
          next.push([...moves, m]);
        }
        if (seen.size > maxStates) result = true; // give up -> treat as solvable
        if (result) break;
      }
      for (let i = 0; i < moves.length; i++) undo(s);
      if (result) return true;
    }
    frontier = next;
  }
  return false;
}

/** How non-obvious is the opening? legal first moves vs optimal ones. */
function firstMoveStats(level, minMoves) {
  const s = createState(level);
  const all = allMoves(s);
  let optimal = 0;
  for (const m of all) {
    applyMove(s, m, true);
    const sub = solve(s, 200_000);
    undo(s);
    if (sub && sub.minMoves === minMoves - 1) optimal++;
  }
  return { legal: all.length, optimal };
}

const bands = [
  // row 3 (levels 11-15): few cats + 1 essential dog, pars 5-9
  {
    label: "rowC",
    cats: [2, 3],
    dogs: 1,
    maxCushions: 5,
    cappedChance: 0.4,
    par: [5, 9],
  },
  // row 4 (levels 16-20): 2-3 cats + 2 essential dogs, pars 10-20
  {
    label: "rowD",
    cats: [2, 3],
    dogs: 2,
    maxCushions: 3,
    cappedChance: 0.2,
    par: [10, 20],
  },
];

for (const band of bands) {
  /** par -> best-scored candidate */
  const byPar = new Map();
  let attempts = 0;
  while (attempts < 60000) {
    attempts++;
    try {
      const catCount = Array.isArray(band.cats)
        ? band.cats[ri(band.cats.length)]
        : band.cats;
      const capped = rand() < band.cappedChance;
      const level = randomLevel(
        catCount,
        band.dogs,
        ri(band.maxCushions),
        capped,
      );
      const state = createState(level);
      if (isWon(state)) continue;
      if (level.cats.some((c) => level.boxes.includes(c.cell))) continue;
      const sol = solve(state, 400_000);
      if (!sol || sol.minMoves < band.par[0] || sol.minMoves > band.par[1])
        continue;
      // dogs must matter: unsolvable without them AND each one moves
      if (solvableCatsOnly(createState(level))) continue;
      const dogsUsed = new Set(
        sol.line.filter((m) => m.kind === "dog").map((m) => m.id),
      );
      if (dogsUsed.size < level.dogs.length) continue;
      const { legal, optimal } = firstMoveStats(level, sol.minMoves);
      const score = sol.minMoves + (2 * legal) / Math.max(1, optimal);
      const prev = byPar.get(sol.minMoves);
      if (!prev || score > prev.score) {
        byPar.set(sol.minMoves, {
          level,
          par: sol.minMoves,
          legal,
          optimal,
          score,
        });
      }
    } catch {
      continue;
    }
  }
  console.log(`// === ${band.label} (${attempts} attempts) ===`);
  for (const par of [...byPar.keys()].sort((a, b) => a - b)) {
    const c = byPar.get(par);
    console.log(
      `  // par ${c.par} | ${c.legal} first moves, ${c.optimal} optimal | score ${c.score.toFixed(1)}\n  ${JSON.stringify({ ...c.level, par: c.par })},`,
    );
  }
}
