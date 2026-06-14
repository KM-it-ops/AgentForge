# Contributing to AgentForge

Thanks for your interest in improving AgentForge! This project turns one canonical
agent posture (`spec/`) into platform-native config for Claude Code, Codex, Cursor, and
generic agent workspaces. Contributions of all sizes are welcome.

## Getting set up

See the **Prerequisites** and **Quick Start** in the [README](README.md). In short:

```bash
git clone https://github.com/KM-it-ops/AgentForge.git
cd AgentForge
npm install
npm test        # requires bash (Git Bash on Windows)
```

## The one invariant you must not break: round-trip idempotency

Every adapter's `emit.js` must be **idempotent** — emitting twice into a fresh sandbox must
leave `git status --porcelain` empty (Codex + generic also assert `files_changed: 0`). This is
enforced by `scripts/round-trip-test.sh` and by CI on every push/PR.

**Before** you change an emitter or template, establish a green baseline:

```bash
bash scripts/round-trip-test.sh
```

**After** your change, run it again. If it's no longer green, your change added a
non-idempotent write — fix that before opening a PR.

## Adding a new adapter

1. Add `adapters/<name>/` with `emit.js` + `templates/` (+ `scripts/` if needed).
2. Append `<name>` to the `ADAPTERS=(…)` list in `scripts/round-trip-test.sh`.
3. Add a CI matrix entry **only** if the platform needs runtime install beyond node + git.
4. Emitters must not depend on `js-yaml` — fall through to the bundled `miniYaml` parser so CI
   runs with zero install.

## Commit & PR conventions

- **Conventional commits**, phase-prefixed where it helps: `feat(adapters/codex): …`,
  `fix(emit): …`, `docs(readme): …`, `chore: …`.
- Keep PRs focused; one logical change per PR.
- Make sure `npm test` and the round-trip script pass locally before requesting review.
- Describe **what** changed and **why**, and call out any deviation from the spec contract
  in `spec/SPEC.md`.

## Reporting bugs / requesting features

Open an issue using the templates under `.github/ISSUE_TEMPLATE/`. For security issues, do **not**
open a public issue — see [SECURITY.md](SECURITY.md).

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE) and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
