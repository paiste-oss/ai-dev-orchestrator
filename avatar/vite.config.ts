import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    target: "es2020",
  },
  optimizeDeps: {
    exclude: ["@readyplayerme/visage"],
  },
});
