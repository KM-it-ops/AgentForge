#!/usr/bin/env bash
# universal/lib/installers/install-cron.sh
#
# Adapter-agnostic crontab installer for AgentForge.
#
# Usage:
#   install-cron.sh --script <path> --schedule "<cron-expr>" --tag <name> [--unregister]
#
# Behavior:
#   - On Unix (Linux + macOS): appends the cron line to the user's crontab if
#     not already present (detected by --tag); --unregister removes any line
#     whose comment-tag matches --tag. Idempotent.
#   - On Windows (Git Bash / MSYS / Cygwin detected): execs the sibling
#     install-task.ps1 via `powershell -ExecutionPolicy Bypass -File` with the
#     same script + schedule + tag. The .ps1 itself handles elevation prompting.
#
# Calling-convention examples:
#   install-cron.sh --script "$AGENT_HOME/scripts/auto-prune-weekly.sh" \
#                   --schedule "0 15 * * 5" --tag "AgentForge-AutoPruneWeekly"
#   install-cron.sh --tag "AgentForge-AutoPruneWeekly" --unregister
#
# Cron expression on Unix is passed verbatim. The Windows side translates the
# subset of cron we support (5-field standard) into ScheduledTaskTrigger
# arguments — see install-task.ps1 for the supported subset.

set -u

SCRIPT_PATH=""
SCHEDULE=""
TAG=""
UNREGISTER=0

while [ $# -gt 0 ]; do
  case "$1" in
    --script)     SCRIPT_PATH="$2"; shift 2 ;;
    --schedule)   SCHEDULE="$2";    shift 2 ;;
    --tag)        TAG="$2";         shift 2 ;;
    --unregister) UNREGISTER=1;     shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "install-cron: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

[ -z "$TAG" ] && { echo "install-cron: --tag is required" >&2; exit 2; }

is_windows() {
  case "${OS:-}" in Windows_NT) return 0 ;; esac
  case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac
  return 1
}

unregister_unix() {
  local current
  current="$(crontab -l 2>/dev/null || true)"
  if ! printf '%s\n' "$current" | grep -Fq "# $TAG"; then
    echo "[install-cron] no entry tagged '# $TAG' — nothing to remove."
    return 0
  fi
  printf '%s\n' "$current" | grep -Fv "# $TAG" | crontab -
  echo "[install-cron] removed crontab entries tagged '# $TAG'."
}

install_unix() {
  [ -z "$SCRIPT_PATH" ] && { echo "install-cron: --script is required on install" >&2; exit 2; }
  [ -z "$SCHEDULE" ]    && { echo "install-cron: --schedule is required on install" >&2; exit 2; }

  local cron_line="$SCHEDULE $SCRIPT_PATH # $TAG"
  local current
  current="$(crontab -l 2>/dev/null || true)"

  if printf '%s\n' "$current" | grep -Fq "# $TAG"; then
    echo "[install-cron] entry tagged '# $TAG' already present — leaving crontab unchanged."
    return 0
  fi

  { printf '%s\n' "$current"; printf '%s\n' "$cron_line"; } | crontab -
  echo "[install-cron] installed: $cron_line"
}

windows_delegate() {
  local here ps1
  here="$(cd "$(dirname "$0")" && pwd)"
  ps1="$here/install-task.ps1"
  if [ ! -f "$ps1" ]; then
    echo "[install-cron] Windows detected, but sibling install-task.ps1 not found at $ps1." >&2
    echo "                Run the adapter's emit.js to populate scripts/installers/, or invoke install-task.ps1 manually." >&2
    return 1
  fi

  local args=("-TaskName" "$TAG")
  if [ "$UNREGISTER" -eq 1 ]; then
    args+=("-Unregister")
  else
    [ -z "$SCRIPT_PATH" ] && { echo "install-cron: --script is required on install" >&2; exit 2; }
    [ -z "$SCHEDULE" ]    && { echo "install-cron: --schedule is required on install" >&2; exit 2; }
    args+=("-Script" "$SCRIPT_PATH" "-Schedule" "$SCHEDULE")
  fi

  # powershell.exe accepts mixed-style paths. Pass through verbatim.
  echo "[install-cron] Windows detected — delegating to install-task.ps1."
  powershell.exe -ExecutionPolicy Bypass -File "$ps1" "${args[@]}"
}

if is_windows; then
  windows_delegate
elif [ "$UNREGISTER" -eq 1 ]; then
  unregister_unix
else
  install_unix
fi
exit 0
