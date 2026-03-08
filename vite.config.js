// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /api calls from the browser → forwarded to Express on 3001
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
