# Purrkour

Parkour for cats: a single-player sequential-movement puzzle on a 5×5 grid,
rendered with [TypeGPU](https://typegpu.com) (WebGPU). Get every cat into a
box — "if it fits, I sits."

A pnpm monorepo with two apps sharing one engine:

```
packages/engine   game rules, BFS solver, levels, procedural meshes,
                  TypeGPU renderer, procedural audio, play session
apps/web          Vite + DOM shell (Chrome, WebGPU required)
apps/mobile       Expo + react-native-webgpu shell (iOS / Android)
```

## Run

```sh
pnpm install
pnpm web       # Vite dev server (Chrome, WebGPU required)
pnpm ios       # expo run:ios — builds the dev client and boots the simulator
pnpm test      # engine rules + solver unit tests; validates every level's par
pnpm types     # typecheck all packages (tsover for TypeGPU operator overloads)
```

The engine typechecks without the DOM lib on purpose — that is the guard
that keeps it portable across web (Vite/DOM) and mobile
(Hermes/react-native-webgpu). Platform access is injected: apps hand the
engine a configured GPU canvas context, an AudioContext factory, and a
localStorage-like store (MMKV on mobile).

See `apps/web/README.md` for game rules, level-design notes, and the art
direction; both apps share the `purrkour.*` storage keys, so star progress
survives platform hops (well, per device).
