# Vercel deploy must include monorepo root

**Date:** 2026-06-21  
**Area:** studio deploy

## Problem

First CLI deploy from `studio/` only uploaded the subdirectory. Production `/api/spec` returned:

```json
{"error":"Missing required spec file: /var/spec/identity.yaml"}
```

Compile/doctor need `../adapters`, `../spec`, `../bin`.

## Fix

1. Deploy from **repo root** with root `vercel.json` (build `--prefix studio`).
2. Link `.vercel/project.json` at repo root to existing project.
3. `studio/lib/paths.ts` — walk up to find `spec/identity.yaml`.
4. `studio/next.config.ts` — `outputFileTracingIncludes` for API routes.

## Proof

```powershell
cd C:\AI\AgentForge
npx vercel --prod --yes
curl https://agentforgestudio-alpha.vercel.app/api/spec
```

Returns `specFiles` JSON with identity.yaml content.

## Files

- `vercel.json`, `.vercelignore`, `.vercel/project.json` (root)
- `studio/lib/paths.ts`, `studio/next.config.ts`
