# AgentForge Readiness Runbook

This is the current proof set for AgentForge as the published six-adapter npm package
`@kmitops/agentforge@0.3.1`. Run it from the repository root before a demo,
release candidate, publish, or handoff.

The historical v0.2 release-candidate packet remains archived at
`docs/releases/v0.2-readiness.md`. It is not the current npm status source.
Current public package status comes from `package.json`, `CHANGELOG.md`, this
runbook, and the npm registry entry for `@kmitops/agentforge`.

## What This Proves

- The local checkout has the tools AgentForge needs.
- The source-tree adapter round-trip test is green for Claude Code, Codex, Gemini CLI, Cursor, Aider, and Generic.
- The npm tarball installs cleanly and the installed binstub can run `doctor --json`.
- The installed binstub can emit all six adapters with the expected file counts.
- The scoped public npm package exists as `@kmitops/agentforge`, with `latest` pointing at `0.3.1`.
- A first-run Generic install works from the CLI.
- Cursor and Gemini CLI local skill discovery can be refreshed with their `scripts/watch-skills.js --once` helpers.
- Top-level docs and root verification scripts are included in the package dry run.

## Commands

```bash
node bin/agentforge.js doctor
node bin/agentforge.js doctor --json
npm view @kmitops/agentforge version name dist-tags.latest --json
npm run verify
node bin/agentforge.js init generic --dir C:\tmp\agentforge-readiness-generic
node adapters/cursor/emit.js C:\tmp\agentforge-cursor-watch
node C:\tmp\agentforge-cursor-watch\scripts\watch-skills.js --once C:\tmp\agentforge-cursor-watch
node adapters/gemini-cli/emit.js C:\tmp\agentforge-gemini-watch
node C:\tmp\agentforge-gemini-watch\scripts\watch-skills.js --once C:\tmp\agentforge-gemini-watch
npm pack --dry-run --json
git diff --check
```

To produce one JSON evidence packet for a release handoff, run:

```powershell
.\scripts\release-evidence.ps1
```

It writes `.test-output/release-evidence-current.json` and uses no credentials.

On this Windows workstation, if `npm` resolves through Volta and fails with
`EPERM: operation not permitted, lstat 'C:\Users\<you>'`, use the real Node.js
npm path and a workspace-local cache:

```powershell
$env:PATH='C:\Program Files\nodejs;' + $env:PATH
$env:npm_config_cache=(Resolve-Path .\.test-output\npm-cache).Path
& 'C:\Program Files\nodejs\npm.cmd' run verify
& 'C:\Program Files\nodejs\npm.cmd' pack --dry-run --json
& 'C:\Program Files\nodejs\npm.cmd' view @kmitops/agentforge version name dist-tags.latest --json
```

## Expected Results

### `node bin/agentforge.js doctor`

Expected: exits `0` and reports `Result: ok`.

Current local proof includes Node `>=18`, npm, git, a usable Bash for verification scripts, all five required `spec/*.yaml` files, and all six adapter emitters.

### `node bin/agentforge.js doctor --json`

Expected: exits `0` and returns JSON with `"ok": true`.

Use this for automation, CI parsing, or quick machine-readable readiness checks.

### `npm run verify`

Expected: exits `0`.

This runs:

- `npm test`: source-tree round-trip verification for `claude-code`, `codex`, `gemini-cli`, `cursor`, `aider`, and `generic`.
- `npm run test:merge-safe`: merge-safe adoption checks for adapters that preserve existing user files.
- `npm run test:pack`: `npm pack`, throwaway package install, installed-binstub `doctor --json`, and adapter emits through the installed CLI.
- `npm run test:mcp`: MCP emit coverage for adapters that register MCP configuration.

### `node bin/agentforge.js init generic --dir C:\tmp\agentforge-readiness-generic`

Expected: exits `0` and emits the Generic adapter into the target directory.

Expected file count for the Generic adapter is `7`.

### `node adapters/cursor/emit.js C:\tmp\agentforge-cursor-watch`

Expected: exits `0` and emits the Cursor adapter, including `.cursor/rules/local-skills.mdc` and `scripts/watch-skills.js`.

### `node C:\tmp\agentforge-cursor-watch\scripts\watch-skills.js --once C:\tmp\agentforge-cursor-watch`

Expected: exits `0` and refreshes `.cursor/rules/local-skills.mdc` from `skills/*/SKILL.md`.

### `node C:\tmp\agentforge-gemini-watch\scripts\watch-skills.js --once C:\tmp\agentforge-gemini-watch`

Expected: exits `0` and refreshes the `AUTO-LOCAL-SKILLS` block in `GEMINI.md` from `skills/*/SKILL.md`.

### `npm view @kmitops/agentforge version name dist-tags.latest --json`

Expected: exits `0` and reports the public package name as `@kmitops/agentforge`
with `version` and `dist-tags.latest` set to `0.3.1`.

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

## Release Operations

npm publishing is no longer a deferred future capability. The package is live as
`@kmitops/agentforge`, and `.github/workflows/publish.yml` is the release path
for future versions.

Release operations still require intentional owner action:

- publishing a new version through GitHub Release or manual workflow dispatch
- creating tags or GitHub releases
- changing npm access, provenance, package ownership, or automation tokens

This runbook may verify publish readiness and registry state, but it does not
log in, publish, tag, push release commits, create GitHub releases, or use
credentials.
