import { defineConfig } from "vitest/config";

// Test config is kept separate from vite.config.ts: the app build needs the
// React plugin, but the pure-logic tests do not — and mixing the plugin into a
// vitest/config defineConfig clashes types across the two bundled Vite copies.
export default defineConfig({
  test: {
    // Pure-logic tests for now; switch to "jsdom" when we test components.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
