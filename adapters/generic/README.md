# generic adapter

The lowest-common-denominator AgentForge adapter. Emits a portable `AGENTS.md`
plus a memory skeleton plus two helper scripts. Trades automation for
portability.

## What it emits

Given a target directory, `emit.js` writes:

```
<target>/
├── AGENTS.md                     # universal identity file (≤ 200 lines)
├── MEMORY.md                     # memory index with manual-write protocol
├── memory/
│   ├── user/
│   ├── feedback/
│   │   └── session-log.md        # seeded per spec
│   ├── project/
│   └── reference/
├── skills/
│   └── README.md                 # instructs how to drop SKILL.md dirs
├── telemetry/
│   └── README.md                 # honest gap doc
└── scripts/
    ├── sync-local-skill-router.js
    └── dead-skills-report.sh
```

Re-running is idempotent. If the target dir is a git repo with pending changes,
the emitter creates a `agentforge: pre-emit checkpoint (generic adapter)`
commit so a rollback is one `git reset --hard HEAD~1` away.

## Honest coverage: ~40% of Claude Code

The Claude Code adapter ships a fully wired lifecycle: PreToolUse +
UserPromptSubmit + SessionEnd hooks, an auto-managed skill router that
re-syncs on every SKILL.md write, telemetry jsonl sinks, and a weekly
Task-Scheduler-driven prune. That posture is real but it depends on Claude
Code's hook API.

The generic adapter cannot assume any of that. There is no portable hook API
across Cursor, Aider, Gemini CLI, Codex CLI, Copilot Chat, and whatever ships
next quarter. So the generic adapter ships the **substance** and documents the
**plumbing** as a user-action checklist.

What you get out of the box:

- ✅ The full **identity file** (user, stack defaults, execution rules, context
  discipline, self-healing protocol).
- ✅ The **skill router table** — every manual route rendered with its
  generic-adapter target instruction.
- ✅ The **memory protocol** and the bucket directory structure, with the
  seeded `session-log.md`.
- ✅ A **skills directory** with a README that explains the SKILL.md
  frontmatter contract.
- ✅ `scripts/sync-local-skill-router.js` — rewrites the AUTO-LOCAL-SKILLS
  table between marker comments in `AGENTS.md`. Idempotent. Portable. Run
  manually after each skill edit, or wire into a file-watcher.
- ✅ `scripts/dead-skills-report.sh` — reads `telemetry/skill-invocations.jsonl`
  if present and writes a dated report to `memory/feedback/`. Tells you
  honestly when there's no telemetry to compare against.

What you must wire up manually:

- ❌ **Telemetry capture.** No `PreToolUse` analogue exists across all editors.
  If you want the dead-skills loop to have data, instrument your editor (MCP
  server, model-call wrapper, on-tool-use hook) to append
  `{"ts":"<iso>","skill":"<name>"}` lines to `telemetry/skill-invocations.jsonl`.
- ❌ **Auto skill-router sync.** Run `node scripts/sync-local-skill-router.js`
  after each SKILL.md change, or watch `skills/**/SKILL.md` with `chokidar-cli`,
  `entr`, `fswatch`, or `inotifywait`.
- ❌ **Weekly prune schedule.** Add a cron line, a Windows Task Scheduler entry,
  a launchd plist, or a systemd timer that runs
  `bash scripts/dead-skills-report.sh` every Friday 3pm.
- ❌ **SessionEnd memory writes.** Manual ritual: after a meaningful session,
  append one entry per genuine learning to the right `memory/<bucket>/` file
  and update the index pointer.

## Per-editor recommendations

| Editor | Generic-adapter fit | Notes |
|---|---|---|
| Cursor | High | Reads top-level `AGENTS.md` in recent versions; older versions need `.cursorrules`. MCP servers can pipe invocation logs into telemetry. |
| Aider | High | Auto-loads `AGENTS.md` (recent versions) or via `--read AGENTS.md`. `/run` and `/test` are good telemetry hook points. |
| Gemini CLI | Medium | Prefers `GEMINI.md` — symlink or copy. No native router concept; reasoned over inline. |
| Codex CLI | Medium (fallback) | Use the dedicated `codex` adapter for tighter hook coverage; this generic file works as a baseline. |
| GitHub Copilot Chat | Medium | Symlink to `.github/copilot-instructions.md`. No invocation hooks. |
| Anything with a system-prompt-file flag | Variable | Point the flag at `AGENTS.md`. Wire its tool-use hook into telemetry if it has one. |
| Claude Code | Use the `claude-code` adapter | This generic adapter exists as a fallback for editors without a dedicated adapter. |

## Usage

```sh
# Emit into a target dir
node adapters/generic/emit.js /path/to/agent-home

# After dropping a new skill at /path/to/agent-home/skills/my-skill/SKILL.md
node /path/to/agent-home/scripts/sync-local-skill-router.js

# Run the dead-skills report (after you have telemetry)
bash /path/to/agent-home/scripts/dead-skills-report.sh
```

The emit script prints a JSON receipt: paths written, which ones changed, and
the git checkpoint SHA (if any).

## Idempotency contract

- Same spec + same target → byte-identical output on every run.
- The emitter only writes files whose content has actually changed.
- The AUTO-LOCAL-SKILLS block in `AGENTS.md` is the one section managed by
  `sync-local-skill-router.js`; everything between the marker comments is
  owned by the sync script, everything outside the markers is owned by the
  emitter.
- Memory bucket dirs and seeded files are created once; the emitter never
  overwrites a `session-log.md` that already exists, so user-appended history
  is safe.

## Limitations, restated

This adapter is the floor, not the ceiling. If you want Claude-Code-grade
automation, use the Claude Code adapter. If you want a dedicated adapter for
your editor, contribute one — the spec layer is the same.
