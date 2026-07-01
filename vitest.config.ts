import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Default (CI) suite: unit + hermetic tests. No external infra required.
// A plain config (not Astro's getViteConfig) is used deliberately: getViteConfig()
// loads the Cloudflare adapter, whose Vite plugin rejects Vitest's environment
// options. Unit/hermetic tests never import `astro:env/server`, so the only thing
// we need from Astro's config is the `@/` path alias, replicated here.
// Integration tests (`*.integration.test.ts`) run via `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
  },
});
