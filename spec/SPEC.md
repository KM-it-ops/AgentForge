# AgentForge Spec Contract

> **Frozen for Phase 2 parallel work.** Any field gap discovered by a Phase 2 Worker
> halts that Worker with a `needs_spec_amendment` receipt. The PM amends sequentially,
> then re-greenlights all Workers. This is the only legal way to revise the spec mid-parallel.

This document describes the contract between `spec/*.yaml` and the per-platform adapters in `adapters/`.

## Files

| File | Purpose | Schema version |
|---|---|---|
| `spec/identity.yaml` | User identity, stack baseline, execution + context rules | 1 |
| `spec/router.yaml` | Pattern → skill routes (manual + auto-registered) | 1 |
| `spec/memory.yaml` | Memory bucket structure, protocol, index template | 1 |
| `spec/telemetry.yaml` | Events to observe + jsonl sinks + adapter notes | 1 |
| `spec/automation.yaml` | Weekly prune schedule, agent prompt template, safety bounds | 1 |

## Adapter contract

Every adapter MUST:

1. **Read all 5 spec files.** No optional reads. The spec is the single source of truth.
2. **Emit platform-native identity file** rendered from `identity.yaml` + `router.yaml`. For Claude Code that's `CLAUDE.md`; for Codex that's `AGENTS.md`; for generic that's also `AGENTS.md`.
3. **Create memory directory structure** per `memory.yaml` buckets. Generate `MEMORY.md` index from the template.
4. **Wire telemetry events** per `telemetry.yaml` to the platform's hook mechanism. If a hook type is unavailable on the platform, the adapter MUST document the gap in `adapters/<platform>/README.md` honestly — never silently degrade.
5. **Install the weekly prune** per `automation.yaml`. Render the prompt template with platform-specific substitutions (`{agent_home}`, `{latest_report_path}`, etc.). Wire the schedule into the platform's cron-like mechanism.
6. **Ship the universal layer** by copying `universal/skills/`, `universal/memory/`, `universal/docs/`, `universal/lib/` into the platform's expected locations.
7. **Be idempotent.** Re-running `bootstrap.sh <platform>` MUST produce zero diff.
8. **Be reversible.** Every install creates a git-tracked checkpoint in the target dir.

Every adapter MUST NOT:

- Modify files outside its own platform's home dir.
- Cross-reference another adapter (no `import ../codex/...` from claude-code).
- Hard-code paths or values that live in the spec.
- Silently degrade. If a feature can't port, document the gap in the platform README.

## Substitution variables (used in spec templates)

Adapters substitute these at emit time. The values vary per platform.

| Variable | Meaning | Claude Code | Codex | Generic |
|---|---|---|---|---|
| `{agent_home}` | The platform's config root | `~/.claude/` | `~/.codex/` | target dir from CLI arg |
| `{identity_file}` | Platform's identity filename | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| `{skills_root}` | Where skills live | `~/.claude/skills/` | `~/.codex/skills/` | `{target}/skills/` (manual) |
| `{telemetry_skills_path}` | jsonl sink for skill invocations | `~/.claude/telemetry/skill-invocations.jsonl` | `~/.codex/telemetry/skill-invocations.jsonl` | (none — documented gap) |
| `{telemetry_prompts_path}` | jsonl sink for prompts | `~/.claude/telemetry/prompts.jsonl` | `~/.codex/telemetry/prompts.jsonl` | (none) |
| `{latest_report_path}` | Most recent dead-skills report | computed at runtime | computed at runtime | computed at runtime |
| `{grace_period_days}` | Days before archive | from `automation.yaml` | same | same |
| `{date}` | Current date | shell `$(date +%F)` | same | same |

## Round-trip invariant

For the Claude Code adapter specifically: regenerating `~/.claude/` from `spec/` MUST produce a tree byte-identical to the current `~/.claude/` (modulo the "Last updated" timestamp line in CLAUDE.md and any session-specific log files). This is the test that proves the spec captures the full posture.

Any explainable drift must be documented as a deliberate spec improvement, never an accidental loss.

## Versioning

`schema_version: 1` is on every spec file. Adapters MUST refuse to emit if they see an unknown version. Future schema changes bump this field across all five files atomically.
