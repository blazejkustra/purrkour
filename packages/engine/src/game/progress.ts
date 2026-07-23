/**
 * Persistent progress: best move counts, star ratings, and the star-gated
 * tier unlocks (Rocket-League style: rows unlock on TOTAL stars, not level
 * order). Storage is injected — localStorage on web, MMKV on mobile — and
 * the keys are shared between platforms; never rename them.
 */
import { LEVELS } from "./levels.ts";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const BEST_KEY = "purrkour.best";
const TUTORIAL_KEY = "purrkour.tutorialSeen";
const MUSIC_KEY = "purrkour.music";

/** Tier thresholds: levels 1-10 | 11-15 | 16-20 | 21-25. */
export const TIER_STARS = [0, 20, 36, 50];
export const tierOf = (i: number) => (i < 10 ? 0 : i < 15 ? 1 : i < 20 ? 2 : 3);

/** Stars for a solved level given its par and the recorded best. */
export const starsFor = (par: number, best: number) =>
  best <= par ? 3 : best <= par + 2 ? 2 : 1;

export function createProgress(storage: StorageLike) {
  // one-time migration from the working-title keys — nobody loses their stars
  for (const [oldKey, newKey] of [
    ["catjump.best", BEST_KEY],
    ["catjump.tutorialSeen", TUTORIAL_KEY],
    ["catjump.music", MUSIC_KEY],
  ] as const) {
    const v = storage.getItem(oldKey);
    if (v !== null && storage.getItem(newKey) === null)
      storage.setItem(newKey, v);
  }

  const loadBest = (): Record<number, number> => {
    try {
      return JSON.parse(storage.getItem(BEST_KEY) ?? "{}");
    } catch {
      return {};
    }
  };
  const best = loadBest();

  const stars = (i: number) =>
    best[i] === undefined ? 0 : starsFor(LEVELS[i].par, best[i]);
  const totalStars = () => LEVELS.reduce((sum, _, i) => sum + stars(i), 0);
  const isUnlocked = (i: number) => totalStars() >= TIER_STARS[tierOf(i)];

  return {
    best: best as Readonly<Record<number, number>>,
    stars,
    totalStars,
    isUnlocked,
    /** Record a solved level; true when the win unlocked a new row. */
    recordWin(levelIndex: number, moves: number): boolean {
      const unlockedBefore = LEVELS.filter((_, i) => isUnlocked(i)).length;
      if (best[levelIndex] === undefined || moves < best[levelIndex])
        best[levelIndex] = moves;
      storage.setItem(BEST_KEY, JSON.stringify(best));
      const unlockedAfter = LEVELS.filter((_, i) => isUnlocked(i)).length;
      return unlockedAfter > unlockedBefore;
    },
    /** First unlocked level that isn't solved yet (or the last level). */
    nextCampaignLevel(): number {
      for (let i = 0; i < LEVELS.length; i++) {
        if (isUnlocked(i) && best[i] === undefined) return i;
      }
      return LEVELS.length - 1;
    },
    get tutorialSeen() {
      return storage.getItem(TUTORIAL_KEY) !== null;
    },
    markTutorialSeen() {
      storage.setItem(TUTORIAL_KEY, "1");
    },
    get musicWanted() {
      return storage.getItem(MUSIC_KEY) !== "0";
    },
    setMusicWanted(on: boolean) {
      storage.setItem(MUSIC_KEY, on ? "1" : "0");
    },
  };
}

export type Progress = ReturnType<typeof createProgress>;
