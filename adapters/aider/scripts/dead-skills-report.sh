#!/usr/bin/env bash
# AgentForge — generic adapter: weekly dead-skills report.
# Lists every skills/<name>/ dir that has ZERO invocations recorded in telemetry.
#
# Resolves target dir in this order:
#   1. --target <dir>
#   2. $AGENTFORGE_HOME
#   3. The script's parent's parent dir if it contains AGENTS.md
#   4. PWD
#
# Run manually or wire into cron / Task Scheduler / launchd / systemd timer.
# Documented as "user-driven" — the generic adapter cannot assume a scheduler.

set -eu

TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$TARGET" ]; then
  if [ -n "${AGENTFORGE_HOME:-}" ]; then
    TARGET="$AGENTFORGE_HOME"
  else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    PARENT="$(cd "$SCRIPT_DIR/.." && pwd)"
    if [ -f "$PARENT/AGENTS.md" ]; then
      TARGET="$PARENT"
    else
      TARGET="$(pwd)"
    fi
  fi
fi

TELEMETRY="$TARGET/telemetry/skill-invocations.jsonl"
SKILLS_DIR="$TARGET/skills"
OUT_DIR="$TARGET/logs"
TODAY="$(date '+%Y-%m-%d')"
OUT="$OUT_DIR/dead-skills-$TODAY.md"

mkdir -p "$OUT_DIR"

if [ ! -f "$TELEMETRY" ]; then
  {
    echo "# Dead skills report — $TODAY"
    echo ""
    echo "No telemetry log found at \`$TELEMETRY\`."
    echo ""
    echo "The generic adapter does not auto-instrument skill invocations. To populate"
    echo "this report, append one JSON line per skill use to that file:"
    echo ""
    echo '    {"ts":"<iso-8601>","skill":"<skill-name>"}'
    echo ""
    echo "Then re-run this script."
  } > "$OUT"
  echo "wrote $OUT (no telemetry)"
  exit 0
fi

INVOKED="$(grep -oE '"skill":"[^"]+"' "$TELEMETRY" 2>/dev/null | sed -E 's/.*"skill":"([^"]+)".*/\1/' | sort -u || true)"

ALL_SKILLS=""
if [ -d "$SKILLS_DIR" ]; then
  ALL_SKILLS="$(ls -1 "$SKILLS_DIR" 2>/dev/null | grep -v '^_archived$' | grep -v '^README.md$' | sort || true)"
fi

{
  echo "# Dead skills report — $TODAY"
  echo ""
  echo "Target: \`$TARGET\`"
  echo ""
  echo "## Local skills with zero invocations"
  echo ""
  if [ -z "$ALL_SKILLS" ]; then
    echo "_(no local skills installed)_"
  else
    DEAD_COUNT=0
    for s in $ALL_SKILLS; do
      if ! echo "$INVOKED" | grep -qx "$s"; then
        echo "- $s"
        DEAD_COUNT=$((DEAD_COUNT + 1))
      fi
    done
    if [ "$DEAD_COUNT" -eq 0 ]; then
      echo "_(none — every installed skill has at least one recorded invocation)_"
    fi
  fi
  echo ""
  echo "## Invoked skills (any time)"
  echo ""
  if [ -z "$INVOKED" ]; then
    echo "_(none recorded)_"
  else
    echo "$INVOKED" | sed 's/^/- /'
  fi
} > "$OUT"

echo "wrote $OUT"
exit 0
