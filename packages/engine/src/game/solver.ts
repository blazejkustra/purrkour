/**
 * BFS over full game states — validates levels and yields minimum move
 * counts ("par") plus a sample optimal line (for future hints). Cats are
 * interchangeable for the win condition, so states dedupe on the SORTED cat
 * cell set; dogs dedupe on (axis, anchor) sorted.
 */
import { type GameState, type Move, allMoves, applyMove, isWon, undo } from './model.ts';

export interface Solution {
  minMoves: number;
  line: Move[];
}

const stateKey = (s: GameState): string => {
  const cats = s.cats.map((c) => c.cell).sort((a, b) => a - b);
  const dogs = s.dogs.map((d) => `${d.axis}${d.cell}`).sort();
  return `${cats.join(',')}|${dogs.join(',')}`;
};

/** Breadth-first search; returns null when unsolvable within `maxStates`. */
export function solve(s: GameState, maxStates = 500_000): Solution | null {
  if (isWon(s)) return { minMoves: 0, line: [] };
  const seen = new Set<string>([stateKey(s)]);
  interface Node {
    moves: Move[];
  }
  let frontier: Node[] = [{ moves: [] }];
  let depth = 0;

  // Re-derive each node's state by replaying its move list on the live
  // state (then undoing) — memory stays tiny and states stay plain.
  const withReplay = <T>(moves: Move[], fn: () => T): T => {
    for (const m of moves) applyMove(s, m, true);
    const r = fn();
    for (let i = 0; i < moves.length; i++) undo(s);
    return r;
  };

  while (frontier.length > 0) {
    depth++;
    const next: Node[] = [];
    for (const node of frontier) {
      const result = withReplay(node.moves, () => {
        for (const m of allMoves(s)) {
          applyMove(s, m, true);
          const key = stateKey(s);
          const won = isWon(s);
          undo(s);
          if (won) return { done: [...node.moves, m] };
          if (!seen.has(key)) {
            seen.add(key);
            next.push({ moves: [...node.moves, m] });
          }
          if (seen.size > maxStates) return { overflow: true };
        }
        return null;
      });
      if (result && 'done' in result && result.done) return { minMoves: depth, line: result.done };
      if (result && 'overflow' in result) return null;
    }
    frontier = next;
  }
  return null; // exhausted: unsolvable
}
