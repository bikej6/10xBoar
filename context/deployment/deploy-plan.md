# Deploy & Continuous Deployment — Cloudflare Workers (`boar`)

## Context

`10xBoar` (workout-tracking MVP) ships to **Cloudflare Workers** (decided in `infrastructure.md`).
This plan was originally a *manual* first deploy; it has been **revised to continuous deployment**:
every merge to `master` auto-deploys to production via **Cloudflare Workers Builds** (Cloudflare's
native Git integration), with **PR-based preview deployments** and **branch protection** preserving
a human gate. `gh` (GitHub CLI) lets the agent monitor PRs, build status, and preview URLs.

**Chosen architecture (confirmed):**
- **CD engine:** Cloudflare Workers Builds (native Git) — *not* GitHub Actions deploy. Cloudflare
  builds + deploys on push to `master` (production) and issues **preview deployments** for PRs/branches.
- **Workflow:** never commit directly to `master`. Branch → PR → review the Cloudflare preview →
  merge → auto-deploy to production. Branch protection enforces it.
- ⚠️ **Do NOT also add a `wrangler deploy` job to GitHub Actions** — running Workers Builds *and* an
  Actions deploy = double deploys / races. The existing `.github/workflows/ci.yml` is **lint+build
  only (no deploy)** and is safe to keep alongside Workers Builds.

**Outcome:** `boar.<subdomain>.workers.dev` live; pushes to `master` auto-deploy; PRs get preview
URLs; auth (signup/signin/signout) works against the cloud Supabase project; rollback path known.

**Repo facts (verified):** wrangler `4.94.0`, `@astrojs/cloudflare` `13.5.0`, Astro `^6.3.1`,
React `^19.2.6`, `output: "server"`, `nodejs_compat`. Env via `astro:env/server` (`SUPABASE_URL`,
`SUPABASE_KEY`, declared `optional: true`). `createClient()` (`src/lib/supabase.ts`) returns `null`
when secrets missing → auth routes redirect with `?error=Supabase is not configured`. No custom DB
tables (`auth.users` only). `ci.yml` triggers on push + PR to `master` (lint+build).

---

## Progress so far (already done)

- [x] **Phase 0a** — Node (v24, works), deps installed, wrangler `4.94.0` via `npx`.
- [x] **Phase 0b** — Authenticated to Cloudflare (`boc.katarzyna@gmail.com`, account `157583812b97d6c6391d954fd107b7f9`, single account).
- [x] **Phase 0d** — Cloud Supabase credentials gathered:
  - `SUPABASE_URL` = `https://bbcaokucuzckmojgmeex.supabase.co`
  - `SUPABASE_KEY` = `sb_publishable_…` (new-format publishable key = public-safe; **not** `service_role`).
- [x] **Worker renamed** — `wrangler.jsonc` `name` → `boar`.
- [x] **KV namespace `SESSION` created** (id `4cf13b8805c04978b6b69a98afbfaad8`) and bound in `wrangler.jsonc` — the Cloudflare adapter requires it (Astro sessions on KV); deploy fails without an id even though the app uses Supabase cookies, not Astro sessions.
- [x] **Build + dry-run OK** — compressed bundle **gzip ≈ 390 KiB**, well under the free-tier limit. No `minify` needed.

---

## Approval boundary (human-on-irreversibles)
- **Human / manual:** `wrangler secret put`, claiming the workers.dev subdomain, connecting Workers
  Builds in the dashboard, branch-protection settings, all Supabase dashboard changes, and **every
  merge to `master`** (the merge *is* the production deploy — review the preview first).
- **Agent unattended:** `wrangler rollback`, `wrangler tail`, `wrangler deploy` (bootstrap only),
  `gh` read commands (PR/build/preview status).
- Use the **publishable/anon** key for `SUPABASE_KEY` — never `service_role`/`sb_secret_`.

---

## Phase 1 — GitHub repository (foundation for CD) ✅ DONE
> Repo: `git@github.com:bikej6/10xBoar.git` (SSH). Branch `master`.
- [x] Secret hygiene verified: `.gitignore` excludes `.env`, `.env.production`, `.dev.vars`, `.wrangler/`, `node_modules/`, `dist/`; **`.claude/` also excluded** (regenerable via 10x-cli). `.env.example` (placeholders) committed.
- [x] Initial commit created (`f906163`, amended to drop `.claude/`).
- [x] Pushed via SSH: `git push -u origin master` succeeded (`* [new branch] master -> master`).

## Phase 2 — Bootstrap the Worker + runtime secrets (manual, interactive) ✅ DONE
> Creates the `boar` Worker and sets secrets *before* CD takes over, avoiding the secret-before-script chicken-egg. Secrets persist across all later auto-deploys.
> **Live URL:** `https://boar.boc-katarzyna.workers.dev` (subdomain `boc-katarzyna`, claimed via dashboard onboarding — CLI prompt is non-interactive here).
- [x] `npx wrangler deploy` — subdomain claimed in dashboard (CLI prompt auto-answered "no" in non-interactive shell), then re-deployed. Live at `https://boar.boc-katarzyna.workers.dev`. Smoke test: **HTTP 200 text/html**.
- [x] `SUPABASE_URL` set = `https://bbcaokucuzckmojgmeex.supabase.co`. ⚠️ Set via `echo -n "…" | npx wrangler secret put` (bash) — the bare `"str" | …` form runs the string as a *command* in bash → empty stdin → blank secret. Use `echo -n` (bash) or `Write-Output` (PowerShell).
- [x] `SUPABASE_KEY` set = `sb_publishable_…` (publishable/public key). Both confirmed via `npx wrangler secret list`.
- [x] `OPENROUTER_API_KEY` **not** set (no AI code exists). ✅
> Secret *values* can't be read back (write-only); definitive proof is the Phase 7 auth smoke-test (a blank `SUPABASE_URL` would surface as `?error=Supabase is not configured`).

## Phase 3 — Supabase auth configuration (manual, dashboard) ✅ DONE
- [x] Auth → **Email → "Confirm email": OFF** (users sign in immediately; avoids rate-limited default SMTP).
- [x] Auth → URL Configuration → **Site URL** = `https://boar.boc-katarzyna.workers.dev`; added to **Redirect URLs** too.
- [x] Acknowledged: PR **preview** URLs use the **same** Supabase project (`bbcaokucuzckmojgmeex`) + Worker secrets + KV — test users on previews land in real Supabase data (accepted for MVP).

## Phase 4 — Connect Cloudflare Workers Builds (the CD engine) ✅ DONE
- [x] Git already connected: `bikej6/10xBoar` linked to the `boar` Worker (Cloudflare GitHub App authorized).
- [x] Build config **verified correct**: **Production branch** `master`, **Build command** `npm run build`, **Deploy command** `npx wrangler deploy` (NOT `pages deploy`), **Root dir** `/`.
- [x] No build history yet — expected: Workers Builds only fires on a commit pushed *after* connection; the initial commit predates it. CD is **armed but unfired** — first firing is the Phase 7 PR test.
- [ ] (Optional) add `SUPABASE_URL`/`SUPABASE_KEY` as **build** variables — not required (schema is `optional`, build succeeds without), only if a future build needs them.
- [x] Behavior now active: push to `master` → production deploy; push to other branches / open PR → **preview deployment** with its own URL.

## Phase 5 — `gh` CLI for monitoring ✅ DONE
- [x] Installed: `gh` **v2.93.0**.
- [x] Authenticated as **bikej6** (HTTPS, scopes `gist, read:org, repo` — `repo` covers PR create/status/checks/view + run list/view).
- [x] Reachability confirmed: `gh repo view bikej6/10xBoar` → default branch `master`, **visibility PUBLIC** (secrets gitignored per Phase 1; can flip to private later without affecting Cloudflare link). No open PRs.
- [x] Agent then uses (read-only): `gh pr status`, `gh pr checks` (incl. the Cloudflare build/deploy check), `gh pr view --comments` (Cloudflare posts the **preview URL** here), `gh run list/view` (the lint+build CI). For PRs: `gh pr create`.

## Phase 6 — Branch protection + PR/preview workflow
- [x] **6a** — `master` protected via `gh api` (PUT branches/master/protection): **require a PR before merging** (`required_approving_review_count: 0` — solo dev can self-merge), `enforce_admins: false` (escape hatch during setup; tighten to `true` once proven), force-push + deletion blocked.
- [x] **6b** — required status checks added via `gh api`: **`ci`** (app 15368) + **`Workers Builds: boar`** (app 85455), `strict: false` (no forced rebase for solo dev). Both must pass before merge. Set after PR #1 made the checks visible to GitHub.
- [ ] Working loop from here: `git switch -c <feature>` → commit → push → `gh pr create` → wait for CI + Cloudflare preview → open the **preview URL**, verify → **merge** → Cloudflare auto-deploys `master` to production.

## Phase 7 — Verify end-to-end
- [x] **7a production auth smoke (via API, Origin header required — Astro `security.checkOrigin` 403s form POSTs without it):** `GET /`→200; `POST signup`→302 `/auth/confirm-email` (NOT "Supabase is not configured"); `POST signin`→302 `/` + cookie `sb-bbcaokucuzckmojgmeex-auth-token` (project ref in cookie name proves `SUPABASE_URL` is correct, not just present); `/dashboard`+cookie→200; `/dashboard` anon→302 `/auth/signin`. Confirmation-off confirmed (signin worked immediately). ⚠️ Test user `boar-smoke-1781023271708@example.com` created in Supabase — delete in Auth→Users if undesired.
- [x] **7b CD smoke (PR #1):** branch → commit → push → `gh pr create`. Both checks passed (`ci` 47s, `Workers Builds: boar`). Cloudflare posted preview URLs (`https://b39f60e7-boar.boc-katarzyna.workers.dev`, branch alias) — both HTTP 200. **Merged** (human gate) → production auto-deployed (version `1a21f8e3` @ 16:47Z, zero manual `wrangler deploy`) → `GET /` 200. Full loop branch→PR→preview→merge→prod proven.

## Phase 8 — Operations / rollback
- [ ] Rollback: `npx wrangler deployments list` → `npx wrangler rollback <deployment-id>` (code-only, <60s), or revert the commit on `master` (re-triggers a clean deploy). Neither reverts Supabase/dashboard changes.
- [ ] Logs: `wrangler tail` is live-only (no history on free tier). For durable audit, log structured events to Supabase later (out of scope).

## Edge cases & watchlist
- **One CD engine only:** Workers Builds **xor** an Actions deploy job — never both.
- **Direct-to-master = instant prod:** branch protection + preview review is the safety gate; a bad merge breaks production immediately.
- **Preview ↔ production share Supabase + Worker secrets + KV** (`SESSION`): preview test data is real data. Fine for MVP.
- **anon/publishable vs service_role:** `SUPABASE_KEY` is the public key; never deploy `service_role`.
- **New-format `sb_publishable_` key:** works with the installed `@supabase/supabase-js 2.99` / `@supabase/ssr 0.10`; if auth misbehaves, the legacy JWT `anon` key (Supabase → Settings → API) is the fallback.
- **Secret-before-script:** bootstrap deploy (Phase 2) creates the Worker so `wrangler secret put` succeeds.
- **Bundle 1 MB free limit:** currently ~390 KiB gzip — comfortable.
- **Branch name:** `ci.yml` + Workers Builds both keyed to `master`; if renamed to `main`, update both.
- **Workers Builds free build-minute allotment:** very frequent pushes can exceed it (then paid). Negligible for MVP.
- **Pages vs Workers:** always `wrangler deploy` / Workers Builds; never `wrangler pages deploy`.

## Files touched
- `wrangler.jsonc` — `name` → `boar`; added `kv_namespaces` (`SESSION`). *(done)*
- `context/deployment/deploy-plan.md` — this artifact (canonical Plan Mode deploy output; relocated from `context/changes/deployment/deployment-plan.md`).
- No source changes; no DB migrations (none exist, `auth.users` only).
- `.github/workflows/ci.yml` — **unchanged** (lint+build only; deploy handled by Workers Builds).
