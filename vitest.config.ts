import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Align resolution so vi.mock intercepts API-layer package imports
      "@azure/functions": path.resolve("api/node_modules/@azure/functions"),
      "durable-functions": path.resolve("api/node_modules/durable-functions"),
    },
  },
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
