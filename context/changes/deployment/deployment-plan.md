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

## Phase 1 — GitHub repository (foundation for CD)
> Cloudflare Workers Builds connects to this repo, so it must exist first. No commits yet (fresh repo on `master`).
- [ ] Confirm secret hygiene: `.gitignore` excludes `.env`, `.env.production`, `.dev.vars`, `.wrangler/`, `node_modules/`, `dist/` (verified ✅). `.env.example` (placeholders only) is committed — fine.
- [ ] Create the **initial commit** (everything except gitignored files).
- [ ] Create an **empty private** repo on GitHub (no README/.gitignore/license → avoids merge conflict on first push).
- [ ] `git remote add origin <url>` then `git push -u origin master` (first push may trigger Git Credential Manager browser login).

## Phase 2 — Bootstrap the Worker + runtime secrets (manual, interactive)
> Creates the `boar` Worker and sets secrets *before* CD takes over, avoiding the secret-before-script chicken-egg. Secrets persist across all later auto-deploys.
- [ ] `npx wrangler deploy` — interactive on first run: claim a **workers.dev subdomain** (one-time, account-wide). Returns `https://boar.<subdomain>.workers.dev`. (Auth won't work yet — expected.)
- [ ] `npx wrangler secret put SUPABASE_URL` → paste `https://bbcaokucuzckmojgmeex.supabase.co`.
- [ ] `npx wrangler secret put SUPABASE_KEY` → paste the `sb_publishable_…` key.
- [ ] Do **not** set `OPENROUTER_API_KEY` (no AI code exists).

## Phase 3 — Supabase auth configuration (manual, dashboard)
- [ ] Auth → **Email → "Confirm email": OFF** (users sign in immediately; avoids rate-limited default SMTP).
- [ ] Auth → URL Configuration → **Site URL** = `https://boar.<subdomain>.workers.dev`; add it to **Redirect URLs** too.
- [ ] Note: PR **preview** URLs differ from production and use the **same** Supabase project + Worker secrets — test users on previews land in the real Supabase data (acceptable for MVP; be aware).

## Phase 4 — Connect Cloudflare Workers Builds (the CD engine)
- [ ] Dashboard → Workers & Pages → `boar` → **Settings → Build → Connect to Git**; install/authorize the **Cloudflare GitHub App** on the repo.
- [ ] **Production branch:** `master`. **Build command:** `npm run build`. **Deploy command:** `npx wrangler deploy`. Root dir `/`.
- [ ] (Optional) add `SUPABASE_URL`/`SUPABASE_KEY` as **build** variables — not required (schema is `optional`, build succeeds without), only if a future build needs them.
- [ ] From now on: push to `master` → production deploy; push to other branches / open PR → **preview deployment** with its own URL.

## Phase 5 — `gh` CLI for monitoring (currently NOT installed)
- [ ] Install: `winget install --id GitHub.cli` (or from <https://cli.github.com>).
- [ ] `gh auth login` → GitHub.com → HTTPS → browser.
- [ ] Agent then uses (read-only): `gh pr status`, `gh pr checks` (incl. the Cloudflare build/deploy check), `gh pr view --comments` (Cloudflare posts the **preview URL** here), `gh run list/view` (the lint+build CI). For PRs: `gh pr create`.

## Phase 6 — Branch protection + PR/preview workflow
- [ ] GitHub → repo **Settings → Branches** (or Rules) → protect `master`: **require a PR before merging** + **require status checks to pass** (the `ci` lint+build check and the Cloudflare deploy check).
- [ ] Working loop from here: `git switch -c <feature>` → commit → push → `gh pr create` → wait for CI + Cloudflare preview → open the **preview URL**, verify → **merge** → Cloudflare auto-deploys `master` to production.

## Phase 7 — Verify end-to-end
- [ ] Production smoke (`wrangler tail --format=json` in a second terminal): landing page renders; **signup** (`/auth/signup`) → with confirmation off the account is usable; **signin** → redirect to `/`; **/dashboard** loads when authed, redirects to `/auth/signin` after **signout**. No `?error=Supabase is not configured` (would mean secrets didn't load).
- [ ] CD smoke: open a trivial PR → confirm a **Cloudflare preview URL** appears on the PR and loads → merge → confirm `master` auto-deploys and production reflects the change.

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
- `context/changes/deployment/deployment-plan.md` — this artifact.
- No source changes; no DB migrations (none exist, `auth.users` only).
- `.github/workflows/ci.yml` — **unchanged** (lint+build only; deploy handled by Workers Builds).
