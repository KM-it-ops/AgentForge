#!/usr/bin/env bash
# install-cron.sh — install the Fridays 3pm weekly auto-prune.
# Unix: appends to crontab if not already present.
# Windows (when run under Git Bash / WSL detects MSYS): prints a PowerShell
# snippet the user can run in an elevated shell instead.
#
# Idempotent: re-running with the same entry leaves crontab unchanged.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
WRAPPER="$AGENT_HOME/scripts/auto-prune-weekly.sh"
TAG="# AgentForge-AutoPruneWeekly"
CRON_LINE="0 15 * * 5 $WRAPPER $TAG"

is_windows() {
  case "${OS:-}" in
    Windows_NT) return 0 ;;
  esac
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  return 1
}

install_unix() {
  # Read current crontab (might be empty).
  CURRENT="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$CURRENT" | grep -Fq "$TAG"; then
    echo "[install-cron] entry already present — leaving crontab unchanged."
    return 0
  fi
  { printf '%s\n' "$CURRENT"; printf '%s\n' "$CRON_LINE"; } | crontab -
  echo "[install-cron] installed weekly cron entry: $CRON_LINE"
}

install_windows() {
  cat <<'PS'
[install-cron] Windows detected. Run this in an elevated PowerShell to register the scheduled task:

    $action  = New-ScheduledTaskAction -Execute 'bash.exe' -Argument '"REPLACE_WITH_WRAPPER_PATH"'
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At 3pm
    Register-ScheduledTask -TaskName 'AgentForge-AutoPruneWeekly' -Action $action -Trigger $trigger -Description 'AgentForge weekly auto-prune (codex adapter)'

Replace REPLACE_WITH_WRAPPER_PATH with:
PS
  echo "    $WRAPPER"
}

if is_windows; then
  install_windows
else
  install_unix
fi
exit 0
