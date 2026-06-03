# universal/memory/

Templates and seed files for the memory protocol. Adapters copy these into the platform's memory directory at install time.

## Files

- **MEMORY.md.tmpl** — the index file. Always loaded (loaded into the agent's context every session). Lists each memory bucket and points to subdirectory files.
- **buckets/** — one .md.tmpl per bucket with header + purpose hint.

## How adapters use this

Each adapter at install:

1. Creates the 4 bucket directories under `{agent_home}/memory/{user,feedback,project,reference}/`.
2. Copies MEMORY.md.tmpl to `{agent_home}/MEMORY.md` (substituting any placeholders).
3. Seeds `memory/feedback/session-log.md` from the template in `automation.yaml` if the platform supports SessionEnd hooks.

## Adding new buckets

Add a new bucket in `spec/memory.yaml` `buckets:` array. Every adapter will regenerate accordingly on next install.
