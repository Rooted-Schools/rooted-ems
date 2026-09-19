import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  // Test files live under lib/**/*.test.ts, but some (e.g. the interest
  // survey endpoint tests) import .tsx Server Components from app/ to
  // exercise them directly. Match Next's own automatic JSX runtime so those
  // imports don't need a manual `React` import just to satisfy esbuild's
  // classic-transform default.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
