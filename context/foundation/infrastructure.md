---
project: 10xBoar
researched_at: 2026-05-27
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro v6 + React v19
  runtime: Cloudflare Workers (workerd / edge)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already uses `@astrojs/cloudflare` v13+ and has a configured `wrangler.jsonc` — zero switching cost. Cloudflare Workers scores 5/5 on all agent-friendly criteria: fully CLI-driven via wrangler v4, pure managed/serverless with no OS or network ops, official llms.txt + 16 GA MCP servers for agent access, deterministic one-command deploy and rollback, and the strongest MCP integration of all evaluated platforms. The free tier (100k requests/day, unlimited bandwidth) covers the entire expected MVP load, with the $5/month Workers Paid plan as a clear upgrade path if the CPU time limit is reached.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | PASS | PASS | PASS | PASS | PASS | **5 Pass** |
| **Netlify** | PARTIAL | PASS | PASS | PASS | PASS | 4P + 1 Partial |
| **Vercel** | PASS | PASS | PASS | PASS | PARTIAL | 4P + 1 Partial |
| **Railway** | PASS | PARTIAL | PARTIAL | PASS | PASS | 3P + 2 Partial |
| **Render** | PASS | PARTIAL | PARTIAL | PASS | PASS | 3P + 2 Partial |
| **Fly.io** | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PASS | 1P + 4 Partial |

**Notes per criterion:**

- **Netlify CLI-first PARTIAL**: rollback requires the dashboard UI; deploy and logs are CLI.
- **Vercel MCP PARTIAL**: Vercel MCP is Beta (OAuth-backed) as of 2026 — real signal but soft.
- **Railway/Render Managed PARTIAL**: container/VM PaaS — more operational surface than pure serverless.
- **Railway/Render Docs PARTIAL**: markdown docs exist but llms.txt availability unconfirmed.
- **Fly.io CLI-first PARTIAL**: no native rollback; pattern is redeploy-via-image tag.
- **Fly.io Deploy API PARTIAL**: rollback is manual; no `fly rollback` command.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already the configured runtime. wrangler v4 covers the full operational loop from a terminal: `wrangler deploy` (deterministic, returns URL), `wrangler rollback <deployment-id>` (named, atomic), and `wrangler tail` (real-time log streaming). Docs available as `llms.txt` at `https://developers.cloudflare.com/workers/llms.txt`. 16 GA MCP servers with a unified code-mode API reduce context from ~1.17M tokens to ~1K for agent operations. Free tier handles 100k requests/day with zero egress charges. Cloudflare officially recommends Workers (not Pages) for new projects as of 2025.

#### 2. Netlify

Free tier covers 1M edge invocations/month and 100GB bandwidth. Official `netlify-mcp` GA server enables Claude Code integration for deploy management via natural language. The blocking concern for this project: `import.meta.env` values are baked at build time on Netlify; runtime secrets require `process.env` instead — the opposite of the project's current `astro:env/server` convention. Switching would require adapter swap (`@astrojs/netlify`), `astro.config.mjs` changes, and updating every runtime secret access. Worthwhile if Cloudflare constraints become blockers.

#### 3. Vercel

Free hobby plan covers 1M edge requests and 100GB bandwidth for personal/non-commercial projects (applies to 10xBoar). Vercel's Fluid Compute (2025) mitigates cold starts via persistent instance pools. Requires adapter swap (`@astrojs/vercel`) and attention to edge vs Node.js runtime selection. MCP is Beta (OAuth-backed) — real integration but less mature than Cloudflare's. Strong second alternative if Cloudflare's CPU time limit proves restrictive.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **CPU time limit is tighter than it appears.** Free plan: 10ms CPU per request; paid plan: 30ms. The workout-suggestion algorithm that sorts and filters a user's full training history may exceed this if written with synchronous iteration. OpenRouter and Supabase calls are pure I/O (don't count), but any loop over large arrays does.

2. **No persistent log storage on free tier.** `wrangler tail` streams in real-time only — nothing is retained. Debugging a production error from two hours ago is impossible without Logpush (paid Cloudflare feature). A developer accustomed to `journalctl` or stdout files will find this disorienting.

3. **Bundle size: 1MB compressed limit on free plan.** Astro v6 + React 19 + adapter code has real weight. The limit is 5MB on Workers Paid. Hitting the free limit silently breaks `wrangler deploy` with a cryptic error.

4. **Environment variable access is non-standard and project-specific.** The `astro:env/server` schema approach is already in use and documented in CLAUDE.md, but every new integration added in the future must follow the same pattern. `process.env` does not work at runtime on Workers.

5. **OpenRouter API calls from Cloudflare edge IPs.** Some AI inference providers apply additional rate-limiting or require special headers for requests originating from Cloudflare's data center IP ranges, which appear as automated traffic.

### Pre-mortem — How This Could Fail

The developer deploys successfully in week 1. By week 6, the workout-suggestion endpoint returns intermittent 1102 errors in production. `wrangler tail` catches fragments but logs disappear before a pattern forms. The root cause — a proposal algorithm scanning 400+ workout records synchronously in 12ms CPU — takes a week to pin down because there's no log history to query. Upgrading to the $5 Workers Paid plan (30ms CPU limit) resolves it, but a week of the 3-week budget is lost.

A subsequent attempt to add weekly summary emails hits a wall: Workers are stateless, and cron-like scheduling requires Cloudflare Cron Triggers with a Worker binding — a new primitive to learn mid-MVP. The feature is cut.

Finally, a tutorial titled "Deploy Astro to Cloudflare Pages" leads to running `wrangler pages deploy` instead of `wrangler deploy`, producing an opaque configuration error that takes 45 minutes to trace back to the Pages vs Workers distinction already present in the project's `wrangler.jsonc`.

### Unknown Unknowns

- **CPU time ≠ wall-clock time.** I/O awaits (Supabase queries, OpenRouter calls) are free. Synchronous computation is not. Test the workout-suggestion endpoint against a realistic history size (100+ entries) before launch to confirm it stays under 10ms CPU. Profile with `wrangler dev --inspect` if needed.
- **`wrangler tail` is the only free log access.** There is no log history. Build the habit of logging structured events to a Supabase table for anything you'll need to audit (auth failures, suggestion generation errors, OpenRouter timeouts).
- **`cloudflare-pages` in `tech-stack.md` is a naming artifact, not a deployment target.** The starter deploys as a Worker via `wrangler deploy`, not a Page via `wrangler pages deploy`. Follow `wrangler.jsonc`, not "Cloudflare Pages" tutorials.
- **Bundle size.** Run `wrangler deploy --dry-run` before the first production deploy to see compressed size. If approaching 1MB, enable `minify: true` in `wrangler.jsonc` and audit heavy dependencies.
- **Supabase client per request.** Each Worker invocation creates a fresh `createClient()`. `@supabase/ssr` is designed for this pattern and is safe. Do not add patterns that assume a persistent client (e.g., `onAuthStateChange` listeners).

## Operational Story

- **Preview deploys**: Cloudflare Workers does not generate branch preview URLs automatically without Pages CI integration. Use `wrangler deploy --env staging` with a separate named environment in `wrangler.jsonc` to get a staging URL. Preview protection via Cloudflare Access is available but requires setup.
- **Secrets**: Env vars live in `wrangler.jsonc` (non-secret vars) and Cloudflare dashboard → Workers → Settings → Variables (encrypted at rest). Set secrets via `wrangler secret put SUPABASE_KEY`. Secrets are not readable back after setting; rotate by setting a new value. `astro:env/server` schema must declare the variable before it can be imported.
- **Rollback**: `wrangler deployments list` shows recent deployment IDs; `wrangler rollback <deployment-id>` atomically reverts to that build. Typical time-to-revert: <60 seconds. DB schema migrations (if added later) do not roll back automatically — Workers rollback is code only.
- **Approval**: Human approval required before: `wrangler secret put` / delete, domain routing changes, and any Cloudflare dashboard action that affects billing tier. Agent may perform `wrangler deploy`, `wrangler rollback`, and `wrangler tail` unattended.
- **Logs**: `wrangler tail --format=json` streams structured real-time logs. For historical access, write structured events to Supabase (free) or enable Workers Logpush (paid). MCP via `workers-mcp` can surface observability data to Claude Code directly.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| CPU time limit hit by proposal algorithm | Devil's advocate | M | M | Profile with `wrangler dev --inspect` pre-launch; upgrade to Workers Paid ($5/mo) if 10ms budget is exceeded |
| No log history makes production debugging slow | Pre-mortem | H | M | Log structured events to Supabase `logs` table on errors; use `wrangler tail` during active debugging |
| Bundle size exceeds 1MB free limit | Devil's advocate | L | M | Run `wrangler deploy --dry-run` early; enable `minify: true`; audit bundle with `wrangler build` output |
| Pages vs Workers CLI confusion | Pre-mortem | H | L | CLAUDE.md and `wrangler.jsonc` are authoritative — ignore tutorials referencing `wrangler pages deploy` |
| OpenRouter rate-limiting from Cloudflare IPs | Unknown unknowns | L | H | Test OpenRouter calls from Workers in dev; add retry-with-backoff on 429 responses; check OpenRouter docs for edge-origin headers |
| Env var access breaks new integrations | Research finding | M | M | All env vars must follow `astro:env/server` schema + `locals.runtime.env` pattern documented in CLAUDE.md |

## Getting Started

The project is already configured. These are the operational steps to first deploy:

1. **Verify wrangler is installed and authenticated:**
   ```bash
   npx wrangler --version   # should show v4.x
   npx wrangler whoami      # should show your Cloudflare account
   ```
   If not authenticated: `npx wrangler login`

2. **Set production secrets** (do not commit to `wrangler.jsonc`):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Add OpenRouter key when AI feature is added: `npx wrangler secret put OPENROUTER_API_KEY`

3. **Build and verify bundle size before deploying:**
   ```bash
   npm run build
   npx wrangler deploy --dry-run
   ```
   Check output for compressed size — must stay under 1MB on free plan.

4. **Deploy to production:**
   ```bash
   npx wrangler deploy
   ```
   Returns a `*.workers.dev` URL immediately on success.

5. **Tail logs in a separate terminal during smoke testing:**
   ```bash
   npx wrangler tail --format=json
   ```

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions auto-deploy is already declared in `tech-stack.md`)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare Durable Objects / Cron Triggers (relevant if background jobs are added post-MVP)
