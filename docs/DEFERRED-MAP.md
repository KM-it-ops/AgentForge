# AgentForge — Deferred-Items Map

> Topographic view of every open deferred item across AgentForge as of v0.2,
> with the dependency edges that determine which order they should ship in.
> Derived from `docs/VERIFICATION-v0.1.0.md` (pre-v0.2 backlog),
> `docs/PLATFORM-GAPS.md` (17-row cross-adapter audit), and the final v0.2
> reviewer's notes. Update this file at every minor-version cut.

## The list

### Open adapters

| Item | Source | Effort | Priority | Blocked by |
|---|---|---|---|---|
| Gemini CLI adapter | v0.1 backlog | L | P2 | none; Cursor watcher provides the parity pattern |
| Aider adapter | v0.1 backlog | L | P2 | none; Cursor watcher provides the parity pattern |

### codex gap items

| Gap ID | Type | Effort | Priority | Blocked by |
|---|---|---|---|---|
| ~~`codex-notify-coarse`~~ | ~~docs-only~~ | ~~S~~ | **closed** `1ae6935` | — |
| ~~`codex-session-end-shell-only`~~ | ~~docs-only + 1-line script edit~~ | ~~S~~ | **closed** `1ae6935` | — |
| ~~`codex-auto-approve-flags-unverified`~~ | ~~adapter-fix~~ | ~~M~~ | **closed** `391e070` + `fc039c1` | — |
| ~~`codex-no-sessionstart-router-refresh`~~ | ~~adapter-fix~~ | ~~M~~ | **closed** `b770a77` + `fc039c1` | — |
| `codex-skill-unknown` | upstream-only | S | P2 | upstream Codex CLI feature |
| ~~`codex-windows-cron-not-executed`~~ | ~~adapter-fix~~ | ~~M~~ | **closed (v0.3 installers)** | — |

### cursor gap items

| Gap ID | Type | Effort | Priority | Blocked by |
|---|---|---|---|---|
| `cursor-no-telemetry` | docs-only (optional MCP stub for v0.3) | S | P2 | — |
| `cursor-no-skill-loader` | docs-only | S | P2 | — |
| `cursor-no-lifecycle-hooks` | docs-only | S | P2 | — |
| ~~`cursor-no-scheduled-task`~~ | ~~adapter-fix candidate~~ | ~~S~~ | **closed (v0.3 installers)** | — |
| ~~`cursor-no-auto-router-sync`~~ | ~~adapter-fix candidate~~ | ~~M~~ | **closed** | — |
| `cursor-cursorrules-deprecated` | docs-only (re-eval v0.3) | S | P2 | upstream Cursor removing legacy support |

### generic gap items (intentional posture)

| Gap ID | Type | Effort | Priority |
|---|---|---|---|
| `generic-no-hooks-no-automation` | docs-only | S | P2 |
| `generic-no-skill-loader` | docs-only | S | P2 |
| `generic-no-telemetry-primitive` | docs-only | S | P2 |
| `generic-manual-memory-writes` | docs-only | S | P2 |

### Cross-cutting / shared-infrastructure candidates

| Item | Where it lives (proposed) | Effort | Priority | Unblocks |
|---|---|---|---|---|
| ~~`universal/lib/installers/`~~ | `universal/lib/installers/` | ~~M~~ | **shipped (v0.3)** | closed `codex-windows-cron-not-executed`, `cursor-no-scheduled-task`; claude-code refactor to use it = follow-up |
| ~~`scripts/watch-skills.js` (file-watcher fallback for sync-local-skill-router.js)~~ | `adapters/cursor/scripts/watch-skills.js` | ~~M~~ | **closed** | closed `cursor-no-auto-router-sync`; provides a parity pattern for Gemini/Aider |
| ~~Unified JSON summary shape across all 4 adapters~~ | ~~per-adapter `emit.js`~~ | ~~S~~ | **closed** | downstream tooling can parse `target`, `checkpoint_sha`, `files_written`, `files_changed`, and `details` from every adapter |
| ~~macOS CI matrix row (`macos-latest`)~~ | `.github/workflows/round-trip.yml` | ~~S~~ | **closed** | catches launchd/`/tmp` differences before users hit them |
| npm publish workflow + tag automation | new `.github/workflows/publish.yml` | S | P2 | `npx agentforge init …` against the real registry |

### Historical (closed — kept for audit trail)

| Item | Closed in | Notes |
|---|---|---|
| Cursor adapter | v0.2 (commits `fe82089` → `1dae552`) | 23 emitted files, idempotent |
| `npx agentforge` wrapper | v0.1.1 (commit `e2dbaee`) | bin/agentforge.js + pack-install CI |
| Round-trip CI | post-v0.1.0 (commit `79257f6`) + flagship-improvement tranche | matrix ubuntu+windows+macOS x node 20+22 |
| `cli-init-cwd-footgun` | v0.2 (commit `a80964d`) | found during Task 2, fixed in-scope |
| P1 codex cleanup batch (4 items) | v0.2.1 (`1ae6935` → `fc039c1`) | codex coverage ~85% → ~95%; backstop review applied 2 Important fixes (`set -e` defense + word-bounded flag regex) |
| `universal/lib/installers/` shared module | v0.3 (this batch) | closed `codex-windows-cron-not-executed` + `cursor-no-scheduled-task` simultaneously; thin-wrapper pattern documented in `universal/lib/installers/README.md` |
| Unified JSON receipt shape | flagship-improvement tranche | all four adapters emit `target`, `checkpoint_sha`, `files_written`, `files_changed`, and `details`; round-trip test asserts `files_changed: 0` for every adapter |
| Installed-binstub doctor verification | flagship-improvement tranche | `scripts/pack-install-test.sh` now runs `agentforge doctor --json` from the installed package before adapter emits |
| Cursor local skill watcher | flagship-improvement tranche | cursor adapter emits `.cursor/rules/local-skills.mdc` and ships `scripts/watch-skills.js --once` / watch mode |

## Topographic map

```mermaid
flowchart LR
  classDef shipped fill:#1f6f3f,color:#fff,stroke:#0d3f24,stroke-width:1px
  classDef p1 fill:#cf6f1c,color:#fff,stroke:#7a3f0e,stroke-width:1px
  classDef p2 fill:#5b6f7e,color:#fff,stroke:#2f3d47,stroke-width:1px
  classDef shared fill:#7a3b8f,color:#fff,stroke:#3f1d4a,stroke-width:1px
  classDef upstream fill:#8f3b3b,color:#fff,stroke:#4a1d1d,stroke-width:1px

  subgraph Core["Core (shipped through v0.2)"]
    SPEC["spec/*.yaml<br/>(5 files)"]:::shipped
    CLI["bin/agentforge.js<br/>npx agentforge init"]:::shipped
    ROUND["scripts/round-trip-test.sh"]:::shipped
    PACK["scripts/pack-install-test.sh"]:::shipped
    CI[".github/workflows/round-trip.yml<br/>matrix: ubuntu+windows+macOS × node 20+22"]:::shipped
  end

  subgraph Adapters["Shipping adapters"]
    CC["claude-code<br/>100%"]:::shipped
    CX["codex<br/>~85%"]:::shipped
    CU["cursor<br/>~55% (new in v0.2)"]:::shipped
    GE["generic<br/>~40%"]:::shipped
  end

  subgraph Codex["codex gap items"]
    C1["codex-notify-coarse<br/>(closed 1ae6935)"]:::shipped
    C3["codex-session-end-shell-only<br/>(closed 1ae6935)"]:::shipped
    C4["codex-auto-approve-flags-unverified<br/>(closed 391e070+fc039c1)"]:::shipped
    C5["codex-no-sessionstart-router-refresh<br/>(closed b770a77+fc039c1)"]:::shipped
    C2["codex-skill-unknown"]:::upstream
    C6["codex-windows-cron-not-executed<br/>(closed v0.3 installers)"]:::shipped
  end

  subgraph Cursor["cursor gap items"]
    U1["cursor-no-telemetry"]:::p2
    U2["cursor-no-skill-loader"]:::p2
    U3["cursor-no-lifecycle-hooks"]:::p2
    U4["cursor-no-scheduled-task<br/>(closed v0.3 installers)"]:::shipped
    U5["cursor-no-auto-router-sync<br/>(closed watcher)"]:::shipped
    U6["cursor-cursorrules-deprecated"]:::upstream
  end

  subgraph Generic["generic gap items<br/>(intentional posture — docs-only)"]
    G1["generic-no-hooks"]:::p2
    G2["generic-no-skill-loader"]:::p2
    G3["generic-no-telemetry"]:::p2
    G4["generic-manual-memory-writes"]:::p2
  end

  subgraph NewAdapters["New adapter backlog"]
    GEM["Gemini CLI adapter"]:::p2
    AID["Aider adapter"]:::p2
  end

  subgraph Shared["Shared infrastructure candidates (v0.3)"]
    INST["universal/lib/installers/<br/>cron + Task Scheduler<br/>(shipped — closed C6 & U4)"]:::shipped
    WATCH["scripts/watch-skills.js<br/>(closed cursor watcher)"]:::shipped
    JSON["unified JSON receipt shape<br/>(closed)"]:::shipped
    MAC["macOS CI matrix row<br/>(closed)"]:::shipped
    PUB["npm publish workflow"]:::shared
  end

  %% Spec feeds every adapter
  SPEC --> CC & CX & CU & GE
  SPEC -.->|future| GEM & AID

  %% Adapters consumed by CI
  CC & CX & CU & GE --> ROUND
  CC & CX & CU & GE --> PACK
  ROUND & PACK --> CI

  %% CLI dispatches to every adapter
  CLI --> CC & CX & CU & GE

  %% Codex gap → codex
  C1 & C3 & C4 & C5 & C2 & C6 -.->|fixes| CX

  %% Cursor gap → cursor
  U1 & U2 & U3 & U4 & U5 & U6 -.->|fixes| CU

  %% Generic gap → generic
  G1 & G2 & G3 & G4 -.->|docs| GE

  %% Shared-library dependency edges (the load-bearing topology)
  INST -.->|unblocks| C6
  INST -.->|unblocks| U4
  WATCH -.->|closed| U5
  WATCH -.->|pattern for| GEM
  WATCH -.->|pattern for| AID
  JSON -.->|consistency for| CC & CX & CU & GE
  MAC -.->|extends| CI
  PUB -.->|publishes| CLI
```

## How to read the map

- **Green nodes** are shipped through v0.2 — the existing surface.
- **Orange nodes** are the v0.2 P1 cleanup batch (4 codex items, ~5 hours total). These have zero blockers and clear the codex coverage from ~85% toward parity with claude-code.
- **Grey nodes** are P2 items deferred to v0.3+.
- **Purple nodes** are shared-infrastructure candidates. The dotted "unblocks" edges from purple back into the gap clusters are the load-bearing reason to land shared infra *before* the individual gap fixes — otherwise we duplicate code across adapters and pay the refactor cost later.
- **Red nodes** are upstream-only (`codex-skill-unknown`, `cursor-cursorrules-deprecated`) — AgentForge can't fix them without the platform vendor moving first.

## Suggested order of operations

1. ~~**P1 codex cleanup batch**~~ — **done** (v0.2.1, commits `1ae6935` → `fc039c1`). Codex coverage ~85% → ~95%.
2. ~~**Build `universal/lib/installers/`**~~ — **done** (v0.3). Both dependent gaps (`codex-windows-cron-not-executed`, `cursor-no-scheduled-task`) closed in the same commit batch.
3. ~~**Build `scripts/watch-skills.js`**~~ — **done for Cursor**. Closes `cursor-no-auto-router-sync` and gives Gemini/Aider adapters a proven local-skill watcher pattern.
4. **Gemini CLI adapter or Aider adapter** (~1–2 days each). At this point both have all shared infrastructure patterns available.
5. ~~**Unify JSON receipt shape**~~ — **done**. All four emitters now expose the same receipt keys and the round-trip test checks idempotency from every adapter receipt.
6. ~~**macOS CI row**~~ — **done**. **npm publish workflow** remains deferred because it needs release-policy and token-handling decisions.

The cut line between v0.2 ship-now and v0.3 backlog is drawn at step 1. Steps 2–3 are the right v0.3 starter set because they unblock the most downstream work for the least code.
