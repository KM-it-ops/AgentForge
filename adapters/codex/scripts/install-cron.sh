#!/usr/bin/env bash
# adapters/codex/scripts/install-cron.sh — thin wrapper around the universal
# installer. Schedules the weekly auto-prune for the codex adapter.
#
# Delegates to <target>/scripts/installers/install-cron.sh (copied from
# universal/lib/installers/ by emit.js), which handles cron on Unix and
# Task Scheduler on Windows. Closes gap codex-windows-cron-not-executed.
#
# Forward any extra args (notably --unregister) to the universal installer.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
UNIVERSAL="$AGENT_HOME/scripts/installers/install-cron.sh"

if [ ! -f "$UNIVERSAL" ]; then
  echo "[install-cron] universal installer not found at $UNIVERSAL." >&2
  echo "                Run 'node adapters/codex/emit.js <target>' first to populate scripts/installers/." >&2
  exit 1
fi

exec "$UNIVERSAL" \
  --script   "$AGENT_HOME/scripts/auto-prune-weekly.sh" \
  --schedule "0 15 * * 5" \
  --tag      "AgentForge-AutoPruneWeekly" \
  "$@"
