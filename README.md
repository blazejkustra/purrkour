# Purrkour

Parkour for cats: a single-player sequential-movement puzzle on a 5×5 grid, rendered with
[TypeGPU](https://typegpu.com) (WebGPU). Get every cat into a box —
"if it fits, I sits."

## Rules

- **Cats** move only by jumping over 1+ contiguous obstacles (cats, dogs,
  cushions, occupied boxes), landing on the first empty square past them.
  Never a single step; never over an empty box (but they can land in one,
  and can hop back out).
- **Dogs** occupy two squares and slide forward/back along their axis, one
  square per move. Their whole row/column renders as raised track squares.
- **Cushions** never move. One can sit on top of a box, blocking it.
- **Win** = every cat in a box. Star rating vs the proven minimum ("par").
- **Hint** (button or `H`): solves the current position with the BFS solver,
  selects the piece to move and pulses its destination pink for 3s, with a
  "N moves to go" toast. If the position is unwinnable it says so instead.
  Hints don't affect stars, but the win card notes how many you used.

## Run

```sh
npm install
npm run dev    # Chrome (WebGPU required)
npm test       # rules + solver unit tests; validates every level's par
npm run types  # typecheck (tsover for TypeGPU operator overloads)
```

## Level design

Levels 1–10 are a deliberate teaching ramp (one idea per level). Levels
11–20 come from `tests/genlevels.mjs`, which searches random layouts under
the design principles of the original physical game's author:

- Few pieces — difficulty from cat-jump × dog-slide interaction, not clutter.
- Dogs must matter: a level is disqualified unless the cats-only BFS FAILS
  (the dog has to move) and every dog appears in the optimal line.
- Difficulty ≠ par alone: candidates are also scored on first-move
  narrowness (many legal openings, few optimal ones) and the narrowest
  per par is kept.

Unlocking is star-gated by rows (Rocket-League style): rows 1–2 free,
row 3 at 12 total stars (amber), row 4 at 26 (violet). Do not copy real
Jump'In layouts — the principles are the inspiration, never the boards.

## Art

Cozy-living-room diorama: a walnut board tray on a rust-bordered round rug
with yarn balls, lit by warm lamp light (golden key + rosy ambient in the
fragment shader, CSS lamp-glow and vignette on the page). Every model is
procedural low-poly (`src/render/shapes.ts` — Crossy-Road style flat-shaded
blocks with baked vertex colors): sitting cats in four palettes, a
dachshund dog, potted-plant cushions, open cardboard boxes with folded-out
flaps (peak cat real estate), chamfered carpet tiles, rug and yarn. No
external art assets — the GLTF loader (`src/render/gltf.ts`) is kept only
for future drop-in models.

To swap in an external model: drop the `.gltf` + `.bin` + texture into
`public/assets/` and update the paths in `src/main.ts`. Meshes must be
single-node, transform-free glTF (see `src/render/gltf.ts`).

## QA/debug bridge

`window.__catjump` exposes `state()`, `loadLevel(i)` and
`cellScreen(cell, h)` (projects a board cell to normalized viewport
coordinates) — used to drive automated browser QA precisely.
