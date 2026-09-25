import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Scenarios build git repos and run real test runners several times each.
    testTimeout: 180_000,
  },
});
