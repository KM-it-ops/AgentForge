# AgentForge

<div align="center">
  <img src="docs/demo/demo-desktop.png" alt="AgentForge visual demo showing one YAML spec flowing into Claude Code, Codex, Cursor, and Generic adapters" width="100%">

  <h3>One spec. Many agents.</h3>

  <p>
    A configuration framework for agentic AI coding assistants. Author your posture once,
    then emit platform-native files for Claude Code, Codex, Gemini CLI, Cursor, Aider, and generic agent workspaces.
  </p>

  <p>
    <a href="docs/demo/index.html"><strong>Open demo</strong></a>
    &nbsp;|&nbsp;
    <a href="https://km-it-ops.github.io/AgentForge/docs/demo/">Live demo</a>
    &nbsp;|&nbsp;
    <a href="spec/CUSTOMIZE.md">Customize spec</a>
    <a href="docs/READINESS.md">Readiness proof</a>
    &nbsp;|&nbsp;
    <a href="CHANGELOG.md">Changelog</a>
    &nbsp;|&nbsp;
    <a href="docs/PLATFORM-GAPS.md">Platform gaps</a>
    &nbsp;|&nbsp;
    <a href="docs/DEFERRED-MAP.md">Deferred map</a>
  </p>

  <p>
    <img alt="Node >= 18" src="https://img.shields.io/badge/node-%3E%3D18-007f78">
    <img alt="Adapters: 6" src="https://img.shields.io/badge/adapters-6-ca7a29">
    <img alt="Version 0.3.1" src="https://img.shields.io/badge/version-0.3.1-21313b">
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-121820">
  </p>
</div>

## Suite Scope

AgentForge is a framework for configuring, evaluating, and benchmarking AI coding agents
across real engineering workflows. It currently includes:

- **AgentForge Core** - portable configuration adapters for AI coding assistants.
- **AgentForge Benchmarks** - reproducible evaluations of AI agents on applied software tasks.
- **ATT&CKLens Benchmark** - the first defensive cybersecurity benchmark in the suite.

## What It Does

AgentForge separates the portable agent behavior from each tool's file formats and hook APIs.
You edit the canonical source in `spec/`; AgentForge compiles that posture into the right files
for each supported agent runtime.

```mermaid
flowchart LR
  Spec["spec/*.yaml<br/>identity, router, memory, telemetry"] --> Compiler["AgentForge compiler"]
  Compiler --> Claude["Claude Code<br/>CLAUDE.md + hooks"]
  Compiler --> Codex["Codex<br/>AGENTS.md + notify"]
  Compiler --> Gemini["Gemini CLI<br/>GEMINI.md + settings.json"]
  Compiler --> Cursor["Cursor<br/>.cursor/rules/*.mdc"]
  Compiler --> Aider["Aider<br/>CONVENTIONS.md + .aider.conf.yml"]
  Compiler --> Generic["Generic<br/>portable AGENTS.md"]
  Compiler --> Proof["doctor + verify<br/>pack/install checks"]
```

| Surface | What ships |
|---|---|
| Canonical spec | `spec/identity.yaml`, `spec/router.yaml`, `spec/memory.yaml`, `spec/automation.yaml`, `spec/telemetry.yaml` |
| Universal payload | Shared skills, memory templates, lessons, and installers under `universal/` |
| Adapter emitters | Platform-specific generators under `adapters/` |
| CLI | `agentforge init <adapter>` and `agentforge doctor` (or `npx @kmitops/agentforge …`) |
| Proof | Round-trip tests, package install tests, readiness runbook, and visual demo |

## Prerequisites

- **Node.js >= 18** and **npm**
- **git**
- **A POSIX shell (bash).** On Windows, use **Git Bash** — the verification suite and bootstrap installers run `.sh` scripts. If bash isn't on your `PATH`, point `AGENTFORGE_BASH` at it.

## Quick Start

> **Published to npm as [`@kmitops/agentforge@0.3.1`](https://www.npmjs.com/package/@kmitops/agentforge).** Run `npx @kmitops/agentforge init <adapter>` with no clone needed, or install from a git checkout (below) to hack on it.

```bash
git clone https://github.com/KM-it-ops/AgentForge.git
cd AgentForge
npm install -g .

# Install for Claude Code (writes to ~/.claude/)
agentforge init claude-code

# ...or another adapter:
agentforge init codex                              # Codex CLI   -> ~/.codex/
agentforge init gemini-cli                         # Gemini CLI  -> ~/.gemini/
agentforge init cursor  --dir ./my-cursor-config   # Cursor rules
agentforge init aider   --dir ./my-aider-project   # CONVENTIONS.md + .aider.conf.yml
agentforge init generic --dir ./my-agent-config    # portable AGENTS.md

# Check the local checkout has the tools AgentForge needs
agentforge doctor
```

Re-running is idempotent. Every install creates a git-tracked checkpoint so rollback is one command.

**Prefer a one-shot installer?** `bootstrap/` has auto-installers that handle the clone + setup:

```bash
./bootstrap/bootstrap.sh --auto         # macOS / Linux / Git Bash
pwsh ./bootstrap/bootstrap.ps1 -Auto    # Windows PowerShell
```

## Visual Demo (recommended)

The public funnel is the **static visual demo** — no server-side compile, no personal data in YAML.

```bash
npm run demo
```

Keep that command running, then visit:

```text
http://127.0.0.1:41738/docs/demo/
```

**Live:** https://km-it-ops.github.io/AgentForge/docs/demo/ (GitHub Pages)

The demo explains one spec → many adapters, then walks through **clone → edit `spec/*.yaml` → `agentforge init`**. See [`spec/CUSTOMIZE.md`](spec/CUSTOMIZE.md).

You can also open `docs/demo/index.html` directly from the filesystem when you do not need a local server.

## AgentForge Studio (optional)

Power-user compile playground in `studio/` — preview emitted files in the browser. Uses the same **placeholder** spec as the repo; not required for the core workflow.

```bash
cd studio
npm install
npm run dev
```

Open http://localhost:3000 — select **cursor**, **Compile**, inspect `.cursor/rules/*.mdc`. From the repo root, parent `npm run verify` stays independent of Studio.

| Command | Purpose |
|---|---|
| `npm run dev` | Local UI (see `studio/README.md`) |
| `npm run test` | Vitest (compile/doctor/schema wrappers) |
| `npm run test:e2e` | Playwright smoke + basic a11y |
| `npm run build` | Production build (Vercel) |

Deploy from the **repo root** (not `studio/` alone — `/api/spec` and compile need `adapters/`, `spec/`, `bin/`):

```bash
npx vercel --prod --yes
```

Root `vercel.json` runs `npm run build --prefix studio`. Live: https://agentforgestudio-alpha.vercel.app — see `studio/README.md` and `docs/solutions/2026-06-21-studio-vercel-monorepo-deploy.md`. API routes spawn real `adapters/*/emit.js` with `AGENTFORGE_SPEC_DIR` — never `agentforge init`.

## Verify Locally

```bash
npm run verify
```

`npm run verify` runs the adapter round-trip test and the npm pack/install test, including
`agentforge doctor --json` through the installed binstub. On Windows, the npm scripts launch
Git Bash explicitly when WSL `bash.exe` is first on `PATH` but cannot see Windows Node/npm.
Set `AGENTFORGE_BASH` to a specific Bash executable if you want to override the auto-detected shell.

For a quick local readiness check without creating an adapter target, run:

```bash
npx @kmitops/agentforge doctor
npx @kmitops/agentforge doctor --json
```

For the full current proof set, use the readiness runbook:

```bash
cat docs/READINESS.md
```

## Platform Coverage

| Target | Coverage | Notes |
|---|---:|---|
| Claude Code | 100% | Full adapter with identity, settings, hooks, telemetry helpers, and pruning scripts. |
| Codex CLI | ~85% | Strong AGENTS.md-centered adapter with notify hooks and local skill routing. |
| Gemini CLI | ~70% | `GEMINI.md` context file + merge-safe `settings.json` with native `mcpServers`, memory, skills, prune installers. No native lifecycle shell hooks (OpenTelemetry only). |
| Cursor | ~55% | `.cursorrules`, `.cursor/rules/*.mdc`, weekly report scripts, and local skill watcher. |
| Generic | ~40% | Portable AGENTS.md, memory notes, setup checklist, and helper scripts. |
| Aider | ~40% | `CONVENTIONS.md` posture loaded via `read:`, merge-safe `.aider.conf.yml` with `mcp-server:` registration. No skill loader, lifecycle hooks, or native memory. |

## What Ports Cleanly

| Component | Portable? | Why |
|---|---|---|
| Router philosophy | Yes | A pattern-to-skill table any agent can reason over. |
| Memory protocol | Yes | Directory structure plus index file. |
| 96/100 stack baseline | Yes | Embedded in the `agentic-prompt-architect` skill. |
| Spec-kit + TDD workflow doctrine | Yes | Separate CLI plus a discipline. |
| HTML lessons | Yes | Static, browser-readable files. |
| Weekly auto-prune loop | Mostly | Same bash logic; only the CLI invocation changes by platform. |

## What Needs Per-Platform Adaptation

- Identity file: `CLAUDE.md` vs `AGENTS.md` vs `.cursorrules` vs `GEMINI.md`
- Skill format: YAML-frontmatter `SKILL.md` vs `.mdc` rules vs inline sections
- Hook API: Claude Code lifecycle hooks vs Codex notify hooks vs file watchers
- Plugin ecosystem: each platform has its own marketplace or no equivalent concept

## Philosophy

1. **Lean cold-start.** Identity, router, and memory pointer stay always loaded. Everything else is opt-in by keyword.
2. **Observe, then prune.** Telemetry logs skill invocation. A weekly pass archives what has not earned its keep.
3. **The Universal Core travels.** Shared skills, memory, lessons, and installers move with every adapter.

## Status

v0.3.1 is **live on npm** as [`@kmitops/agentforge`](https://www.npmjs.com/package/@kmitops/agentforge). It ships six adapters
(Claude Code, Codex, Gemini CLI, Cursor, Aider, Generic), the `npx @kmitops/agentforge` CLI, round-trip CI on
`ubuntu-latest` + `windows-latest` + `macos-latest` x Node 20 and 22,
package-install readiness verification, a visual demo, and a platform-gap audit
with concrete remediation paths. npm publishing is an active release path through
`.github/workflows/publish.yml`, which runs verification and publishes with provenance
on GitHub Release publication.

## Companion tools

- **[AgentForge Developer Toolkit](https://github.com/KM-it-ops/agentforge-devtoolkit)** — an optional, standalone Windows-first PowerShell module for discover-first Node project environment workflows (`node-scout`). Previously vendored here under `AgentForge.DevToolkit/`; now lives in its own repo so AgentForge stays a pure JS/Node configuration framework. AgentForge does not depend on it.

## License

MIT.
