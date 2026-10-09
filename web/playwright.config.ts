import { defineConfig } from "@playwright/test";

/**
 * The showcase tour (e2e/showcase.spec.ts): screenshots and recorded
 * walkthroughs of the main journeys, which double as end-to-end tests.
 *
 *   pnpm showcase                     # against production
 *   BASE_URL=http://localhost:3536 pnpm showcase
 *
 * It drives the installed Google Chrome (channel "chrome"); Playwright's own
 * browsers are never downloaded.
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: ".showcase/test-results",
  // One browser at a time: the recordings need steady timing.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "https://campaign-text-lab.vercel.app",
    channel: "chrome",
    headless: true,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
});
