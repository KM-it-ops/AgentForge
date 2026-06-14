# AgentForge Readiness Runbook

This is the current local proof set for AgentForge as a four-adapter CLI package. Run it from the repository root before a demo, release candidate, or handoff.

For the v0.2 public/npm release decision, use
`docs/releases/v0.2-readiness.md` as the release packet. It records the
versioning decision, package metadata audit, release checklist, blockers, and
approval gates. This runbook remains the command-level proof surface.

## What This Proves

- The local checkout has the tools AgentForge needs.
- The source-tree adapter round-trip test is green for Claude Code, Codex, Generic, and Cursor.
- The npm tarball installs cleanly and the installed binstub can run `doctor --json`.
- The installed binstub can emit all four adapters with the expected file counts.
- A first-run Generic install works from the CLI.
- Cursor local skill discovery can be refreshed with `scripts/watch-skills.js --once`.
- Top-level docs and root verification scripts are included in the package dry run.

## Commands

```bash
node bin/agentforge.js doctor
node bin/agentforge.js doctor --json
npm run verify
node bin/agentforge.js init generic --dir C:\tmp\agentforge-readiness-generic
node adapters/cursor/emit.js C:\tmp\agentforge-cursor-watch
node C:\tmp\agentforge-cursor-watch\scripts\watch-skills.js --once C:\tmp\agentforge-cursor-watch
npm pack --dry-run --json
git diff --check
```

To produce one JSON evidence packet for a release handoff, run:

```powershell
.\scripts\release-evidence.ps1
```

It writes `.test-output/release-evidence-v0.2.json` and uses no credentials.

On this Windows workstation, if `npm` resolves through Volta and fails with
`EPERM: operation not permitted, lstat 'C:\Users\<you>'`, use the real Node.js
npm path and a workspace-local cache:

```powershell
$env:PATH='C:\Program Files\nodejs;' + $env:PATH
$env:npm_config_cache=(Resolve-Path .\.test-output\npm-cache).Path
& 'C:\Program Files\nodejs\npm.cmd' run verify
& 'C:\Program Files\nodejs\npm.cmd' pack --dry-run --json
```

## Expected Results

### `node bin/agentforge.js doctor`

Expected: exits `0` and reports `Result: ok`.

Current local proof includes Node `>=18`, npm, git, a usable Bash for verification scripts, all five required `spec/*.yaml` files, and all four adapter emitters.

### `node bin/agentforge.js doctor --json`

Expected: exits `0` and returns JSON with `"ok": true`.

Use this for automation, CI parsing, or quick machine-readable readiness checks.

### `npm run verify`

Expected: exits `0`.

This runs:

- `npm test`: source-tree round-trip verification for `claude-code`, `codex`, `generic`, and `cursor`.
- `npm run test:pack`: `npm pack`, throwaway package install, installed-binstub `doctor --json`, and adapter emits through the installed CLI.

### `node bin/agentforge.js init generic --dir C:\tmp\agentforge-readiness-generic`

Expected: exits `0` and emits the Generic adapter into the target directory.

Expected file count for the Generic adapter is `7`.

### `node adapters/cursor/emit.js C:\tmp\agentforge-cursor-watch`

Expected: exits `0` and emits the Cursor adapter, including `.cursor/rules/local-skills.mdc` and `scripts/watch-skills.js`.

### `node C:\tmp\agentforge-cursor-watch\scripts\watch-skills.js --once C:\tmp\agentforge-cursor-watch`

Expected: exits `0` and refreshes `.cursor/rules/local-skills.mdc` from `skills/*/SKILL.md`.

### `npm pack --dry-run --json`

Expected: exits `0` and includes the package payload needed for real installs:

- `bin/`
- `CHANGELOG.md`
- `adapters/`
- `bootstrap/`
- `docs/*.md`
- `docs/releases/`
- `scripts/`
- `spec/`
- `universal/`
- `README.md`

### `git diff --check`

Expected: exits `0` with no whitespace errors.

## CI Coverage

`.github/workflows/round-trip.yml` runs the round-trip and pack/install tests on:

- `ubuntu-latest`
- `windows-latest`
- `macos-latest`

for Node `20` and `22`.

## Still Deferred

These are not required for the current readiness proof, but remain useful future work:

- npm publish workflow and tag automation, which need owner decisions for release policy and access scope.
- Future Gemini CLI and Aider adapters.

## Release Boundary

Do not publish to npm, create a GitHub release, create a tag, push release
commits, or use credentials from this runbook. Those actions require explicit
owner approval and a completed release packet.
