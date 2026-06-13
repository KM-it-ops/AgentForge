# AGENTS.md

AgentForge is a configuration framework for agentic AI coding assistants. The repository
contains two distinct sub-projects:

- **AgentForge core** (repo root): a zero-dependency Node.js CLI (`bin/agentforge.js`) plus a
  static visual demo. This is the published npm package and the primary product.
- **AgentForge.DevToolkit/**: a Windows-first PowerShell 7 module (see its own `AGENTS.md`).

## Cursor Cloud specific instructions

### Scope on this Linux cloud VM
- The **AgentForge core** Node CLI + demo is the in-scope product here and is fully runnable.
- **AgentForge.DevToolkit/** is a Windows-first PowerShell module whose tests use Windows-only
  backslash paths (e.g. `src\AgentForge.DevToolkit\...`) and PowerShell 7 + Pester on Windows.
  It cannot run on this Linux VM without code changes, so treat it as out of scope here.

### Dependencies
- AgentForge core has **no runtime/dev npm dependencies** — `package.json` declares none and there
  is no lockfile. Do **not** expect a `node_modules/` to be needed; `npm install` is a no-op.
- Requires Node >= 18 (Node 22 is present), plus `git` and `bash` (all preinstalled).

### npm prefix / nvm caveat (important)
- On this VM, `node` resolves to a wrapper at `/exec-daemon/node`, which makes npm compute its
  global `prefix` as `/`. When npm runs a lifecycle script (e.g. `npm run verify`), it injects
  `npm_config_prefix=/` into child processes, which makes **nvm bail out inside the `bash -lc`
  login shell** that the verification runner (`scripts/run-bash-script.js`) and `agentforge
  doctor`'s "usable bash" check use to detect `npm`. The symptom is tests failing with
  `No usable Bash found for AgentForge verification`.
- Fix (applied by the startup update script, idempotent): point npm's prefix at the real nvm node
  dir — `npm config set prefix "$(dirname "$(dirname "$(command -v npm)")")"`.
- Side effect: nvm then prints a harmless warning on shell startup
  (`...globalconfig and/or a prefix setting, which are incompatible with nvm... Run nvm use
  --delete-prefix...`). **Ignore it** — node/npm still resolve correctly and all tests pass. Do
  NOT run `nvm use --delete-prefix`, as that reverts the prefix and re-breaks `npm run verify`.

### Run / test / build commands (AgentForge core, run from repo root)
- Verify everything (round-trip + merge-safe + pack-install): `npm run verify`
  - sub-tests: `npm test`, `npm run test:merge-safe`, `npm run test:pack`
- CLI health check: `node bin/agentforge.js doctor` (add `--json` for machine output)
- Generate a config tree: `node bin/agentforge.js init <claude-code|codex|cursor|generic> [--dir <path>]`
  (`cursor` and `generic` require `--dir`)
- Visual demo web server: `npm run demo` → serves at `http://127.0.0.1:41738/` (redirects to
  `/docs/demo/`). Override the port with `PORT=...`. Run it in a long-lived session (e.g. tmux);
  it does not background itself.
- There is no lint script and no ESLint/Prettier config in this repo; "lint" is not applicable.
- `npm run test:pack` writes `agentforge-0.2.0.tgz` to the repo root (gitignored).
