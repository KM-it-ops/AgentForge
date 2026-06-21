# AgentForge Studio — API contract (G1)

Base URL: `/api` (Next.js Route Handlers under `studio/app/api/`).

## POST `/api/compile`

Runs a real adapter emitter against user-supplied YAML. Writes only to a temp output dir; returns file contents as JSON.

### Request

```json
{
  "adapter": "claude-code" | "codex" | "cursor" | "generic",
  "specFiles": {
    "identity.yaml": "<yaml string>",
    "router.yaml": "<yaml string>",
    "memory.yaml": "<yaml string>",
    "telemetry.yaml": "<yaml string>",
    "automation.yaml": "<yaml string>",
    "mcp.yaml": "<optional yaml string>"
  }
}
```

### Response `200`

```json
{
  "files": [{ "path": ".cursor/rules/identity.mdc", "content": "..." }],
  "meta": {
    "adapter": "cursor",
    "fileCount": 30,
    "durationMs": 842
  }
}
```

### Errors

| Status | When |
|--------|------|
| 400 | Zod validation failure (shape, adapter enum, missing required spec keys) |
| 413 | Total request body > 512KB |
| 422 | Emitter abort (schema_version mismatch, parse error, missing template var) |
| 500 | Unexpected server error |

### Server behavior (Phase 2)

1. Validate body with `lib/schemas.ts`.
2. `scratch = os.tmpdir()/agentforge-studio-{uuid}/`
3. Write YAML to `scratch/spec/`
4. `spawnSync(node, [repo/adapters/<adapter>/emit.js, scratch/out], { env: { AGENTFORGE_SPEC_DIR: scratch/spec } })`
5. Walk `scratch/out/`, read files → `{ path, content }[]`
6. Delete `scratch`

**Never** call `agentforge init`. **Never** use `~/.claude` or other home defaults as output.

---

## POST `/api/doctor`

Runs real AgentForge doctor checks (environment + repo integrity). MVP accepts empty body.

### Request

```json
{}
```

### Response `200`

```json
{
  "ok": true,
  "checks": [
    { "name": "node >=18", "pass": true, "message": "v24.14.0" },
    { "name": "spec files", "pass": true, "message": "5 required spec files found" }
  ]
}
```

### Implementation (Phase 3)

Subprocess: `node ../../bin/agentforge.js doctor --json` from repo root, map `checks[].detail` → `message`.

---

## Shared types

Defined in `studio/lib/schemas.ts` (Zod + inferred TypeScript types). Used by routes and Vitest.

## Rate limiting (Phase 3)

Simple in-memory token bucket per IP on both routes (Vercel: best-effort; document as DoS guard not auth).
