# AgentForge Studio

Stateless compile playground — edit YAML spec, pick an adapter, preview **real** emitted files, run **real** doctor checks.

## Local dev terminal

Workspace `.vscode/settings.json` prepends `C:\Program Files\nodejs` to **Path**. Open a **new** terminal tab, then:

```powershell
cd studio
npm run dev
```

http://localhost:3000

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | Strict TS |
| `npm run test` | Vitest (compile/doctor/schemas) |
| `npm run test:e2e` | Playwright smoke + a11y (port **3099**) |

**Tasks:** `Ctrl+Shift+P` → **Studio: dev**

## Happy path

1. Spec loads from repo `spec/*.yaml`
2. Select **cursor** → **Compile**
3. Preview `.cursor/rules/identity.mdc` (and siblings)
4. **Run doctor** → pass/fail from `agentforge doctor --json`

## Safety

- Never calls `agentforge init`
- Compile writes only under `os.tmpdir()/agentforge-studio-*`
- POST bodies validated with Zod; 512KB cap; rate limit per IP

## Deploy (Vercel)

**Deploy from repo root** (not `studio/` alone — compile needs `adapters/`, `spec/`, `bin/`):

```powershell
cd C:\AI\AgentForge
npx vercel --prod --yes
```

Production alias: **https://agentforgestudio-alpha.vercel.app**

Root `vercel.json` runs `npm run build --prefix studio`. See `docs/solutions/2026-06-21-studio-vercel-monorepo-deploy.md`.
