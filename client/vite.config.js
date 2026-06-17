import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8088";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: API_TARGET, ws: true, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
      "/auth": { target: API_TARGET, changeOrigin: true },
      "/create-game": { target: API_TARGET, changeOrigin: true },
      "/admin": { target: API_TARGET, changeOrigin: true },
      "/card": { target: API_TARGET, changeOrigin: true },
      "^/game/[^/]+/(players|settings|start)": { target: API_TARGET, changeOrigin: true },
      "^/game/[^/]+/player/": { target: API_TARGET, changeOrigin: true },
      "^/game/[^/]+$": {
        target: API_TARGET,
        changeOrigin: true,
        bypass(req) {
          const accept = req.headers.accept ?? "";
          if (accept.includes("text/html")) {
            return req.url;
          }
        },
      },
    },
  },
});
