import { defineConfig, type Plugin } from "vite";
import typegpu from "unplugin-typegpu/vite";

/** Serve public/<page>/index.html for pretty /privacy/ and /terms/ URLs in dev;
 * production static hosts do this rewrite natively. */
function staticPages(pages: string[]): Plugin {
  return {
    name: "static-pages",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split("?")[0];
        for (const page of pages) {
          if (path === `/${page}` || path === `/${page}/`) {
            req.url = `/${page}/index.html`;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project subpath
  // (blazejkustra.github.io/purrkour/) as well as at a domain root.
  base: "./",
  // Workspace-linked raw-TS source — never prebundle it past the typegpu plugin.
  optimizeDeps: { exclude: ["@purrkour/engine"] },
  plugins: [typegpu({}), staticPages(["privacy", "terms"])],
});
