/** MMKV-backed StorageLike — synchronous, mirroring web localStorage. The
 * `purrkour.*` keys are shared with the web build; never rename them. */
import { createMMKV } from "react-native-mmkv";
import type { StorageLike } from "@purrkour/engine/game/progress.ts";

const store = createMMKV();

export const storage: StorageLike = {
  getItem: (key) => store.getString(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
