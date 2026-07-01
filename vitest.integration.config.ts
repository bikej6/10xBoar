import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

// Ad-hoc integration suite: real Supabase, run on demand with
// `npm run test:integration`. NOT part of the default `npm test` (CI) run.
// Requires SUPABASE_URL / SUPABASE_KEY (anon) plus SUPABASE_TEST_EMAIL /
// SUPABASE_TEST_PASSWORD for a pre-created, email-confirmed test user; the whole
// suite skips when any are absent (so a bare checkout can still run `npm test`).
// Values are loaded from `.env` (all keys, no prefix filter) into process.env for
// the tests. Plain config (see vitest.config.ts for why getViteConfig is avoided);
// the real client is built directly from @supabase/supabase-js, so no
// `astro:env/server` shim is needed — `@/lib/workouts` imports `@/lib/supabase`
// type-only, which erases at runtime.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    env: loadEnv(mode, process.cwd(), ""),
    // Whole suite skips when integration env is absent; don't fail the ad-hoc run.
    passWithNoTests: true,
  },
}));
