import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run single-threaded — same pattern as @ugm/desiagent
    threads: false,
    singleThread: true,
    // Allow vitest to transform all source files (including bun:sqlite refs)
    server: {
      deps: {
	        // disables sourcemap processing for tests
        inline: [/^(?!node_modules)/],
      },
    },
  },
  resolve: {
    alias: {
      "bun:sqlite": path.resolve(__dirname, "tests/sqlite-shim.ts"),
    },
  },
});
