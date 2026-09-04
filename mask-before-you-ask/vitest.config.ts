import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/shared/**/*.ts", "src/worker/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 80,
        functions: 95,
        lines: 95,
        statements: 90,
      },
    },
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
