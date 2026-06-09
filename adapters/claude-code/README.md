# AgentForge — Claude Code adapter

Emits a complete Claude Code config tree (`CLAUDE.md`, `settings.json`, hooks, memory, telemetry sinks) from the universal spec in `spec/*.yaml`.

This is the **reference adapter**: it round-trips against the original `~/.claude/` posture the spec was lifted from.

## What it emits

Into `<target>/`:

| Path | Source | Notes |
|---|---|---|
| `CLAUDE.md` | `templates/CLAUDE.md.tmpl` + `spec/identity.yaml` + `spec/router.yaml` | Slim hub; `<AUTO-LOCAL-SKILLS>` block managed by sync hook |
| `settings.json` | `templates/settings.json.tmpl` | Hooks block wired to all five telemetry events |
| `MEMORY.md` | `spec/memory.yaml` index template | Always-loaded memory index |
| `memory/{user,feedback,project,reference}/` | `spec/memory.yaml` buckets | Plus seeded `feedback/session-log.md` |
| `hooks/scripts/log-skill-invocation.sh` | `scripts/log-skill-invocation.sh` | `PreToolUse` matcher=`Skill` |
| `hooks/scripts/log-prompt.sh` | `scripts/log-prompt.sh` | `UserPromptSubmit` |
| `hooks/scripts/log-session-end.sh` | `scripts/log-session-end.sh` | `SessionEnd` |
| `hooks/scripts/dead-skills-report.sh` | `scripts/dead-skills-report.sh` | Weekly report generator |
| `hooks/scripts/auto-prune-weekly.sh` | `scripts/auto-prune-weekly.sh` | Weekly self-improvement loop |
| `hooks/scripts/sync-local-skill-router.js` | `universal/lib/` (fallback inline) | Regenerates the auto-skills block |
| `hooks/scripts/install-task.ps1` | `scripts/install-task.ps1` | Windows Task Scheduler installer |
| `skills/` | empty stub | Local skills drop here |
| `telemetry/` | empty stub | jsonl sinks land here at runtime |

## Install

```bash
# Sandbox test
node adapters/claude-code/emit.js C:/tmp/agentforge-test-claude

# Real install
node adapters/claude-code/emit.js ~/.claude

# Then register the weekly task (Windows)
powershell -ExecutionPolicy Bypass -File ~/.claude/hooks/scripts/install-task.ps1 -AgentHome "$env:USERPROFILE\.claude"
```

The emitter creates a git checkpoint commit in `<target>` before each run (initializing the repo if needed). Re-running produces zero diff. The emit script prints a JSON receipt with `target`, `checkpoint_sha`, `files_written`, `files_changed`, and per-file `details`.

## Verifying the round-trip

```bash
# 1. Sandbox emit
node adapters/claude-code/emit.js C:/tmp/agentforge-test-claude

# 2. Diff against your live ~/.claude (modulo the AUTO-LOCAL-SKILLS block, which is runtime-populated)
diff -r ~/.claude/CLAUDE.md C:/tmp/agentforge-test-claude/CLAUDE.md
diff ~/.claude/settings.json C:/tmp/agentforge-test-claude/settings.json
diff ~/.claude/hooks/scripts/log-skill-invocation.sh C:/tmp/agentforge-test-claude/hooks/scripts/log-skill-invocation.sh

# 3. Idempotency check — second run produces zero new commits
node adapters/claude-code/emit.js C:/tmp/agentforge-test-claude
git -C C:/tmp/agentforge-test-claude log --oneline
```

Expected drift (deliberate, not bugs):

1. **Auto-local-skills block** in CLAUDE.md is rendered with a placeholder comment instead of skill rows. The block is populated by `sync-local-skill-router.js` on the first `SessionStart` or skill write.
2. **"Last updated" line** uses the emit date, not the original commit date.

Anything else is a bug. Report it.

## Known gaps

None expected for v1. Claude Code has full lifecycle hook coverage for every event in `spec/telemetry.yaml`.

## Rollback

The emitter commits a git checkpoint before each run inside `<target>`. To roll back:

```bash
git -C <target> reset --hard HEAD~1
```

Or to fully discard the AgentForge install on a sandbox:

```bash
rm -rf C:/tmp/agentforge-test-claude
```

For a real `~/.claude/` rollback, restore from your prior backup or `git reset --hard <pre-agentforge-sha>`.
