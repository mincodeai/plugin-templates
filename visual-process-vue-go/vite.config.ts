import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const developmentBase = process.env.MINCODE_DEV_UI_BASE;
const developmentPort = Number(process.env.MINCODE_DEV_UI_PORT);
const developmentOrigin = `http://127.0.0.1:${developmentPort}`;
const developmentWebSocket = `ws://127.0.0.1:${developmentPort}`;

export default defineConfig({
  base: developmentBase || "./",
  plugins: [vue()],
  server: developmentBase && Number.isSafeInteger(developmentPort) ? {
    host: "127.0.0.1",
    port: developmentPort,
    strictPort: true,
    cors: { origin: "null" },
    headers: {
      "Content-Security-Policy": `default-src 'none'; script-src ${developmentOrigin}; style-src ${developmentOrigin} 'unsafe-inline'; img-src ${developmentOrigin} data:; font-src ${developmentOrigin}; connect-src ${developmentOrigin} ${developmentWebSocket}; base-uri 'none'; form-action 'none'`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
    hmr: { path: "hmr" },
  } : undefined,
  // @mincodeai/plugin-ui ships .vue sources that the dev server's dependency
  // pre-bundling (esbuild) cannot load; Vite compiles them like project files.
  optimizeDeps: {
    exclude: ["@mincodeai/plugin-ui"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-plugin/ui",
    emptyOutDir: true,
  },
});
