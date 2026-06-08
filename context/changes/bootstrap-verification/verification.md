---
bootstrapped_at: 2026-05-24T13:49:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: boar
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: boar
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack**: A solo developer with strong C++/Python background and no prior web experience, building a workout-tracking MVP in 3 weeks after hours with an AI copilot. The 10x-astro-starter is the recommended default for (web-app, js) and clears all four agent-friendly quality gates. Supabase covers the has_auth requirement out of the box, eliminating manual auth integration. Cloudflare Pages is the free-tier default for this starter and fits the small-scale single-developer project. GitHub Actions with auto-deploy-on-merge keeps the CI/CD loop minimal. Standard path taken; no quality override needed.

## Pre-scaffold verification

| Signal      | Value                                         | Severity    | Notes                                              |
| ----------- | --------------------------------------------- | ----------- | -------------------------------------------------- |
| npm package | not run                                       | n/a         | cmd_template starts with `git clone`; skipped      |
| GitHub repo | not run                                       | n/a         | `gh` CLI not installed on this machine; skipped    |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold` (cwd had an existing CLAUDE.md from the 10xDevs lesson chain)
**.gitignore handling**: moved silently (was absent in cwd)
**.bootstrap-scaffold cleanup**: deleted

Files moved to cwd (conflict-free): `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`

Preserved from cwd: `.claude/`, `.git/`, `CLAUDE.md`, `context/`, `idea.md`

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0 direct CRITICAL/HIGH of total 0/1; 2 direct MODERATE of 9 total MODERATE

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** — transitive (via Svelte internals)
  - Advisory: GHSA-77vg-94rm-hx3p
  - Title: Svelte devalue: DoS via sparse array deserialization
  - CVSS: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)
  - Range: 5.6.3 – 5.8.0
  - Fix available: yes (`npm audit fix`)
  - Risk in context: DoS vector requires an attacker able to send crafted input for deserialization. Low risk for an MVP with a small, authenticated user base; address before any public-facing launch.

#### MODERATE findings

| Package                | Direct? | Root cause                                              | Fix available |
| ---------------------- | ------- | ------------------------------------------------------- | ------------- |
| wrangler               | yes     | via miniflare → ws (uninitialized memory disclosure)    | yes           |
| @astrojs/check         | yes     | via @astrojs/language-server → volar-service-yaml → yaml (stack overflow on deep YAML) | semver-major downgrade required |
| @astrojs/language-server | no    | via volar-service-yaml                                  | semver-major  |
| @cloudflare/vite-plugin | no     | via miniflare, wrangler, ws                             | yes           |
| miniflare              | no      | via ws                                                  | yes           |
| volar-service-yaml     | no      | via yaml-language-server → yaml                         | semver-major  |
| ws                     | no      | GHSA-58qx-3vcg-4xpx; uninitialized memory; CVSS 4.4    | yes           |
| yaml                   | no      | GHSA-48c2-rrv3-qjmp; stack overflow on deep YAML; CVSS 4.3 | semver-major |
| yaml-language-server   | no      | via yaml                                                | semver-major  |

Most moderate findings cluster around `ws` (Cloudflare dev tooling) and `yaml-language-server` (Astro's type-checking tool). These are dev-tooling transitive paths, not production runtime paths. Run `npm audit fix` for the auto-fixable subset; the semver-major ones require pinning `@astrojs/check` to 0.9.2.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | false              |
| has_background_jobs     | false              |

These fields were carried through the hand-off and recorded here for the audit trail. A future skill (M1L4) will consume `ci_provider`, `ci_default_flow`, `deployment_target`, and `has_*` flags to generate workflow files and agent context.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` (the starter's version) alongside your existing `CLAUDE.md` and decide what to merge.
- Run `npm audit fix` to address the auto-fixable moderate findings (wrangler/ws chain).
- Address `devalue` HIGH finding: run `npm audit fix` — it is marked as fixable.
