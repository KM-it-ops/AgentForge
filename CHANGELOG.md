# Changelog

All notable changes to AgentForge are tracked here. This project uses semantic
versioning for public npm releases.

## 0.3.1

Status: published to npm as `@kmitops/agentforge@0.3.1`.

### Added

- **Gemini CLI live skill-watcher** (`adapters/gemini-cli/scripts/watch-skills.js`),
  parity with the cursor adapter. Watches `skills/` and re-runs
  `sync-local-skill-router.js` to keep the `GEMINI.md` AUTO-LOCAL-SKILLS block
  current; `--once` does a single sync. Emitted file count for `gemini-cli` is
  now **18** (was 17).

### Changed

- CI workflows (`publish`, `round-trip`, `gitleaks`) opt into the Node 24 action
  runtime via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, ahead of GitHub's forced
  cutover from the deprecated Node 20 runtime for bundled JS actions.

### Fixed

- Corrected a stale code comment on the `record`/`recordPath` helpers in the
  gemini-cli emitter (cosmetic; no behavior change).

## 0.3.0

Status: published to npm as `@kmitops/agentforge@0.3.0`.

### Added

- **Gemini CLI adapter** (`gemini-cli`, default dir `~/.gemini`). Emits a
  `GEMINI.md` hierarchical context file and a **merge-safe** `settings.json`
  with native `mcpServers`. `context-mode` is registered (unlike Claude Code,
  Gemini does not manage it as a plugin). 17 emitted files.
- **Aider adapter** (`aider`, project-scoped via `--dir`). Emits a
  `CONVENTIONS.md` posture file loaded via the `read:` key and a merge-safe
  `.aider.conf.yml` with a `mcp-server:` registration list (recent Aider builds;
  older builds ignore it harmlessly). 11 emitted files.
- Verify-suite coverage for both new adapters across round-trip, merge-safe,
  pack-install (file counts 17 / 11), and the MCP-emit module test.

### Changed

- `settings.json` (Gemini) is merge-safe: AgentForge-managed keys are added only
  when absent, `mcpServers` entries merge without clobbering same-named user
  servers, and an unparseable user file is preserved with the managed shape
  written to a `settings.agentforge.json` sidecar. `GEMINI.md` and
  `.aider.conf.yml` use `AGENTFORGE:BEGIN`/`AGENTFORGE:END` managed blocks.
- README, `docs/DEFERRED-MAP.md`, and `docs/PLATFORM-GAPS.md` updated for six
  adapters; the open-adapter backlog is now empty.

## 0.2.0

Status: published to npm as `@kmitops/agentforge@0.2.0`.

### Added

- Cursor adapter support, including `.cursorrules`, modular `.cursor/rules/*.mdc`
  output, local skill discovery, and Cursor-specific documentation.
- Cross-platform round-trip verification across Claude Code, Codex, Cursor, and
  Generic adapters.
- Package install smoke coverage that exercises `npm pack`, a clean install, the
  installed `agentforge` binstub, `agentforge doctor --json`, and all four
  adapter emits.
- Visual demo assets and README positioning for the four-adapter AgentForge CLI.
- Cross-adapter platform-gap audit and deferred-item map for future adapter
  work.
- Shared installer helpers under `universal/lib/installers/` for recurring
  scheduler setup patterns.
- Merge-safe adoption test (`scripts/merge-safe-test.sh`, wired into
  `npm run verify`) that emits into a target carrying pre-existing user files
  and asserts the user's content survives, including on re-emit.

### Changed

- Codex and Cursor adapters are now **merge-safe** when emitting into an
  existing install. `AGENTS.md` and `.cursorrules` wrap AgentForge output in an
  `AGENTFORGE:BEGIN`/`AGENTFORGE:END` managed block — on re-emit only that block
  is rewritten, so hand-authored content outside it is preserved (and on first
  adoption the block is mounted atop the user's existing file). An existing
  non-AgentForge `config.toml` is no longer overwritten: it is left untouched
  and the managed config is written to a `config.agentforge.toml` sidecar for
  manual merge.

- `agentforge doctor` now checks Node, npm, git, usable Bash, required spec
  files, and adapter emitters.
- Windows command-shim execution now runs through shell handling where needed.
- README and readiness docs now point maintainers at the v0.2 release readiness
  packet before any public/npm release action.

### Release Gates

- Do not publish this version to npm until the checklist in
  `docs/releases/v0.2-readiness.md` is complete.
- Do not create a GitHub release, tag, or npm publish without explicit owner
  approval.
- Fresh pushed commit and CI-green evidence must be recorded before release.

## 0.1.1 - Previous Local Package Baseline

### Added

- `npx agentforge` CLI wrapper with `init`, `doctor`, `--version`, and `--help`.
- npm package metadata, bin entrypoint, package files allowlist, and pack/install
  verification path.

## 0.1.0 - Initial Verification Baseline

### Added

- Canonical spec files under `spec/`.
- Claude Code, Codex, and Generic adapter surfaces.
- Initial readiness and verification documentation.
