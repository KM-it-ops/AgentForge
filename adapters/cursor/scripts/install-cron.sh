#!/usr/bin/env bash
# adapters/cursor/scripts/install-cron.sh — thin wrapper around the universal
# installer. Cursor has no AI binary to spawn for auto-prune, so the schedule
# here just runs dead-skills-report.sh weekly and appends the report into
# memory/feedback/ where the user can read it during their next session.
#
# Closes gap cursor-no-scheduled-task. Same calling convention as the codex
# wrapper — the user can --unregister to remove the entry.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
UNIVERSAL="$AGENT_HOME/scripts/installers/install-cron.sh"
REPORTER="$AGENT_HOME/scripts/cursor-weekly-report.sh"

if [ ! -f "$UNIVERSAL" ]; then
  echo "[install-cron] universal installer not found at $UNIVERSAL." >&2
  echo "                Run 'node adapters/cursor/emit.js <target>' first to populate scripts/installers/." >&2
  exit 1
fi

exec "$UNIVERSAL" \
  --script   "$REPORTER" \
  --schedule "0 15 * * 5" \
  --tag      "AgentForge-CursorWeeklyReport" \
  "$@"
