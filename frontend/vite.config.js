import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The backend (Preethesh) binds to 127.0.0.1:3000 by default and does not set
// CORS headers. Rather than ask him to widen the backend's origin policy for a
// dev-only concern, the dev server proxies /api to it so the dashboard and the
// SSE stream are same-origin. `EventSource` cannot send custom headers, so the
// stream must stay same-origin either way.
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig(({ mode }) => {
  // Vite's working directory is frontend/, while the shared gitignored .env
  // lives at the repository root. loadEnv reads it only for this server-side
  // proxy configuration; no value is exposed to client code unless it has the
  // explicit VITE_ prefix.
  const serverEnv = { ...loadEnv(mode, REPO_ROOT, ""), ...process.env };
  const backend = serverEnv.HUMSAFAR_BACKEND_URL ?? "http://127.0.0.1:3000";
  return ({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken. Vite's default is to silently move to the
    // next free port, which means a stale server keeps answering on 5173 while
    // the new one serves the current code somewhere else — you end up staring
    // at an old build wondering why your edits did nothing.
    strictPort: true,
    watch: {
      // This repo lives on a Windows drive (/mnt/d) reached through WSL2, where
      // inotify does not fire for edits made on the Linux side. Without polling
      // the dev server never notices a file change and serves cached transforms
      // forever. Costs a little CPU; the alternative is silent staleness.
      usePolling: true,
      interval: 300,
    },
    proxy: {
      // INTERFACES.md §7: the approval routes use INTERNAL_API_TOKEN when it is
      // configured, and that token must never ship in browser JavaScript. The
      // dev server is the trusted boundary locally — it attaches the header
      // here, server-side, so the bundle never contains it. A real deployment
      // needs an equivalent proxy; do not "solve" this by putting the token in
      // import.meta.env, which would publish it to every visitor.
      "/api": {
        target: backend,
        changeOrigin: true,
        configure: (proxy) => {
          const token = serverEnv.INTERNAL_API_TOKEN;
          if (!token) return;
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Authorization", `Bearer ${token}`);
          });
        },
      },
      "/health": { target: backend, changeOrigin: true },
    },
  },
  });
});
