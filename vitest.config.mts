import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/support/global-setup.ts"],
    setupFiles: ["./tests/support/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5544/postgres",
      DB_POOL_MAX: "1",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      APP_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      PAYSTACK_TEST_SECRET_KEY: "sk_test_dummy_for_unit_tests",
      PAYSTACK_TEST_PUBLIC_KEY: "pk_test_dummy_for_unit_tests",
    },
  },
});
