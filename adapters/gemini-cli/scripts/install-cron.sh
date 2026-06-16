#!/usr/bin/env bash
# adapters/gemini-cli/scripts/install-cron.sh — thin wrapper around the universal
# installer. Gemini CLI has no SessionEnd hook and no headless prune binding, so
# the schedule here just runs gemini-weekly-report.sh weekly and appends the
# report into logs/ (NOT memory/) where the user can read it during their next
# session.
#
# Same calling convention as the codex / cursor wrappers — the user can
# --unregister to remove the entry. Delegates to
# <target>/scripts/installers/install-cron.sh (copied from
# universal/lib/installers/ by emit.js), which handles cron on Unix and Windows
# Task Scheduler on Windows.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
UNIVERSAL="$AGENT_HOME/scripts/installers/install-cron.sh"
REPORTER="$AGENT_HOME/scripts/gemini-weekly-report.sh"

if [ ! -f "$UNIVERSAL" ]; then
  echo "[install-cron] universal installer not found at $UNIVERSAL." >&2
  echo "                Run 'node adapters/gemini-cli/emit.js <target>' first to populate scripts/installers/." >&2
  exit 1
fi

exec "$UNIVERSAL" \
  --script   "$REPORTER" \
  --schedule "0 15 * * 5" \
  --tag      "AgentForge-GeminiWeeklyReport" \
  "$@"
