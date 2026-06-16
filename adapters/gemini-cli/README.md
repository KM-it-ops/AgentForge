# gemini-cli adapter

AgentForge adapter for the [Gemini CLI](https://github.com/google-gemini/gemini-cli).
Structurally a twin of the `claude-code` adapter — a Markdown context file plus a
JSON settings file — but tuned to Gemini's config surface and merge-safe so it
never clobbers a user's primary `~/.gemini/settings.json`.

## What it emits

Default target is `~/.gemini` (the global Gemini config home; override with
`--dir`). `emit.js` writes:

```
<target>/
├── GEMINI.md                       # the context/identity file Gemini loads by default
├── settings.json                   # merge-safe: contextFileName, telemetry, mcpServers
├── MEMORY.md                       # memory index with the write protocol
├── memory/{user,feedback,project,reference}/.gitkeep
├── skills/README.md                # SKILL.md frontmatter convention
├── telemetry/README.md             # honest "OpenTelemetry-only, no shell hooks" doc
├── scripts/
│   ├── gemini-weekly-report.sh
│   ├── dead-skills-report.sh
│   ├── sync-local-skill-router.js
│   ├── watch-skills.js                # live-refreshes the GEMINI.md AUTO-LOCAL-SKILLS block
│   ├── install-cron.sh
│   └── installers/{install-cron.sh, install-task.ps1, README.md}
└── .agentforge-emit-date           # pins the rendered date for idempotent re-emits
```

Re-running is idempotent: a second emit prints `"files_changed": 0` and leaves
`git status --porcelain` empty inside a git-repo target. It never `git init`s a
target that is not already a git repo.

## How Gemini CLI consumes the output

- **Context file: `GEMINI.md`.** Gemini loads `GEMINI.md` hierarchically (global
  `~/.gemini/GEMINI.md` + project + subdirs) as persistent context. AgentForge
  renders the identity block, execution rules, skill-router table, memory
  protocol, and local-skills table into it.
- **Settings: `settings.json`.** Carries `contextFileName: "GEMINI.md"`, a
  default `telemetry` block, and `mcpServers`.
- **MCP via `mcpServers` (native).** When `spec/mcp.yaml` declares servers, the
  emitter merges them into `settings.json.mcpServers` (`{ command, args, env }`).
  Unlike the Claude Code plugin, Gemini does **not** manage `context-mode` as a
  plugin, so `context-mode` **is** registered here (`npx -y context-mode`),
  exactly like the codex/cursor adapters.

## Merge-safety

`settings.json` is Gemini's primary config (API prefs, theme, other MCP servers),
so it is **merge-safe**:

- **No file** → AgentForge's managed shape is written.
- **Existing file** → AgentForge-managed top-level keys are added only when
  absent (your values win), and spec MCP servers are merged into `mcpServers`
  without overwriting a same-named entry. Your `theme`, `telemetry`, and other
  `mcpServers` survive every re-emit.
- **Invalid-JSON file** → never clobbered; AgentForge drops a
  `settings.agentforge.json` sidecar for manual merge.

`GEMINI.md` uses an `<!-- AGENTFORGE:BEGIN --> / <!-- AGENTFORGE:END -->` managed
block (the same marker approach the codex/cursor adapters use): a hand-authored
`GEMINI.md` is preserved on adoption, and a re-emit replaces only the block —
never duplicating it.

## Usage

```sh
# Emit into the default Gemini home (~/.gemini)
node adapters/gemini-cli/emit.js ~/.gemini

# After dropping a new skill at <target>/skills/my-skill/SKILL.md
node <target>/scripts/sync-local-skill-router.js

# ...or keep the GEMINI.md skills block refreshed live while you edit
node <target>/scripts/watch-skills.js <target>          # watch + refresh
node <target>/scripts/watch-skills.js --once <target>   # one sync, then exit
```

The emit script prints a JSON receipt: `{ target, checkpoint_sha, files_written,
files_changed, details }`.

## Platform gaps (honest coverage)

| Capability | gemini-cli adapter |
|---|---|
| Context loading | ✅ `GEMINI.md` (hierarchical, `contextFileName`) |
| MCP servers | ✅ native `settings.json.mcpServers` |
| Memory scaffold | ✅ `MEMORY.md` + `memory/` buckets |
| Skill loader | ❌ none — router table reasoned over inline |
| Lifecycle shell hooks | ❌ none — Gemini exposes OpenTelemetry config in `settings.json` but no SessionEnd shell hook |
| Telemetry primitive | ⚠️ OpenTelemetry only (no event-driven skill instrumentation) |
| Scheduler | ⚠️ none native — prune runs via cron / Task Scheduler installers in `scripts/installers/` |
| Idempotent | ✅ second emit = `files_changed: 0` |
| Merge-safe config | ✅ `settings.json` add-if-absent merge + `GEMINI.md` managed block |

Because Gemini has no native lifecycle shell hooks, router-refresh and the
weekly prune are scheduler-driven (cron/Task Scheduler) rather than event-driven.
For Claude-Code-grade event automation, use the `claude-code` adapter.
