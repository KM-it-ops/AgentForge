# universal/

Cross-platform content that every adapter copies verbatim. The substance of AgentForge.

## Layout

```
universal/
├── skills/              ← reference skills any agent can load
│   ├── agentic-prompt-architect/   96/100 master-dev baseline + meta-prompt generator
│   ├── rules/                       on-demand engineering rules dispatcher
│   ├── diagnose/                    disciplined diagnosis loop
│   ├── handoff/                     compact session handoff
│   └── write-a-skill/               skill scaffolding helper
├── memory/             ← memory protocol templates
├── docs/lessons/       ← HTML course lessons (spec-kit + TDD, overhaul recap)
└── lib/                ← portable Node scripts (sync-local-skill-router.js)
```

## Adding a skill

1. Drop a new directory under `universal/skills/<name>/` with at minimum `SKILL.md` (YAML frontmatter required).
2. Adapters automatically pick it up at next install.
3. The Claude Code adapter's `sync-local-skill-router.js` will auto-register it in the router table on install.

## Why these specific skills

The 5 included are universally useful across any agentic AI:

- **agentic-prompt-architect** — generates governing prompts for any AI coding agent; cross-platform by design
- **rules** — code-convention dispatcher; loads only the relevant rule file
- **diagnose** — bug diagnosis discipline (reproduce → minimise → hypothesise → fix)
- **handoff** — compact session-to-session baton-pass
- **write-a-skill** — meta-skill for creating new skills

Skills more specific to one user's workflow (e.g. goalbuddy, graphify) live in the user's per-platform skills/ dir, not in universal/.

## Portability promise

Everything in `universal/` is plain markdown, plain HTML, or vanilla Node. No platform-specific dependencies. Adapters consume these as-is.
