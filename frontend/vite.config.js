import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend (Preethesh) binds to 127.0.0.1:3000 by default and does not set
// CORS headers. Rather than ask him to widen the backend's origin policy for a
// dev-only concern, the dev server proxies /api to it so the dashboard and the
// SSE stream are same-origin. `EventSource` cannot send custom headers, so the
// stream must stay same-origin either way.
const BACKEND = process.env.HUMSAFAR_BACKEND_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
    },
  },
});
