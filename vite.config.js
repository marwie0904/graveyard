import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /* 5174, not vite's 5173: every driver in this repo hardcodes it. */
  server: { port: 5174, open: false },
});
