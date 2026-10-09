import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The parity suites stream the original 30 MB CSVs; give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
