# Studio wireframe (G1)

Interactive placeholder at `/` — run `npm run dev` in `studio/` to view.

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ AgentForge Studio          [adapter ▼] [Compile] [Reset spec]   │
├──────────────────────┬──────────────────────┬───────────────────┤
│ Spec YAML            │ Preview              │ Doctor            │
│ [Identity|Router|…]  │ file tree │ content  │ [Run doctor]      │
│ ┌──────────────────┐ │ (empty)              │ pass/fail list    │
│ │ CodeMirror ph.2  │ │                      │                   │
│ └──────────────────┘ │                      │                   │
└──────────────────────┴──────────────────────┴───────────────────┘
        xl: 3 columns · lg: editor + preview, doctor spans full width
```

## States (Phase 2–3)

| Surface | Empty | Loading | Error | Success |
|---------|-------|---------|-------|---------|
| Preview | "Compile to see…" | spinner on Compile | toast + message | file tree + tab content |
| Doctor | static wireframe | spinner on Run | API error | real check list |
| Editor | repo spec seed | — | parse hint | unsaved client state |

## Components

| File | Role |
|------|------|
| `components/studio-wireframe.tsx` | G1 shell (replaced incrementally in Phase 2) |
| `lib/schemas.ts` | Zod contracts shared with API routes |
| `lib/paths.ts` | Repo root resolution for subprocess compile |

See `docs/API-CONTRACT.md` for endpoint shapes.
