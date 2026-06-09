# AgentForge Readiness Runbook

This is the current local proof set for AgentForge as a four-adapter CLI package. Run it from the repository root before a demo, release candidate, or handoff.

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
- `adapters/`
- `bootstrap/`
- `docs/*.md`
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

- npm publish workflow and tag automation, which need owner decisions for release policy and token handling.
- Future Gemini CLI and Aider adapters.
