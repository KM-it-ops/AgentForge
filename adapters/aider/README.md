# aider adapter

AgentForge adapter for [Aider](https://aider.chat). A **minimal-posture**
adapter: a conventions file plus a YAML config. Structurally this is the
`generic` adapter with an Aider-native config writer bolted on.

Aider exposes no skill loader, no lifecycle hooks, and no native memory store,
so this adapter ships the **substance** (identity, router, memory protocol) and
documents the **plumbing** as a user-action checklist — the same "context-only,
no automation" posture as the `generic` and `cursor` adapters.

## What it emits

Given a target directory, `emit.js` writes:

```
<target>/
├── CONVENTIONS.md                  # coding posture — the file Aider loads via `read:`
├── .aider.conf.yml                 # merge-safe config: `read: CONVENTIONS.md` (+ optional MCP block)
├── MEMORY.md                       # memory index with manual-write protocol
├── memory/
│   ├── user/.gitkeep
│   ├── feedback/.gitkeep
│   ├── project/.gitkeep
│   └── reference/.gitkeep
├── skills/
│   └── README.md                   # SKILL.md frontmatter convention (no auto-loader)
├── telemetry/
│   └── README.md                   # honest "no telemetry primitive" doc
└── scripts/
    ├── sync-local-skill-router.js
    └── dead-skills-report.sh
```

Re-running is idempotent: a second emit into the same dir prints
`"files_changed": 0` and leaves `git status --porcelain` empty inside a git-repo
target. If the target dir is a git repo with pending changes, the emitter creates
an `agentforge: pre-emit checkpoint (aider adapter)` commit first. It never
`git init`s a target that is not already a git repo.

## How Aider consumes the output

- **Config file: `.aider.conf.yml`.** Aider requires the `.yml` extension (not
  `.yaml`) and searches your home dir, the git-repo root, and the cwd. The file
  emitted here lives at the project root.
- **Posture via `read: CONVENTIONS.md`.** This key loads `CONVENTIONS.md` as
  read-only context on every run — equivalent to `aider --read CONVENTIONS.md`.
  The conventions carry the identity block, execution rules, skill-router table,
  memory protocol, context discipline, and the local-skills table.
- **MCP via `mcp-server:` (recent builds).** When `spec/mcp.yaml` declares
  servers, the emitter appends an additive `mcp-server:` list — one entry per
  server as `{ name, command: npx, args: ["-y", <pkg>], env? }`. Unlike the
  Claude Code plugin, Aider does not manage `context-mode` as a plugin, so
  `context-mode` is registered here exactly like the codex/cursor adapters do
  (not skipped). Older Aider builds ignore the `mcp-server:` key harmlessly.

## Merge-safety

`.aider.conf.yml` is **merge-safe**. AgentForge owns only the block delimited by
`# AGENTFORGE:BEGIN` / `# AGENTFORGE:END` marker comments (the same marker
approach the cursor/codex adapters use):

- **No file** → the managed block is written as the whole file.
- **File with markers** → only the block is replaced; everything outside the
  markers (your own keys) is preserved. A re-emit never duplicates or grows the
  block.
- **File without markers (adoption)** → your config is preserved verbatim and the
  managed block is appended after it.

So you can hand-author `.aider.conf.yml` keys (model, weak-model, dark-mode,
etc.) and they survive every re-emit.

## Usage

```sh
# Emit into a target dir (project-scoped — pass --dir at the CLI layer)
node adapters/aider/emit.js /path/to/project

# After dropping a new skill at /path/to/project/skills/my-skill/SKILL.md
node /path/to/project/scripts/sync-local-skill-router.js

# Run the dead-skills report (after you wire up telemetry)
bash /path/to/project/scripts/dead-skills-report.sh
```

The emit script prints a JSON receipt: `{ target, files_written, files_changed,
details }` plus the git checkpoint SHA (if any).

## Platform gaps (honest coverage)

| Capability | Aider adapter |
|---|---|
| Posture loading | ✅ `read: CONVENTIONS.md` |
| MCP servers | ✅ `mcp-server:` list (recent builds; older ignore it) |
| Skill loader | ❌ none — router table reasoned over inline |
| Lifecycle hooks | ❌ none — memory writes are a manual ritual |
| Native memory store | ❌ none — `MEMORY.md` + `memory/` are plain files |
| Telemetry primitive | ❌ none — needs an external watcher to populate jsonl |
| Scheduler | ❌ none — schedule `dead-skills-report.sh` via cron / Task Scheduler |
| Idempotent | ✅ second emit = `files_changed: 0` |
| Merge-safe config | ✅ `# AGENTFORGE:BEGIN/END` managed block |

If you want Claude-Code-grade automation, use the `claude-code` adapter. The
aider adapter trades automation for a clean, portable on-ramp into Aider.
