# AgentForge

> A configuration framework for agentic AI coding assistants.
> One spec. Many adapters. The same posture in any agent.

**Status:** v0.1.0 shipped (Claude Code + Codex + Generic). v0.2 adds Cursor + the `npx agentforge` CLI + round-trip CI. See [`docs/VERIFICATION-v0.1.0.md`](docs/VERIFICATION-v0.1.0.md) and [`docs/PLATFORM-GAPS.md`](docs/PLATFORM-GAPS.md).

## The problem

You set up Claude Code with a slim global hub, a skill router, memory protocol, telemetry hooks, weekly auto-prune. It works beautifully — for Claude Code. The day you want the same posture in Codex CLI, Cursor, Gemini CLI, or Aider, you start from scratch. Every agent has its own file format, its own hook API, its own plugin ecosystem.

AgentForge solves this by separating the **substance** (router philosophy, memory protocol, 96/100 stack baseline, observe-then-prune loop) from the **plumbing** (per-agent file formats and hook APIs).

## The architecture

```
spec/           ← universal YAML source of truth
universal/      ← copied verbatim by every adapter (skills, memory, lessons)
adapters/       ← per-platform emitters
  ├── claude-code/
  ├── codex/
  ├── cursor/    ← .cursorrules + .cursor/rules/*.mdc
  └── generic/   ← lowest common denominator AGENTS.md
bootstrap/      ← platform-detect installer
bin/            ← `npx agentforge` CLI
```

You edit `spec/`. The adapters emit the right files for each platform. The substance stays canonical; only the plumbing adapts.

## Quick start

```bash
# Install for Claude Code (writes to ~/.claude/)
npx agentforge init claude-code

# Install for Codex CLI (writes to ~/.codex/)
npx agentforge init codex

# Install Cursor rules (.cursorrules + .cursor/rules/*.mdc — --dir required)
npx agentforge init cursor --dir ./my-cursor-config

# Install generic AGENTS.md anywhere (--dir is required for the generic adapter)
npx agentforge init generic --dir ./my-agent-config
```

Re-running is idempotent. Every install creates a git-tracked checkpoint so rollback is one command.

Until the package is published to npm, install from a git checkout:

```bash
git clone https://github.com/KM-it-ops/AgentForge.git
cd AgentForge
npm install -g .
agentforge init claude-code
```

## What ports cleanly

| Component | Portable? | Why |
|---|---|---|
| Router philosophy (pattern → skill) | ✅ Universal | Just a markdown table any agent can reason over |
| Memory protocol (user/feedback/project/reference + index) | ✅ Universal | Directory structure + index file |
| 96/100 stack baseline | ✅ Universal | Embedded in the `agentic-prompt-architect` skill |
| Spec-kit + TDD workflow doctrine | ✅ Universal | Separate CLI + a discipline |
| HTML lessons | ✅ Universal | Static, browser-readable |
| Weekly auto-prune loop | ✅ Mostly | Same bash logic; only the CLI invocation per-platform changes |

## What needs per-platform adaptation

- Identity file: `CLAUDE.md` vs `AGENTS.md` vs `.cursorrules` vs `GEMINI.md`
- Skill format: YAML-frontmatter `SKILL.md` vs `.mdc` rules vs inline sections
- Hook API: Claude Code lifecycle hooks vs Codex notify hooks vs file watchers
- Plugin ecosystem: each platform has its own marketplace or no concept at all

## v1 platform support

| Target | Coverage | Notes |
|---|---:|---|
| Claude Code | 100% | Hand-built adapter; round-trips against the original `~/.claude/` |
| Codex CLI | ~85% | Hand-built adapter; weaker lifecycle hooks. See `docs/PLATFORM-GAPS.md` |
| Cursor | ~55% | Modern `.cursor/rules/*.mdc` + legacy `.cursorrules`; no hooks/telemetry primitives (`alwaysApply: true` for identity + router, per-route discoverability rules) |
| Generic (any LLM-aware editor) | ~40% | AGENTS.md + manual setup docs |
| Gemini CLI / Aider | — | Community adapters via PR |
| Devin / cloud agents | — | Out of scope (closed runtime) |

## Philosophy

Three rules from the source posture, preserved across all adapters:

1. **Lean cold-start.** Identity + router + memory pointer always loaded. Everything else opt-in by keyword.
2. **Observe, then prune.** Telemetry logs every skill invocation. Weekly autonomous pass archives what hasn't earned its keep.
3. **The Universal Core travels.** A 17-tool baseline ships with every TypeScript project. Domain adapters activate only when needed. See `universal/skills/agentic-prompt-architect/`.

## Status

v0.1.0 shipped four adapters (Claude Code, Codex, Generic) plus round-trip CI on `ubuntu-latest` + `windows-latest` × node 20+22. v0.2 adds the Cursor adapter, the `npx agentforge` CLI, and `docs/PLATFORM-GAPS.md` — a single audit of every documented platform gap with concrete remediation paths.

## License

MIT.
