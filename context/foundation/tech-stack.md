---
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
---

## Why this stack

A solo developer with strong C++/Python background and no prior web experience, building a workout-tracking MVP in 3 weeks after hours with an AI copilot. The 10x-astro-starter is the recommended default for (web-app, js) and clears all four agent-friendly quality gates. Supabase covers the has_auth requirement out of the box, eliminating manual auth integration. Cloudflare Pages is the free-tier default for this starter and fits the small-scale single-developer project. GitHub Actions with auto-deploy-on-merge keeps the CI/CD loop minimal. Standard path taken; no quality override needed.
