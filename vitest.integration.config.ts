import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Ad-hoc integration suite: real Supabase, run on demand with
// `npm run test:integration`. NOT part of the default `npm test` (CI) run.
// Requires SUPABASE_URL / SUPABASE_KEY; individual tests guard on their absence.
// Plain config (see vitest.config.ts for why getViteConfig is avoided). The
// `astro:env/server` shim needed by the real Supabase client is added in Phase 4
// alongside the first integration test.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // No integration tests exist until Phase 4; don't fail the ad-hoc run meanwhile.
    passWithNoTests: true,
  },
});
