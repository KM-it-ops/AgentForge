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
| codex | `codex-notify-coarse` | Codex `notify` is a single hook fired for several event kinds; `codex-notify-dispatch.sh` extracts the kind from JSON payload best-effort. If the build doesn't pass an event kind, dispatch falls through to `telemetry/notify-generic.log` and skill-invocation counts under-report. | degraded | platform-limitation | docs-only | Add a "First-install verification" subsection to `adapters/codex/README.md` § Verification that instructs the user to run a representative session, then `tail telemetry/notify-generic.log` and confirm it is empty (events all classified). If non-empty, file the payload shape upstream. | S | P1 |
| codex | `codex-skill-unknown` | Even on `tool-call` events, payload may not include a `"skill"` field — Codex has no first-class Skill tool category. Keyword-routed skill activations log as `"skill":"unknown"`. | degraded | platform-limitation | upstream-only | Open an upstream Codex CLI feature request asking for a `skill_name` field on tool-call notify payloads (or a dedicated `skill_invocation` event). Link the issue from `adapters/codex/README.md` gap #2 once filed. | S | P2 |
| codex | `codex-session-end-shell-only` | Codex emits no lifecycle session-end event. The shell-rc trap installed by `install-shell-trap.sh` only fires when `codex` is invoked via the wrapped function — aliases, scripts calling the bare binary, or IDE integrations bypass it. | degraded | platform-limitation | docs-only | Expand `adapters/codex/README.md` gap #3 with a checklist: (a) confirm `type codex` shows "function", (b) note that VS Code/JetBrains Codex extensions bypass the trap. Add a `# AgentForge session-end coverage check` echo to `install-shell-trap.sh` so users can verify. | S | P1 |
| codex | `codex-auto-approve-flags-unverified` | `spec/automation.yaml` specifies `--non-interactive --auto-approve` for the weekly prune; flags inherited verbatim from spec and not validated against any specific Codex build. | degraded | adapter-choice | adapter-fix | In `adapters/codex/scripts/auto-prune-weekly.sh` add a pre-flight `codex --help \| grep -E -- "--non-interactive\|--auto-approve"` check that aborts with an actionable message if either flag is missing. Then document the verified Codex version range in `adapters/codex/README.md` gap #4. | M | P1 |
| codex | `codex-no-sessionstart-router-refresh` | Claude Code's `sync-local-skill-router.js` rewrites the router table on `PostToolUse` and `SessionStart`. Codex has no `SessionStart` analog, so the auto-registered local-skills block only refreshes when the emitter is re-run. | degraded | platform-limitation | adapter-fix | Extend `adapters/codex/scripts/install-shell-trap.sh` so the shell function also runs `node "$AGENT_HOME/scripts/sync-local-skill-router.js"` before exec'ing `codex` (best-effort, swallow errors). Ship `sync-local-skill-router.js` from the codex adapter (copy the generic adapter's `adapters/generic/scripts/sync-local-skill-router.js`). | M | P1 |
| codex | `codex-windows-cron-not-executed` | `install-cron.sh` prints a `Register-ScheduledTask` PowerShell snippet rather than executing it directly — elevation required. | cosmetic | platform-limitation | adapter-fix | Add a sibling `adapters/codex/scripts/install-task.ps1` modeled on `adapters/claude-code/` Task Scheduler installer and have `install-cron.sh` detect Windows (`$OS == "Windows_NT"` or uname Cygwin/MINGW) and invoke `powershell -ExecutionPolicy Bypass -File install-task.ps1` directly; still safe — the .ps1 itself prompts for elevation via `Start-Process -Verb RunAs` if not already admin. | M | P2 |

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
| cursor | `cursor-no-scheduled-task` | Cursor cannot run weekly prunes. `dead-skills-report.sh` is shipped (byte-identical to generic) but the user wires it into cron / Task Scheduler / launchd / systemd per OS. | degraded | platform-limitation | docs-only | Documented in `adapters/cursor/README.md` § "Platform gaps" bullet 4. Optional adapter-fix: factor the `claude-code` adapter's `install-task.ps1` and a sibling `install-cron.sh` into `universal/lib/installers/` and have the cursor adapter ship them too. Defer to v0.3 — keeps cursor lean. | S | P2 |
| cursor | `cursor-no-auto-router-sync` | When the user adds or edits a `skills/<name>/SKILL.md`, they must re-run `node adapters/cursor/emit.js <target>` to regenerate the router rules. No on-write file watcher. | degraded | adapter-choice | docs-only | Documented in `adapters/cursor/README.md` § "Platform gaps" bullet 5. Adapter-fix path (deferred): ship a `scripts/watch-skills.js` using `node:fs.watch` that re-invokes `emit.js` on `skills/**/SKILL.md` changes. Defer to v0.3 — most users edit skills rarely. | M | P2 |
| cursor | `cursor-cursorrules-deprecated` | `.cursorrules` is deprecated upstream but kept emitted alongside the modular `.cursor/rules/*.mdc` tree because integrations and older Cursor builds still read it. Two views kept in sync by the emitter. | cosmetic | platform-limitation | docs-only | Documented in `adapters/cursor/README.md` § "Platform gaps" bullet 6. Re-evaluate at v0.3 — if Cursor removes `.cursorrules` support, remove the emission in `adapters/cursor/emit.js` lines 598–608 and the `cursorrules.tmpl` template. | S | P2 |

### Notes

All cursor gaps are documented but none have shipping adapter-fix code paths
in v0.2. The cursor adapter's value-add in v0.2 is the `.mdc` rule tree
structure, not automation. The `cursor-no-auto-router-sync` and
`cursor-no-scheduled-task` rows would each be `adapter-fix` candidates in v0.3
once a shared installer library exists under `universal/lib/`.

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

### codex (6 items)

- **P1 `codex-notify-coarse`** — docs-only verification subsection in `adapters/codex/README.md`. ~30 min.
- **P1 `codex-session-end-shell-only`** — expand README gap #3 + add a coverage-check echo to `install-shell-trap.sh`. ~45 min.
- **P1 `codex-auto-approve-flags-unverified`** — pre-flight flag check in `adapters/codex/scripts/auto-prune-weekly.sh` + document verified Codex version. ~2h.
- **P1 `codex-no-sessionstart-router-refresh`** — port the generic adapter's `sync-local-skill-router.js` into the codex adapter and have the shell trap call it before exec. ~2h.
- **P2 `codex-skill-unknown`** — file the upstream issue; no code change. Deferred.
- **P2 `codex-windows-cron-not-executed`** — adapter-fix needs a new `install-task.ps1` for codex; defer until the shared installer library exists.

### generic (0 P0/P1 items)

All four generic gaps are intentional posture. Already documented. No v0.2
work required.

### cursor (0 P0/P1 items)

All six cursor gaps are documented in `adapters/cursor/README.md` § "Platform
gaps". Two are adapter-fix candidates (`cursor-no-auto-router-sync`,
`cursor-no-scheduled-task`) but both depend on a shared installer/watcher
library that doesn't exist yet — defer to v0.3.

### claude-code (0 items)

No gaps.

### cli / historical (0 open items)

`cli-init-cwd-footgun` is fixed in `a80964d`. No open work.

### Rationale for the cut line

P2 items fall into two buckets: (1) **upstream-only** gaps where AgentForge
can't ship a fix without the platform vendor moving first
(`codex-skill-unknown`), and (2) **shared-infrastructure** gaps that would
each be small in isolation but together motivate one consolidated
`universal/lib/installers/` module in v0.3 (`codex-windows-cron-not-executed`,
`cursor-no-scheduled-task`, `cursor-no-auto-router-sync`). Shipping each
piecemeal in v0.2 would duplicate code across adapters and lock in
adapter-specific paths we'd then have to refactor. The four cursor P2 docs-only
rows are *already documented* in the adapter README and the emitted
`telemetry/README.md` / `skills/README.md` — they need no v0.2 action. The
P1 batch above is scoped at roughly half a day of work and clears every codex
gap that AgentForge can address without an upstream change.
