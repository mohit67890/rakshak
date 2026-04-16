import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read BOT_ID from env file so the tab can deep-link to the bot chat.
function loadBotId(): string {
  for (const f of ["../env/.env.local", "../env/.env.dev"]) {
    try {
      const content = readFileSync(resolve(__dirname, f), "utf-8");
      const match = content.match(/^BOT_ID=(.+)$/m);
      if (match?.[1]) return match[1].trim();
    } catch { /* file not found — try next */ }
  }
  return process.env.BOT_ID ?? process.env.CLIENT_ID ?? "";
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/tab/",
  define: {
    __BOT_ID__: JSON.stringify(loadBotId()),
  },
  server: {
    port: 53000,
    // Proxy API calls to the local Azure Functions host
    proxy: {
      "/api": {
        target: "http://localhost:7071",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
