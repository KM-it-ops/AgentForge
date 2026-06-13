# cursor adapter

AgentForge adapter for [Cursor](https://cursor.com). Emits the modular
`.cursor/rules/*.mdc` rule tree (current format) plus a `.cursorrules` legacy
single-file mirror, the universal memory skeleton, and the portable
`dead-skills-report.sh` script.

More structured than the `generic` adapter (Cursor has a real rule system) but
the same "context-only, no automation" posture — Cursor exposes no native
telemetry, lifecycle hooks, scheduled tasks, or memory primitive.

## What it emits

Given a target directory, `emit.js` writes:

```
<target>/
├── .cursorrules                       # legacy single-file body
├── .cursor/
│   └── rules/
│       ├── identity.mdc               # alwaysApply: true
│       ├── router.mdc                 # alwaysApply: true
│       ├── local-skills.mdc           # alwaysApply: true, generated from skills/*/SKILL.md
│       └── route-<id>.mdc             # one per spec.router.manual_routes
├── MEMORY.md                          # memory index with manual-write protocol
├── memory/
│   ├── user/.gitkeep
│   ├── feedback/.gitkeep
│   ├── project/.gitkeep
│   └── reference/.gitkeep
├── skills/
│   └── README.md                      # manual-add convention for SKILL.md dirs
├── telemetry/
│   └── README.md                      # honest gap doc (Cursor has no telemetry)
└── scripts/
    ├── dead-skills-report.sh          # byte-identical copy from adapters/generic/
    └── watch-skills.js                # refreshes .cursor/rules/local-skills.mdc
```

Re-running is idempotent. If the target dir is a git repo with pending
changes, the emitter creates an `agentforge: pre-emit checkpoint (cursor
adapter)` commit so a rollback is one `git reset --hard HEAD~1` away. If the
target is not a git repo, the checkpoint step is skipped (the emitter does
**not** `git init` the target).

## Cursor rule model — what we emit and why

Cursor's rule system (current):

- `.cursor/rules/*.mdc` — modular rule files. Each has YAML frontmatter:
  - `description` — human-readable summary (Cursor uses it for rule selection).
  - `globs` — file glob(s) that activate the rule; we default to `**/*`.
  - `alwaysApply` — when `true`, the rule is always in context.
- `.cursorrules` — legacy single-file rule body at the project root. Still
  supported by Cursor; deprecated but useful for tools that haven't been
  updated to the modular format.

Our mapping:

| Emitted file | `alwaysApply` | Purpose |
|---|---|---|
| `.cursor/rules/identity.mdc` | `true` | Identity + stack defaults + execution rules + memory pointer |
| `.cursor/rules/router.mdc` | `true` | Full skill router table from `spec.router.manual_routes` |
| `.cursor/rules/local-skills.mdc` | `true` | Generated local SKILL.md table maintained by `scripts/watch-skills.js` |
| `.cursor/rules/route-<id>.mdc` | `false` | One per route — triggers + load target, discoverable on its own |
| `.cursorrules` | n/a | Consolidated legacy view (identity + execution + router + memory pointer) |

Per-route rules are emitted with `alwaysApply: false` because the router table
in `router.mdc` already provides the matching layer — the per-route files are
there so each route is independently discoverable when Cursor surfaces rules
by description, and so adding a new route is a one-file change.

### Why per-route `.mdc` files?

Cursor's rule-picker UI surfaces every `.mdc` file as a searchable entry by
its `description`, so per-route files give each route an independently
discoverable handle. `alwaysApply: false` keeps them out of the always-on
context budget — they only enter context when Cursor matches them. Treat
them as a discoverability layer in front of the consolidated router table in
`.cursor/rules/router.mdc`, not as a parallel source of truth.

## Usage

```sh
# Emit into a target dir
node adapters/cursor/emit.js /path/to/project

# Or into the user's home directory (tilde is expanded)
node adapters/cursor/emit.js ~/agent-home

# Run the dead-skills report (after you have telemetry)
bash /path/to/project/scripts/dead-skills-report.sh

# Refresh local skill discovery once, or watch while editing skills
node /path/to/project/scripts/watch-skills.js --once /path/to/project
node /path/to/project/scripts/watch-skills.js /path/to/project
```

The emit script prints a JSON receipt: paths written, which ones changed, and
the git checkpoint SHA (if any).

## Idempotency contract

- Same spec + same target → byte-identical output on every run.
- The emitter only writes files whose content has actually changed
  (`writeIfChanged`).
- Re-emit prints `"files_changed": 0` and `git status --porcelain` stays empty
  inside a git-repo target.
- Memory bucket dirs are created once (empty `.gitkeep`); the emitter never
  overwrites an existing memory file on subsequent runs. Logs live in `logs/`,
  not `memory/`.
- **Merge-safe `.cursorrules`** — AgentForge content lives inside an
  `AGENTFORGE:BEGIN`/`AGENTFORGE:END` managed block. If you already hand-author
  `.cursorrules`, the block is mounted atop your file on first emit and only the
  block is rewritten thereafter, so your own rules are preserved.

## Platform gaps

Findings from building this adapter — input for the round-trip / audit report:

- **No telemetry primitive.** Cursor has no PreToolUse / UserPromptSubmit /
  SessionEnd equivalents. `telemetry/skill-invocations.jsonl` exists only if
  the user wires an external watcher (MCP server, shell wrapper, IDE
  extension). Documented in `telemetry/README.md`.
- **No skill-loader concept.** Cursor doesn't have a `skills/` directory
  contract. The adapter ships a `skills/README.md` describing the SKILL.md
  frontmatter convention so the router rules can point at curated skills,
  but Cursor itself won't auto-load them — the rule system is the
  routing layer.
- **No lifecycle hooks.** No SessionEnd hook means memory writes are a
  manual ritual (matches the generic adapter posture). The identity rule's
  memory pointer documents the protocol so the agent knows where to write
  by hand.
- **No scheduled-task primitive.** Cursor still cannot run weekly *prunes*
  (no headless binary to spawn), but **as of v0.3** the adapter ships
  `scripts/install-cron.sh` (thin wrapper) + `scripts/cursor-weekly-report.sh`
  that schedule `dead-skills-report.sh` weekly and append the output to
  `logs/dead-skills-report-<date>.md`. The wrapper delegates to
  `scripts/installers/install-cron.sh` (cron on Unix, Task Scheduler on
  Windows). Review the appended report on your next session and archive
  unused skills by hand.
- **Local skill auto-router sync.** **Closed in the flagship-readiness batch.**
  `scripts/watch-skills.js` maintains `.cursor/rules/local-skills.mdc` from
  `skills/*/SKILL.md`. Run it with `--once` for deterministic refreshes or
  without `--once` to watch while editing local skills.
- **`.cursorrules` is deprecated but kept.** We emit both the legacy file and
  the modular `.mdc` tree because Cursor still respects `.cursorrules` and
  some integrations (and older Cursor builds) read only that file. The two
  views are kept in sync by the emitter.

## Where the cursor adapter sits vs. the others

| Adapter | Hooks | Telemetry | Skill loader | Scheduler | Idempotent |
|---|---|---|---|---|---|
| `claude-code` | ✅ PreToolUse + UserPromptSubmit + SessionEnd | ✅ jsonl sinks | ✅ auto-router | ✅ Windows Task | ✅ |
| `codex` | ⚠️ notify-event hook | ⚠️ jsonl, granularity caveat | ⚠️ on disk, no auto-loader | ⚠️ cron entry | ✅ |
| `cursor` | ❌ none | ❌ user-instrumented only | ⚠️ rules layer + local-skill watcher | ✅ weekly report | ✅ |
| `generic` | ❌ none | ❌ user-instrumented only | ❌ manual | ❌ user-wired | ✅ |

The cursor adapter sits between `generic` and `codex` in posture: it has
real *structure* (the `.mdc` rule tree) but no *automation*. If you want
Claude-Code-grade coverage inside Cursor today, you need an external MCP
server to bridge the gaps documented above.
