# bootstrap/

Entry points for installing AgentForge on a fresh machine.

## Files

| File | Purpose |
|---|---|
| `bootstrap.sh` | Main installer. Detects platform (or takes explicit arg), dispatches to the right adapter. Unix + Git Bash. |
| `bootstrap.ps1` | PowerShell equivalent for Windows users without Git Bash. |
| `init.sh` | Thin wrapper around `bootstrap.sh` for explicit platform selection. |

## Usage

### Auto-detect platform

```bash
./bootstrap/bootstrap.sh --auto
# or on Windows:
.\bootstrap\bootstrap.ps1 -Auto
```

Detection order: `claude` CLI → `codex` CLI → fall back to `generic`.

### Explicit platform

```bash
./bootstrap/bootstrap.sh claude-code
./bootstrap/bootstrap.sh codex
./bootstrap/bootstrap.sh generic /path/to/project/agentforge/
```

### Targeting a sandbox (recommended first run)

```bash
./bootstrap/bootstrap.sh claude-code ~/.claude.test/
./bootstrap/bootstrap.sh codex ~/.codex.test/
./bootstrap/bootstrap.sh generic /tmp/agentforge-test/
```

After verifying the sandbox install looks right, re-run against the real target dir.

## What the bootstrap does

1. **Preflight** — verifies Node 18+ is available, verifies the 5 spec files exist.
2. **Platform resolution** — explicit arg wins, then `--auto` detection, then bail.
3. **Target dir** — defaults per-platform (`~/.claude/`, `~/.codex/`, `./agentforge/`) unless overridden.
4. **Confirmation** — if target is non-empty, prompts before proceeding. Adapters are idempotent and preserve user content, but defense in depth.
5. **Dispatch** — runs `node adapters/<platform>/emit.js <target>`.
6. **Post-install summary** — points to the adapter's README for platform-specific next steps.

## Idempotency

Re-running the bootstrap on an existing install reconciles target with spec. Files that exist in both spec and target are overwritten with the spec rendering. Files in the target that are not spec-managed (user-authored skills, memory entries, telemetry logs) are preserved.

Every adapter creates a git checkpoint before writing, so any install is one `git reset --hard HEAD~1` away from rollback.

## Future: `npx agentforge`

Once AgentForge is published to npm, the canonical entry point becomes:

```bash
npx agentforge init [platform]
```

The `npx` wrapper will clone the repo to a temp dir, run `bootstrap.sh` from there, then clean up. The `bootstrap.sh` here is the underlying mechanism.

## Troubleshooting

- **`ERROR: node is required`** — install Node.js 18+ from https://nodejs.org/
- **`ERROR: required spec file missing`** — your AgentForge checkout is incomplete; re-clone.
- **`ERROR: unknown platform 'X'`** — only `claude-code`, `codex`, `generic` are supported in v1.
- **Emit fails partway through** — the adapter's git checkpoint protects you. Inspect the target dir, optionally `git reset --hard` to the pre-emit state.
