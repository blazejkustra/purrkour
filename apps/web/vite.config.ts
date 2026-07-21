import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  // Workspace-linked raw-TS source — never prebundle it past the typegpu plugin.
  optimizeDeps: { exclude: ['@purrkour/engine'] },
  plugins: [typegpu({})],
});
