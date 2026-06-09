# AgentForge — Cross-Adapter Platform Gaps

> Single source of truth for every documented platform gap across the four
> shipping adapters (`claude-code`, `codex`, `generic`, `cursor`) plus
> historically resolved gaps worth keeping in the audit trail. Update this file
> whenever a new gap is surfaced in an adapter README, a verification report,
> or an emit script comment. Each row carries a stable `Gap ID` so other docs
> can link to it. Inputs reconciled: `docs/VERIFICATION-v0.1.0.md`,
> `adapters/{claude-code,codex,generic,cursor}/README.md`,
> `adapters/cursor/emit.js`, and the `bin/agentforge.js` git history through
> commit `a80964d`.

## Table of contents

- [claude-code adapter](#claude-code-adapter)
- [codex adapter](#codex-adapter)
- [generic adapter](#generic-adapter)
- [cursor adapter](#cursor-adapter)
- [CLI / cross-cutting (historical)](#cli--cross-cutting-historical)
- [Recommended v0.2 cleanup batch](#recommended-v02-cleanup-batch)

---

## claude-code adapter

The reference adapter. `adapters/claude-code/README.md` declares "Known gaps:
None expected for v1." No live gaps as of v0.1.0 — Claude Code's hook API
covers every event in `spec/telemetry.yaml`. This section is intentionally
empty; if a gap surfaces during a real install, add a row here.

| Adapter | Gap ID | Description | User impact | Root cause | Remediation type | Concrete next step | Effort | Priority |
|---|---|---|---|---|---|---|---|---|
| claude-code | _(none)_ | No gaps documented. Reference adapter — full lifecycle hook coverage. | n/a | n/a | n/a | n/a | n/a | n/a |

---

## codex adapter

All six items from `docs/VERIFICATION-v0.1.0.md` § "Codex adapter (6 honest
limitations)" with fuller descriptions cross-referenced from
`adapters/codex/README.md` § "Known gaps".

| Adapter | Gap ID | Description | User impact | Root cause | Remediation type | Concrete next step | Effort | Priority |
|---|---|---|---|---|---|---|---|---|
| codex | `codex-notify-coarse` | Codex `notify` is a single hook fired for several event kinds; `codex-notify-dispatch.sh` extracts the kind from JSON payload best-effort. If the build doesn't pass an event kind, dispatch falls through to `telemetry/notify-generic.log` and skill-invocation counts under-report. | degraded | platform-limitation | fixed | Closed in commit `1ae6935`: `adapters/codex/README.md` § Verification gained a "First-install verification — notify-event coverage" subsection telling users to `tail telemetry/notify-generic.log` after one real session. Empty = full coverage; non-empty rows mean the user files the payload shape upstream (gap moves to P2 upstream-only `codex-skill-unknown`). | S | n/a |
| codex | `codex-skill-unknown` | Even on `tool-call` events, payload may not include a `"skill"` field — Codex has no first-class Skill tool category. Keyword-routed skill activations log as `"skill":"unknown"`. | degraded | platform-limitation | upstream-only | Open an upstream Codex CLI feature request asking for a `skill_name` field on tool-call notify payloads (or a dedicated `skill_invocation` event). Link the issue from `adapters/codex/README.md` gap #2 once filed. | S | P2 |
| codex | `codex-session-end-shell-only` | Codex emits no lifecycle session-end event. The shell-rc trap installed by `install-shell-trap.sh` only fires when `codex` is invoked via the wrapped function — aliases, scripts calling the bare binary, or IDE integrations bypass it. | degraded | platform-limitation | fixed | Closed in commit `1ae6935`: README gained a "Session-end coverage check" subsection (`type codex` must report 'function'; documented bypasses). `install-shell-trap.sh` now prints the coverage-check command at install time so users see it without re-reading docs. | S | n/a |
| codex | `codex-auto-approve-flags-unverified` | `spec/automation.yaml` specifies `--non-interactive --auto-approve` for the weekly prune; flags inherited verbatim from spec and not validated against any specific Codex build. | degraded | adapter-choice | fixed | Closed in commits `391e070` + `fc039c1`: `auto-prune-weekly.sh` now runs a word-bounded `grep -qE` pre-flight against `codex --help` and aborts to `telemetry/auto-prune.log` with an actionable error pointing at `spec/automation.yaml` if either flag is missing. Boundary class `(^\|[^-A-Za-z0-9])` prevents substring matches against longer flag names. | M | n/a |
| codex | `codex-no-sessionstart-router-refresh` | Claude Code's `sync-local-skill-router.js` rewrites the router table on `PostToolUse` and `SessionStart`. Codex has no `SessionStart` analog, so the auto-registered local-skills block only refreshes when the emitter is re-run. | degraded | platform-limitation | fixed | Closed in commits `b770a77` + `fc039c1`: ported `sync-local-skill-router.js` byte-identical from generic into `adapters/codex/scripts/`. The wrapped `codex()` shell function now invokes the sync before exec'ing the binary, with a `local rc=0` + `\|\| rc=$?` pattern that survives `set -e` in the caller. Same bypass surface as `codex-session-end-shell-only` (bare-binary, IDE extensions). | M | n/a |
| codex | `codex-windows-cron-not-executed` | `install-cron.sh` previously printed a `Register-ScheduledTask` PowerShell snippet rather than executing it. | cosmetic | platform-limitation | fixed | Closed in v0.3 work (commit added universal/lib/installers/ + thin wrapper). `adapters/codex/scripts/install-cron.sh` is now a thin wrapper that delegates to `<target>/scripts/installers/install-cron.sh`; the universal installer detects Windows (`$OS == "Windows_NT"` or MINGW uname) and execs `install-task.ps1` directly via `powershell -ExecutionPolicy Bypass`. | M | n/a |

### Notes

Gaps `codex-notify-coarse` and `codex-skill-unknown` interact: even if upstream
adds an event-kind field (fixing #1), keyword-routed skills still won't carry
a skill name (#2). #2 is the deeper limitation. `codex-no-sessionstart-router-refresh`
is the closest analog to a real adapter-fix because the shell trap already
exists — it just doesn't yet call the sync script.

---

## generic adapter

By design, the generic adapter ships substance without plumbing. The
"intentional gap surface" is the four user-action checklist items in
`adapters/generic/README.md` § "What you must wire up manually". Captured here
as rows so the audit is complete; remediation type for each is `docs-only`
unless we change the adapter's posture.

| Adapter | Gap ID | Description | User impact | Root cause | Remediation type | Concrete next step | Effort | Priority |
|---|---|---|---|---|---|---|---|---|
| generic | `generic-no-hooks-no-automation` | No portable hook API across the editors generic targets (Cursor older builds, Aider, Gemini CLI, Codex CLI, Copilot Chat). Adapter emits no hooks and no scheduled task. | degraded | platform-limitation | docs-only | Already documented in `adapters/generic/README.md` § "What you must wire up manually" bullets 1, 3, 4 and the per-editor recommendations table. No code change. Confirm the doc covers SessionEnd memory writes, telemetry capture, and weekly prune wiring. | S | P2 |
| generic | `generic-no-skill-loader` | No automatic SKILL.md auto-discovery on editor startup. User must re-run `sync-local-skill-router.js` after each skill edit. | degraded | platform-limitation | docs-only | Already documented in `adapters/generic/README.md` § bullet 2, with the chokidar-cli / entr / fswatch / inotifywait suggestions. No code change. | S | P2 |
| generic | `generic-no-telemetry-primitive` | Editors targeted by the generic adapter have no portable PreToolUse equivalent, so `dead-skills-report.sh` only has data if the user wires an external instrumentation path (MCP server, model-call wrapper, custom hook). | degraded | platform-limitation | docs-only | Documented in `adapters/generic/README.md` § bullet 1 and `<target>/telemetry/README.md`. Optional follow-up: link a tiny example MCP server stub in a new `docs/RECIPES/telemetry-mcp.md`; defer to v0.3. | S | P2 |
| generic | `generic-manual-memory-writes` | No SessionEnd hook → memory writes are a manual ritual after meaningful sessions. | cosmetic | platform-limitation | docs-only | Documented in `adapters/generic/README.md` § bullet 4. No code change. | S | P2 |

### Notes

The generic adapter's gaps are *features*, not defects — it explicitly trades
automation for portability. They are listed here so the audit is exhaustive
and so a future "generic-plus" adapter (e.g. Cursor-specific MCP server) has a
starting checklist.

---

## cursor adapter

From `adapters/cursor/README.md` § "Platform gaps" — 6 distinct gaps. Cursor
ships real *structure* (the `.cursor/rules/*.mdc` tree) but no *automation*.
The adapter sits between `generic` and `codex` on the coverage matrix.

| Adapter | Gap ID | Description | User impact | Root cause | Remediation type | Concrete next step | Effort | Priority |
|---|---|---|---|---|---|---|---|---|
| cursor | `cursor-no-telemetry` | Cursor exposes no `PreToolUse` / `UserPromptSubmit` / `SessionEnd` equivalents. `telemetry/skill-invocations.jsonl` exists only if the user wires an external watcher. | degraded | platform-limitation | docs-only | Already documented in `adapters/cursor/README.md` § "Platform gaps" bullet 1 and the emitted `telemetry/README.md` (see `adapters/cursor/emit.js` lines 690–712). Optional v0.3 follow-up: ship a reference MCP server in `adapters/cursor/extras/mcp-telemetry/` that bridges Cursor tool calls into the jsonl sink. | S | P2 |
| cursor | `cursor-no-skill-loader` | Cursor has no `skills/` directory contract. The emitter ships `skills/README.md` with the SKILL.md frontmatter convention, but Cursor itself won't auto-load skills — the rule system is the routing layer. | degraded | platform-limitation | docs-only | Documented in `adapters/cursor/README.md` § "Platform gaps" bullet 2 and the emitted `skills/README.md` (see `adapters/cursor/emit.js` lines 666–687). No code change. | S | P2 |
| cursor | `cursor-no-lifecycle-hooks` | No SessionEnd hook means memory writes are a manual ritual; matches generic adapter posture. | cosmetic | platform-limitation | docs-only | Documented in `adapters/cursor/README.md` § "Platform gaps" bullet 3. The emitted identity rule's memory pointer (`adapters/cursor/templates/rule-identity.mdc.tmpl`) already documents the protocol so the agent knows where to write by hand. No code change. | S | P2 |
| cursor | `cursor-no-scheduled-task` | Cursor previously had no auto-install path for its `dead-skills-report.sh` — users wired it into cron / Task Scheduler / launchd / systemd by hand per OS. | degraded | platform-limitation | fixed | Closed in v0.3 work. Cursor now ships `scripts/install-cron.sh` (thin wrapper) + `scripts/cursor-weekly-report.sh` (the actual scheduled job — runs `dead-skills-report.sh` weekly and appends to `memory/feedback/dead-skills-report-<date>.md` since Cursor has no headless binary to spawn for auto-prune). Wrapper delegates to the same `universal/lib/installers/` pair the codex adapter uses. | S | n/a |
| cursor | `cursor-no-auto-router-sync` | When the user adds or edits a `skills/<name>/SKILL.md`, Cursor needs a refreshed local-skill rule for discovery. | degraded | adapter-choice | fixed | Closed in the flagship-readiness batch: the cursor adapter now emits `.cursor/rules/local-skills.mdc` and ships `scripts/watch-skills.js`, which refreshes that rule from `skills/*/SKILL.md` with `--once` or watches continuously via `node:fs.watch`. | M | n/a |
| cursor | `cursor-cursorrules-deprecated` | `.cursorrules` is deprecated upstream but kept emitted alongside the modular `.cursor/rules/*.mdc` tree because integrations and older Cursor builds still read it. Two views kept in sync by the emitter. | cosmetic | platform-limitation | docs-only | Documented in `adapters/cursor/README.md` § "Platform gaps" bullet 6. Re-evaluate at v0.3 — if Cursor removes `.cursorrules` support, remove the emission in `adapters/cursor/emit.js` lines 598–608 and the `cursorrules.tmpl` template. | S | P2 |

### Notes

Cursor still has platform limitations, but two formerly deferred adapter-fix
items now have shipping code paths: scheduled dead-skills reports and
local-skill rule refresh through `scripts/watch-skills.js`.

---

## CLI / cross-cutting (historical)

| Adapter | Gap ID | Description | User impact | Root cause | Remediation type | Concrete next step | Effort | Priority |
|---|---|---|---|---|---|---|---|---|
| (cli) | `cli-init-cwd-footgun` | `bin/agentforge.js runInit` called `path.resolve('')` which returns `process.cwd()`, so the `!target` guard never tripped for adapters with `defaultDir: null` (generic, cursor). A missing `--dir` silently emitted into the current working directory instead of exiting 2 with the documented error. | blocker | adapter-choice | fixed | Resolved in commit `a80964d` — `bin/agentforge.js runInit` now checks the resolved-dir argument *before* calling `path.resolve`, so missing `--dir` exits 2 with the actionable message. Verified by the round-trip + pack-install tests on all 4 adapters. | S | n/a |

### Notes

This row exists so the audit's historical record is complete. Found during
Task 2 (cursor wiring); the same code path also affected the generic adapter,
so the fix improved both. No further action.

---

## Recommended v0.2 cleanup batch

Items the v0.2 ship should clear. Grouped by adapter. P0 = ship-blocker, P1 =
v0.2-ship target, P2 = deferred to v0.3+ (or accepted as documented).

### codex (6 items — 4 P1 closed in v0.2 cleanup batch, 2 P2 remain)

- ~~**P1 `codex-notify-coarse`**~~ — **closed** `1ae6935`. README verification subsection.
- ~~**P1 `codex-session-end-shell-only`**~~ — **closed** `1ae6935`. README subsection + install-time echo.
- ~~**P1 `codex-auto-approve-flags-unverified`**~~ — **closed** `391e070` + `fc039c1`. Word-bounded pre-flight in `auto-prune-weekly.sh`.
- ~~**P1 `codex-no-sessionstart-router-refresh`**~~ — **closed** `b770a77` + `fc039c1`. Sync script ported + invoked from shell wrapper.
- **P2 `codex-skill-unknown`** — file the upstream issue; no code change. Deferred.
- ~~**P2 `codex-windows-cron-not-executed`**~~ — **closed** by `universal/lib/installers/` + codex thin wrapper.

Codex coverage after v0.2.1 P1 batch + v0.3 installers: ~85% → ~98%.

### generic (0 P0/P1 items)

All four generic gaps are intentional posture. Already documented. No v0.2
work required.

### cursor (0 P0/P1 items)

All six cursor gaps are documented in `adapters/cursor/README.md` § "Platform
gaps". `cursor-no-scheduled-task` and `cursor-no-auto-router-sync` now have
shipping adapter fixes. Remaining cursor gaps are platform limitations or
docs-only posture notes.

### claude-code (0 items)

No gaps.

### cli / historical (0 open items)

`cli-init-cwd-footgun` is fixed in `a80964d`. No open work.

### Rationale for the cut line

P2 items now fall mostly into upstream-only or intentionally manual posture:
AgentForge can't ship `codex-skill-unknown` without the platform vendor moving
first, while Cursor telemetry, skill-loader, and lifecycle gaps need external
platform support or user instrumentation. The four cursor P2 docs-only
rows are *already documented* in the adapter README and the emitted
`telemetry/README.md` / `skills/README.md` — they need no v0.2 action. The
P1 batch above is scoped at roughly half a day of work and clears every codex
gap that AgentForge can address without an upstream change.
