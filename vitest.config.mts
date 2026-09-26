import { defineConfig } from "vitest/config";
import path from "path";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    // Las pruebas de integración comparten una base de datos: se ejecutan en serie.
    fileParallelism: false,
    env: {
      ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}),
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
    },
  },
});
