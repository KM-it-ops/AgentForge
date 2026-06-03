# universal/lib/installers/

Adapter-agnostic scheduled-task installers. Two files, one calling convention.

## Files

| File | Platform | Invoked by |
|---|---|---|
| `install-cron.sh` | Linux + macOS (crontab); Windows (delegates to PS1) | Adapters' `scripts/install-cron.sh` thin wrappers |
| `install-task.ps1` | Windows Task Scheduler | `install-cron.sh` on Windows, or direct PowerShell invocation |

## Calling convention

`install-cron.sh` takes the same arguments on every platform:

```
install-cron.sh \
  --script   <absolute path to the script to schedule> \
  --schedule "<5-field cron expression>" \
  --tag      <unique identifier, used for both cron-comment matching and Windows TaskName>
  [--unregister]
```

`install-task.ps1` is the Windows backend. Direct invocation:

```
powershell -ExecutionPolicy Bypass -File install-task.ps1 `
  -TaskName <name> -Script <path> -Schedule "<cron expr>" `
  [-TimeoutMinutes 15] [-Description "..."] [-Unregister]
```

## Adapter integration pattern

Each adapter ships its own `scripts/install-cron.sh` as a **thin wrapper** that
supplies adapter-specific args:

```bash
#!/usr/bin/env bash
# adapters/<name>/scripts/install-cron.sh — adapter-specific cron wrapper.
AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
exec "$AGENT_HOME/scripts/installers/install-cron.sh" \
  --script   "$AGENT_HOME/scripts/auto-prune-weekly.sh" \
  --schedule "0 15 * * 5" \
  --tag      "AgentForge-AutoPruneWeekly" \
  "$@"
```

The adapter's `emit.js` copies both `install-cron.sh` and `install-task.ps1`
from `universal/lib/installers/` into `<target>/scripts/installers/` at emit
time, byte-identical. This keeps the canonical source in `universal/` (per the
"copied verbatim by every adapter" architecture) while npm-tarball distribution
stays self-contained per adapter.

## Supported cron subset (Windows side)

The Linux/macOS path passes the cron expression verbatim. The Windows path
parses these shapes into `New-ScheduledTaskTrigger` arguments:

| Cron pattern | Trigger |
|---|---|
| `M H * * <dow>` | Weekly on `<dow>` at `H:M` |
| `M H * * *` | Daily at `H:M` |
| `M H <dom> * *` | Daily at `H:M` (with a warning — monthly not natively supported) |

`<dow>` accepts both numeric (0–7, Sun=0=7) and three-letter names (MON, TUE, …).

Schedules outside this subset will fall back to Daily and print a warning;
edit the registered task by hand in Task Scheduler if you need something more
exotic. The intent here is "schedule the AgentForge weekly maintenance loops,"
not "be a general cron-to-TaskScheduler translator."

## Idempotency

- Unix: re-running with the same `--tag` detects the existing crontab line and
  leaves it unchanged.
- Windows: `install-task.ps1` unregisters any prior task with the same
  `-TaskName` before registering, so a re-run rewrites cleanly.
- Both platforms: `--unregister` / `-Unregister` removes the entry and is
  also safe to run when nothing is registered.

## Boundaries

These installers:

- Never elevate themselves. Windows `Register-ScheduledTask` may prompt for
  elevation depending on user policy; that's the platform's call.
- Never schedule cross-user tasks. Tasks run as the invoking user.
- Never write logs themselves — the scheduled script is responsible for its
  own logging. The installer just registers the schedule.
- Refuse any cron field outside the supported subset on Windows by warning
  and falling back to Daily; we'd rather degrade visibly than silently
  produce an unexpected schedule.
