import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1436,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1437 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    // Bundles live under /static so the overlay server keeps /media and /ws for itself.
    assetsDir: "static",
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        overlay: path.resolve(import.meta.dirname, "overlay.html"),
      },
    },
  },
});
