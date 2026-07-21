/**
 * Import once at app entry, before any game module runs.
 * Float16Array: typegpu's std/bitcast creates one at module scope; Hermes
 * has no ES2024 Float16Array.
 */
import { Float16Array as Float16ArrayPolyfill } from '@petamoriken/float16';

const g = globalThis as Record<string, unknown>;
if (typeof g['Float16Array'] === 'undefined') {
  g['Float16Array'] = Float16ArrayPolyfill;
}
