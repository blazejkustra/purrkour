import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  catMoves,
  dogMoves,
  applyMove,
  undo,
  isWon,
  allMoves,
} from "../src/game/model.ts";
import { solve } from "../src/game/solver.ts";
import { LEVELS } from "../src/game/levels.ts";

const bare = (over) => ({
  name: "t",
  cats: [],
  dogs: [],
  cushions: [],
  boxes: [],
  ...over,
});

test("cat jumps over one obstacle to first empty cell", () => {
  // cat 10, cushion 11 -> lands 12; no other jump available
  const s = createState(
    bare({ cats: [{ color: "red", cell: 10 }], cushions: [11], boxes: [24] }),
  );
  const moves = catMoves(s, 0);
  assert.deepEqual(
    moves.map((m) => m.to),
    [12],
  );
});

test("cat never steps to an adjacent empty cell", () => {
  const s = createState(
    bare({ cats: [{ color: "red", cell: 12 }], boxes: [24] }),
  );
  assert.equal(catMoves(s, 0).length, 0);
});

test("cat jumps over a chain of mixed obstacles", () => {
  // cushion 11, dog on 12-13 (h) -> cat 10 lands on 14
  const s = createState(
    bare({
      cats: [{ color: "red", cell: 10 }],
      cushions: [11],
      dogs: [{ cell: 12, axis: "h" }],
      boxes: [24],
    }),
  );
  assert.deepEqual(
    catMoves(s, 0).map((m) => m.to),
    [14],
  );
});

test("jump off the board is illegal", () => {
  // cat 12, cushions 13,14 -> east jump exits the row
  const s = createState(
    bare({
      cats: [{ color: "red", cell: 12 }],
      cushions: [13, 14],
      boxes: [24],
    }),
  );
  assert.equal(catMoves(s, 0).length, 0);
});

test("empty box is landable but not jumpable-over", () => {
  // cat 10, cushion 11, empty box 12: cat lands IN the box (scan stops there)
  const s = createState(
    bare({ cats: [{ color: "red", cell: 10 }], cushions: [11], boxes: [12] }),
  );
  assert.deepEqual(
    catMoves(s, 0).map((m) => m.to),
    [12],
  );
});

test("occupied box is an obstacle; cat can hop back out", () => {
  // green cat sits in box 12; red cat 10 + cushion 11 jump over BOTH to 13
  const s = createState(
    bare({
      cats: [
        { color: "red", cell: 10 },
        { color: "violet", cell: 12 },
      ],
      cushions: [11],
      boxes: [12, 24],
    }),
  );
  assert.deepEqual(
    catMoves(s, 0).map((m) => m.to),
    [13],
  );
  // the boxed green cat can jump out over the red cat's cushioned lane: 12 over 11+10? 11,10 obstacles -> lands 9? no: westward from 12 is 11 (cushion) then 10 (cat) then off-row edge col -1 => illegal. Southward nothing adjacent. So only jump over cushion+cat westward is blocked by edge; eastward cell 13 empty -> none. It still has zero — verify it CAN move when given a lane.
  const s2 = createState(
    bare({
      cats: [
        { color: "violet", cell: 12 },
        { color: "red", cell: 13 },
      ],
      boxes: [12, 24],
    }),
  );
  // green in box jumps east over red cat at 13 -> lands 14
  assert.deepEqual(
    catMoves(s2, 0).map((m) => m.to),
    [14],
  );
});

test("capped box blocks landing and counts as obstacle", () => {
  const s = createState(
    bare({
      cats: [{ color: "red", cell: 10 }],
      boxes: [11, 24],
      cappedBoxes: [11],
    }),
  );
  // jump over capped box 11 -> lands 12
  assert.deepEqual(
    catMoves(s, 0).map((m) => m.to),
    [12],
  );
});

test("dog slides one cell along its axis into plain-free cells only", () => {
  const s = createState(
    bare({
      dogs: [{ cell: 11, axis: "h" }], // covers 11,12
      cats: [{ color: "red", cell: 10 }], // blocks backward
      boxes: [13, 24], // box blocks forward
    }),
  );
  assert.equal(dogMoves(s, 0).length, 0);
  const s2 = createState(
    bare({ dogs: [{ cell: 11, axis: "h" }], boxes: [24] }),
  );
  assert.deepEqual(
    dogMoves(s2, 0).map((m) => m.to),
    [10, 12],
  );
});

test("vertical dog stays on its column", () => {
  const s = createState(bare({ dogs: [{ cell: 2, axis: "v" }], boxes: [24] })); // covers 2,7
  assert.deepEqual(
    dogMoves(s, 0)
      .map((m) => m.to)
      .sort((a, b) => a - b),
    [7], // backward off r0 illegal? cell 2 is row 0 -> back = -3 out; forward anchor 7 covers 7,12
  );
});

test("apply/undo round-trips and win detection works", () => {
  const s = createState(
    bare({ cats: [{ color: "red", cell: 10 }], cushions: [11], boxes: [12] }),
  );
  const [jump] = catMoves(s, 0);
  applyMove(s, jump);
  assert.equal(isWon(s), true);
  undo(s);
  assert.equal(s.cats[0].cell, 10);
  assert.equal(isWon(s), false);
});

test("solver solves a 1-move level and reports par", () => {
  const s = createState(
    bare({ cats: [{ color: "red", cell: 10 }], cushions: [11], boxes: [12] }),
  );
  const sol = solve(s);
  assert.equal(sol?.minMoves, 1);
  // solver must leave the live state untouched
  assert.equal(s.cats[0].cell, 10);
  assert.equal(s.history.length, 0);
});

test("solver detects unsolvable layouts", () => {
  // lone cat, no obstacles anywhere: it can never move
  const s = createState(
    bare({ cats: [{ color: "red", cell: 0 }], boxes: [24] }),
  );
  assert.equal(solve(s), null);
});

test("all bundled levels are solvable at their stated par", () => {
  for (const level of LEVELS) {
    const sol = solve(createState(level));
    assert.ok(sol, `${level.name} unsolvable`);
    assert.equal(sol.minMoves, level.par, `${level.name} par mismatch`);
  }
});
