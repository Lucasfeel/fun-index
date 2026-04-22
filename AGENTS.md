# AGENTS.md

## Repo Notes

- This repo contains two separate Vercel targets:
  - repo root: user-facing mini-app
  - `apps/admin`: separate admin static site
- When the user says "admin", treat it as the separately deployed `apps/admin` site unless they explicitly say otherwise.

## Vercel Rules

- Use already-saved Vercel credentials or token-based auth only.
- Do not run Vercel CLI commands that can trigger browser/device authorization prompts such as `vercel login`, `vercel whoami`, or similar interactive auth checks unless the user explicitly asks for that flow.
- If Vercel deployment state must be inspected, prefer local project config, existing linked `.vercel` files, non-interactive environment variables, or already-available deployment metadata first.
- Avoid asking the user for Vercel tokens repeatedly when the task can be completed with existing saved credentials.

