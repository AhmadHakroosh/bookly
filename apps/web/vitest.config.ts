import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/__tests__/__mocks__/server-only.ts"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/cloud/**"],
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
