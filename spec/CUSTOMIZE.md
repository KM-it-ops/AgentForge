# Customize the spec

The files in `spec/` ship as **public placeholders** — safe to browse in the demo and Studio.
They are not your personal agent posture until you edit them locally.

## Quick path

```bash
git clone https://github.com/KM-it-ops/AgentForge.git
cd AgentForge
npm install -g .

# 1. Edit the canonical source (start with identity.yaml)
#    Replace Your Name, paths, stack, and MCP entries with your own values.

# 2. Emit to a target directory (never writes to your home dir unless you choose)
agentforge init cursor --dir ./my-agent-config
agentforge init codex --dir ./my-codex-config

# 3. Prove the checkout
agentforge doctor
npm run verify   # from repo root, optional but recommended
```

## What to edit first

| File | Change |
|------|--------|
| `identity.yaml` | Name, role, stack defaults, execution rules |
| `memory.yaml` | Brain path if you use shared memory (`mcp_ritual.brain_path`) |
| `mcp.yaml` | Enable servers, set `{HOME}` paths to your local MCP installs |
| `router.yaml` | Skill routes and triggers for your workflow |
| `telemetry.yaml` | Usually fine as-is |
| `automation.yaml` | Schedule/timezone for weekly prune |

Use `{HOME}` as a readable placeholder in YAML — replace with your actual home directory
or platform paths before running `agentforge init`.

## Public demo vs Studio

- **Visual demo** (recommended for visitors): [Open demo](../docs/demo/index.html) or `npm run demo`
- **Studio** (optional): local `cd studio && npm run dev` — compile preview with the same placeholder spec

Deploy Studio yourself only if you want a private or team playground; the static demo plus
clone-and-edit is the intended public funnel.

## Maintainers: keep spec public-safe

**Do not commit** real names, cities, Windows profile paths (`C:\Users\...`), or private
brain/MCP paths into `spec/*.yaml`. Use `{HOME}` and generic placeholders; keep your real
posture in a local fork or uncommitted edits only.

`npm run test:spec-public` (also run as part of `npm run verify`) fails if forbidden
patterns reappear under `spec/`.
