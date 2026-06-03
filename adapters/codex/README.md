# AgentForge — Codex CLI adapter

Emits a Codex CLI-native posture from the universal AgentForge spec.

## What it emits

Running `node adapters/codex/emit.js <target-dir>` writes the following into `<target-dir>` (intended to be `~/.codex/`):

| File | Source | Purpose |
|---|---|---|
| `AGENTS.md` | `spec/identity.yaml` + `spec/router.yaml` | Identity, stack, execution rules, skill router, memory protocol. Codex auto-loads this as system context. |
| `config.toml` | `spec/telemetry.yaml` | Single `notify` hook that dispatches to per-event log scripts. |
| `MEMORY.md` | `spec/memory.yaml` | Memory index (always-loaded). |
| `memory/{user,feedback,project,reference}/` | `spec/memory.yaml` | Bucket directories; `memory/feedback/session-log.md` seeded. |
| `telemetry/*.jsonl` + `telemetry/auto-prune.log` | `spec/telemetry.yaml` | Append-only sinks. Created empty if missing; existing data preserved. |
| `scripts/codex-notify-dispatch.sh` | (adapter) | Dispatches the single `notify` event to per-event log scripts. |
| `scripts/log-skill-invocation.sh` | `spec/telemetry.yaml` event `skill_invocation` | jsonl writer. |
| `scripts/log-user-prompt.sh` | `spec/telemetry.yaml` event `user_prompt` | jsonl writer. |
| `scripts/log-session-end.sh` | `spec/telemetry.yaml` event `session_end` | Markdown appender. |
| `scripts/dead-skills-report.sh` | (adapter) | Generates the dead-skills report consumed by the weekly prune. |
| `scripts/auto-prune-weekly.sh` | `spec/automation.yaml` | Wrapper that spawns Codex non-interactively with the bounded prune prompt. |
| `scripts/install-cron.sh` | `spec/automation.yaml` | Installs the Fridays 3pm schedule (Unix crontab or Windows Scheduled Task). |
| `scripts/install-shell-trap.sh` | `spec/telemetry.yaml` event `session_end` | Wraps `codex` in a shell function so exit triggers session-end logging. |
| `crontab.entry` | `spec/automation.yaml` | Standalone copy of the cron line for manual install. |

Re-running the emitter is **idempotent**: identical inputs produce zero file diff (excluding the "Last updated" comment in `AGENTS.md` only when the spec changes). A git checkpoint is created on first emit; subsequent emits commit only real diffs.

## How to install

```bash
# 1. Generate the posture into ~/.codex/ (or any dir).
node adapters/codex/emit.js ~/.codex

# 2. Wire the weekly auto-prune schedule.
bash ~/.codex/scripts/install-cron.sh

# 3. Wire the session-end trap (appends to ~/.bashrc or ~/.zshrc).
bash ~/.codex/scripts/install-shell-trap.sh
# Open a new shell so the wrapper function takes effect.
```

That's the whole install. From there, Codex auto-loads `AGENTS.md` on every session, the `notify` hook routes events to the log scripts, and crontab triggers the auto-prune every Friday at 3pm.

## Known gaps (verify on a real Codex install)

The adapter is honest about where Codex differs from Claude Code. Document the actual behavior of your installed Codex build against these items, then file an upstream fix or amend `spec/telemetry.yaml`.

1. **`notify` granularity.** Claude Code's `PreToolUse` hook with matcher `"Skill"` fires precisely when the agent invokes a Skill tool. Codex's `notify` is a single hook fired for several event kinds; we extract the kind from the payload in `codex-notify-dispatch.sh` (best-effort: scans for `"type":"…"`). If your Codex build does not pass the event kind via stdin/env, the dispatch falls through to `telemetry/notify-generic.log` and the skill-invocation count will under-report. **Verify on first install** by reviewing `telemetry/notify-generic.log` after a representative session.

2. **Skill-tool isolation.** Even when the event kind is `tool-call`, the payload may not include a `"skill"` field — Codex has no native YAML-frontmatter skill system, so "Skill" is not a first-class tool category. The router table in `AGENTS.md` is the activation mechanism. When the user types an explicit `/slash` skill name, the dispatch heuristic picks up the name from the call payload; for keyword-routed skills, the log row will read `"skill":"unknown"`. This is a Codex platform limitation, not a spec gap.

3. **Session-end coverage.** Codex itself does not emit a lifecycle session-end event. The shell-rc trap installed by `install-shell-trap.sh` wraps the `codex` function in your shell, so exit triggers logging — but **only** when you invoke `codex` via the wrapped function. If you alias around it or call the bare binary from a script, the log won't fire.

4. **Auto-approve flags.** `spec/automation.yaml` specifies `--non-interactive --auto-approve` for the prune. `auto-prune-weekly.sh` now runs a pre-flight `codex --help | grep -E -- '--non-interactive|--auto-approve'` and aborts with an actionable error if either flag is missing, so a Codex CLI upgrade that drops or renames a flag fails loudly into `telemetry/auto-prune.log` instead of silently producing no prune work. If the pre-flight aborts, run `codex --help` yourself, find the new equivalents, then update `spec/automation.yaml` and re-emit. Verified against Codex CLI builds that expose both flags as of v0.2 ship; older builds may not.

5. **Local skill auto-discovery.** Claude Code's `sync-local-skill-router.js` rewrites the router table on `PostToolUse` and `SessionStart`. Codex has no analog for `SessionStart`. **v0.2 mitigation:** the shell wrapper installed by `install-shell-trap.sh` now invokes `node $AGENT_HOME/scripts/sync-local-skill-router.js` before exec'ing Codex on every wrapped call, so the AUTO-LOCAL-SKILLS block stays current per session. Bypasses (bare binary, IDE extensions) still skip the sync — same surface as gap #3. The sync script is byte-identical to the generic adapter's copy and is safe to invoke on every call (best-effort, errors swallowed).

6. **Windows scheduling.** `install-cron.sh` prints a `Register-ScheduledTask` snippet rather than executing it directly, since registering a scheduled task may require elevation. Run the snippet manually in an elevated PowerShell.

## Verification

After install, confirm:

1. `node adapters/codex/emit.js /tmp/agentforge-test-codex` runs to completion and prints a JSON summary.
2. Re-running the same command prints `files_changed: 0`.
3. `AGENTS.md` is under 400 lines and renders cleanly in any markdown viewer.
4. `config.toml` parses with a TOML linter (`python -c "import tomllib; tomllib.loads(open('config.toml','rb').read().decode())"`).
5. After a Codex session, `telemetry/prompts.jsonl` has at least one row.
6. `bash scripts/dead-skills-report.sh` writes a report under `memory/feedback/`.

### First-install verification — notify-event coverage

Run one full Codex session of any length, then check whether every event
classified into a named bucket:

```bash
# Should be empty after a representative session if your build passes event
# kinds via the notify payload. Non-empty rows are unclassified events.
tail -n 50 ~/.codex/telemetry/notify-generic.log
```

If `notify-generic.log` is **empty**, your `notify` dispatch is fully covered
and skill-invocation counts are reliable. If it has rows, your installed
Codex build is passing event payloads in a shape our dispatcher doesn't
recognize — capture a sample row and file it upstream (see gap #1 below).
The same check verifies session-end coverage (gap #3): the `session-end`
event should never appear in `notify-generic.log` if the shell trap from
`install-shell-trap.sh` is wired correctly.

### Session-end coverage check

After `bash scripts/install-shell-trap.sh` and opening a new shell,
confirm the wrapper is live:

```bash
type codex
# Expected output begins with: "codex is a function"
# If it says "codex is /usr/local/bin/codex" or similar, the trap is NOT
# active in this shell — re-source ~/.bashrc / ~/.zshrc or open a new shell.
```

Sanity-check that the trap fires by running `codex --version && ls -lt ~/.codex/telemetry/session-log.md | head -1` — the session-log mtime should
be within the last few seconds. If it isn't, the trap installed but the
session-end script isn't being invoked; verify `$AGENT_HOME` resolves
correctly in `install-shell-trap.sh`.

**Known bypasses** (no fix available, these are platform limitations):

- VS Code's and JetBrains' bundled Codex extensions invoke the bare binary,
  not the shell function, so they bypass the trap.
- Scripts that call `command codex` or use `\codex` to escape aliases also
  bypass it.
- Aliases like `alias codex='codex --some-flag'` chain to the function, so
  they preserve coverage — but only if the alias is defined *after* the
  shell trap block in your rc file.

## Rollback

Every emit writes into a target dir that is git-tracked. To undo the most recent emit:

```bash
cd ~/.codex
git reset --hard HEAD~1
```

To uninstall the cron entry:

```bash
crontab -l | grep -v 'AgentForge-AutoPruneWeekly' | crontab -
```

To uninstall the shell trap, open `~/.bashrc` or `~/.zshrc` and delete the block bounded by the `# >>> AgentForge-codex session-end trap >>>` markers.

## Boundaries

This adapter:

- Reads only `spec/*.yaml` and its own `templates/` + `scripts/`.
- Writes only inside the target dir passed on the CLI.
- Does not cross-reference any other adapter.
- Refuses to emit if any spec file's `schema_version` does not match `1`.
