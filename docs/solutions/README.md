# AgentForge Solutions Index

Compound verified knowledge for AgentForge. **RECALL** here (and episodic memory) before non-trivial work; **CAPTURE** after a fix is proven.

## How to use

1. **Before work** — search this folder and `docs/` for the adapter, CLI, or Studio area you are touching.
2. **After a verified fix** — add `YYYY-MM-DD-short-slug.md` with: problem, root cause, fix, proof command, files touched.

## Entries

| Date | Slug | Summary |
|------|------|---------|
| 2026-06-21 | gemini-cli-duplicate-require | Removed duplicate `buildMcpRitualBlock` require in `adapters/gemini-cli/emit.js` that broke `npm run verify`. |
| 2026-06-21 | studio-agentforge-spec-dir | `AGENTFORGE_SPEC_DIR` env override for MVP adapters; Studio compile uses temp spec dir. |
| 2026-06-21 | studio-zod-v3-pin | Pin Zod 3.x in Studio; v4 breaks Next 15 Turbopack API route build. |
| 2026-06-21 | studio-vercel-monorepo-deploy | Deploy from repo root; studio-only CLI upload breaks `/api/spec` on Vercel. |

See individual files as they are added.
