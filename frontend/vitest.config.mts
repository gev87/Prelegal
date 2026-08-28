import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
      // The real `server-only` entry point throws unless the bundler resolves
      // the "react-server" export condition. Tests exercise the module's
      // behaviour, not that guard.
      "server-only": path.join(root, "test", "stubs", "server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "components/**/*.tsx"],
    },
  },
});
