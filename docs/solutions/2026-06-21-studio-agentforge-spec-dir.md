# AGENTFORGE_SPEC_DIR for Studio compile

**Date:** 2026-06-21  
**Area:** adapters (MVP), studio/lib/compile.ts

## Problem

Studio must compile user-edited YAML without writing to `~/.claude` or mutating canonical `spec/`. Emitters hardcoded `REPO_ROOT/spec`.

## Fix

Add env override (mirrors existing `AGENTFORGE_MCP_SPEC`):

```javascript
const SPEC_DIR = process.env.AGENTFORGE_SPEC_DIR || path.join(REPO_ROOT, "spec");
```

Patched in `claude-code`, `codex`, `cursor`, `generic`. Studio `compileAdapter()` sets `AGENTFORGE_SPEC_DIR` on a temp `scratch/spec/` before spawning `emit.js`.

## Proof

```powershell
cd studio
npm run test
npm run test:e2e
```

Parent:

```powershell
npm run verify
```

## Files

- `adapters/{claude-code,codex,cursor,generic}/emit.js`
- `studio/lib/compile.ts`
