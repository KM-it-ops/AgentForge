# Handoff: AgentForge Studio MVP — G2 signed off

**Created:** 2026-06-21  
**Boss:** Mahmoud (Michael) Al Kurdi (`KM-it-ops`)  
**Status:** **G2 APPROVED** — production happy path verified by Boss on live URL  
**Repo:** `C:\AI\AgentForge` (canonical) · `@kmitops/agentforge@0.3.1`

---

## Executive summary

AgentForge Studio is a **stateless compile playground** in `studio/`. Boss edits YAML spec, selects an adapter, compiles to **real** emitted files, and runs **real** doctor checks. Deployed to Vercel; portfolio-ready.

**Live URL:** https://agentforgestudio-alpha.vercel.app

---

## RESUME STATE

| Item | Value |
|------|--------|
| Production alias | https://agentforgestudio-alpha.vercel.app |
| Vercel project | `agentforgestudio` · team `km-it-ops-projects` |
| Vercel dashboard | https://vercel.com/km-it-ops-projects/agentforgestudio |
| Local dev | `cd studio && npm run dev` → http://localhost:3000 |
| Parent verify | `npm run verify` at repo root — must stay green |
| npm tarball | `studio/` **excluded** from `@kmitops/agentforge` publish |

---

## G2 happy path (Boss verified 2026-06-21)

1. Open https://agentforgestudio-alpha.vercel.app  
2. Spec YAML loads from repo `spec/*.yaml`  
3. Select **cursor** → **Compile**  
4. Preview shows **30 files · ~103ms** including `.cursor/rules/identity.mdc`, `route-*.mdc`, `.cursor/mcp.json`  
5. **Run doctor** → real checks; 5 pass, 2 expected fail on Vercel (see below)

**G0 / G1 / G2:** all approved.

---

## What shipped

### Studio app (`studio/`)

- Next.js 15 App Router, Tailwind + shadcn/ui, CodeMirror 6 YAML editor  
- Adapters (MVP): `claude-code` · `codex` · `cursor` · `generic`  
- API routes: `POST /api/compile`, `POST /api/doctor`, `GET /api/spec`  
- Zod validation, 512KB body cap, in-memory rate limit  
- Vitest (8 tests) + Playwright smoke + basic a11y  
- CI: `.github/workflows/studio.yml`

### Adapter change (Boss-approved)

`AGENTFORGE_SPEC_DIR` env override in:

- `adapters/claude-code/emit.js`
- `adapters/codex/emit.js`
- `adapters/cursor/emit.js`
- `adapters/generic/emit.js`

Studio compile writes user YAML to temp `spec/`, spawns `emit.js`, returns file contents JSON, deletes scratch dir. **Never** calls `agentforge init`.

### Monorepo deploy (critical)

Deploy **from repo root**, not `studio/` alone:

```powershell
cd C:\AI\AgentForge
npx vercel --prod --yes
```

Root files: `vercel.json`, `.vercelignore`, `.vercel/project.json`

Without full repo upload, `/api/spec` and compile break (missing `../adapters`, `../spec`, `../bin`).

---

## Doctor on Vercel (expected, not a bug)

| Check | Production |
|-------|------------|
| node >=18 | pass |
| npm | pass |
| spec files | pass |
| mcp spec | pass |
| adapter emitters | pass |
| git | **fail** — `ENOENT` (no git in serverless) |
| usable bash | **fail** — no Git Bash on Vercel |

Compile is the portfolio story; doctor proves honesty on serverless limits. Optional future UX: badge “local-only checks” for git/bash.

---

## Commands cheat sheet

### Local

```powershell
cd C:\AI\AgentForge\studio
npm install
npm run dev          # :3000
npm run test         # vitest
npm run test:e2e     # playwright :3099
npm run build
npm run typecheck
```

### Deploy

```powershell
cd C:\AI\AgentForge
npx vercel --prod --yes
```

### Parent proof

```powershell
cd C:\AI\AgentForge
npm run verify
```

---

## Follow-up (not blocking G2)

### 1. Connect GitHub → Vercel (auto-deploy)

**Why:** Push-to-preview instead of manual `vercel --prod`.

**Steps:**

1. Vercel → **agentforgestudio** → **Settings** → **Git**  
2. Connect **KM-it-ops/AgentForge**  
3. **Root Directory:** leave as repo root (uses root `vercel.json`)  
   - Do **not** set Root Directory to `studio` only unless you duplicate monorepo include config  
4. Production branch: `main` (or your default)  
5. Push studio + root `vercel.json` changes → automatic deploy

### 2. Portfolio link (KM-it-ops.github.io)

Add to portfolio site:

- **Title:** AgentForge Studio  
- **URL:** https://agentforgestudio-alpha.vercel.app  
- **One-liner:** “YAML spec → adapter compile preview — real `.mdc` output, no init, no home-dir writes.”

Repo: https://github.com/KM-it-ops/KM-it-ops.github.io (or current portfolio path)

### 3. Optional polish (defer)

- Doctor panel: annotate git/bash as “local dev checks” when `VERCEL=1`  
- Custom domain on Vercel (e.g. `studio.agentforge.dev`)  
- Commit + PR squash for studio work if not already merged  
- `npx plugins add vercel/vercel-plugin` (CLI tip from first deploy)

---

## Key paths

```
AgentForge/
  studio/                    # Next.js app
  vercel.json                # deploy from root
  .vercel/project.json       # linked project
  adapters/*/emit.js         # AGENTFORGE_SPEC_DIR
  spec/*.yaml                # default seed
  docs/solutions/            # Law 9 captures
  docs/handoffs/             # this file
  .github/workflows/studio.yml
```

---

## Law 9 captures (read before changing deploy/compile)

| Slug | Topic |
|------|--------|
| `2026-06-21-gemini-cli-duplicate-require.md` | verify blocker fix |
| `2026-06-21-studio-agentforge-spec-dir.md` | compile env override |
| `2026-06-21-studio-zod-v3-pin.md` | Zod 3.x for Next build |
| `2026-06-21-studio-vercel-monorepo-deploy.md` | root deploy required |

Index: `docs/solutions/README.md`

---

## Failure conditions (MVP) — status

| Condition | Status |
|-----------|--------|
| Studio calls `agentforge init` | ✓ never |
| Writes outside temp dirs | ✓ never |
| Stubbed compile/doctor | ✓ real emitters + CLI doctor |
| `npm run verify` red | ✓ green at handoff |
| Playwright smoke | ✓ 3/3 |
| docs/solutions/ | ✓ exists |
| Boss happy path on production | ✓ signed off |

---

## Prior handoffs

- `C:\Users\alkur\AppData\Local\Temp\agentforge-studio-mvp-handoff.md` — original MVP scope (Phase 0)  
- Closed: `handoff-agentforge-v0.3.0-p3-2026-06-16.md` (0.3.1 publish)

---

## First message for next session

```
Handoff: AgentForge Studio G2 complete.

Read: docs/handoffs/agentforge-studio-g2-handoff-2026-06-21.md

Live: https://agentforgestudio-alpha.vercel.app

Optional next:
1. Connect GitHub → Vercel auto-deploy
2. Add Studio link to KM-it-ops.github.io portfolio
3. PR/merge studio + adapter changes if still on branch

Do not regress npm run verify or monorepo deploy pattern.
```

---

*Studio MVP written off. Ship it.*
