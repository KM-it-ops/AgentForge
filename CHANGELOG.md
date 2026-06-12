# Changelog

All notable changes to AgentForge are tracked here. This project uses semantic
versioning for public npm releases.

## 0.2.0 - Release Candidate

Status: not published.

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

### Changed

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
