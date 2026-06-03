# AgentForge v0.1.0 — Verification Report

> Phase 5 round-trip audit. Dated 2026-06-03.

## Sandbox round-trip results

Three adapters were each run against a fresh sandbox dir, then re-run to verify idempotency.

| Adapter | Sandbox | First emit (files / bytes) | Second emit (files_changed) | Idempotent? |
|---|---|---|---|---|
| `claude-code` | `C:/tmp/agentforge-test-claude/` | 13 files / 48 KB | `git status` empty | ✅ |
| `codex` | `C:/tmp/agentforge-test-codex/` | 20 files / 62 KB | `files_changed: 0` | ✅ |
| `generic` | `C:/tmp/agentforge-test-generic/` | 7 files / 20 KB | `files_changed: 0` | ✅ |

## Structural parity (Claude Code adapter vs current `~/.claude/`)

The Claude Code adapter is the reference adapter — its output must match the current `~/.claude/` posture that the overhaul produced over commits `e0b4501 → 95d142e`.

| Section | Original `~/.claude/CLAUDE.md` | Emitted | Status |
|---|---|---|---|
| Identity | line 1–8 | matched | ✅ |
| Stack Defaults | line 10–12 | matched (96/100 baseline + shorthand) | ✅ |
| Execution Rules | line 14–20 | matched | ✅ |
| Skill Router | line 22–38 | matched (with backticks restored in v0.1.0 amendment) | ✅ |
| AUTO-LOCAL-SKILLS markers | line 41–47 | preserved as placeholders (sync script populates at runtime) | ✅ |
| Spec-Driven Development | line 49–51 | matched | ✅ |
| Memory Protocol | line 53–57 | matched | ✅ |
| Context Discipline | line 59–66 | matched | ✅ |
| Project Conventions | line 68–72 | matched | ✅ |
| Self-Healing | line 74–77 | matched | ✅ |

## Spec amendments during Phase 5

| Amendment | Reason | Files touched |
|---|---|---|
| Backticks around plugin/skill names in `router.yaml` target strings | Worker A flagged formatting loss in rendered tables. Spec values now carry the markdown formatting they need. | `spec/router.yaml` (10 routes) |

No spec gaps. No `needs_spec_amendment` from any Worker.

## Platform gaps (deliberate, documented)

### Codex adapter (6 honest limitations)

1. `notify` is a single coarse hook; dispatch script extracts event kind from JSON payload best-effort.
2. Skill-tool isolation lacks first-class support (Codex has no Skill tool category); log rows may read `"skill":"unknown"` for keyword-routed activations.
3. Session-end only fires when `codex` is invoked via the wrapped shell function.
4. `--non-interactive --auto-approve` flags inherited verbatim from spec; verify against installed Codex build.
5. No `SessionStart` analog for local-skill router auto-refresh — only re-emit refreshes.
6. Windows `install-cron.sh` prints a PowerShell snippet rather than executing (elevation needed).

### Generic adapter (~40% of Claude Code coverage)

By design. Generic emits a single AGENTS.md + skills + memory directories. No hooks, no scheduled task, no auto-router-sync. The user assembles those manually using the per-editor recommendations in `adapters/generic/README.md`.

## Ship gate metrics

- ✅ All three round-trips green.
- ✅ Generated `C:/tmp/agentforge-test-claude/CLAUDE.md` is structurally identical to `~/.claude/CLAUDE.md` (modulo timestamp + AUTO-LOCAL-SKILLS placeholder which is populated at runtime).
- ✅ `README.md` philosophy section reads cleanly without prior context.
- ✅ Git history clean: 7 phase commits + 1 spec amendment.
- ✅ Tagged `v0.1.0`.

## Git history at v0.1.0

```
v0.1.0 → spec(router): amend phase 5 - backticks around plugin/skill names
       → feat(bootstrap): phase 4 - cross-platform installer
       → feat(adapters/generic): phase 2C
       → feat(adapters/claude-code): phase 2A
       → feat(adapters/codex): phase 2B
       → feat(universal): phase 3
       → spec: phase 1 - 5 YAML files + SPEC.md contract (FROZEN for phase 2 parallel)
       → chore: phase 0 - repo skeleton + README
```

## What v0.1.0 ships

- **3 adapters** (claude-code, codex, generic)
- **5 spec files** + contract doc
- **5 universal skills** (agentic-prompt-architect, rules + 15 refs, diagnose, handoff, write-a-skill)
- **2 HTML lessons** (spec-kit + TDD course, overhaul recap presentation)
- **Bootstrap installer** (bash + PowerShell + init wrapper)
- **Honest platform gap documentation** per adapter

## What v0.1.0 does NOT ship (deferred to community PRs or future versions)

- Cursor adapter
- Gemini CLI adapter
- Aider adapter
- File-watcher fallback for platforms without lifecycle hooks (for sync-local-skill-router.js)
- `npx agentforge` npm package wrapper
- GitHub Actions CI for the round-trip tests

## Rollback

Any v0.1.0 install can be rolled back:

```bash
git -C <target> reset --hard HEAD~1
```

The AgentForge repo itself can be rolled back to the pre-v0.1.0 state:

```bash
git -C C:/AI/AgentForge reset --hard <commit-before-v0.1.0-tag>
```
