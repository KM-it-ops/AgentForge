#!/usr/bin/env bash
# SessionEnd: append timestamped session marker for retrospective analysis.
LOG="{{agent_home_native}}/memory/feedback/session-log.md"
mkdir -p "$(dirname "$LOG")"
if [ ! -f "$LOG" ]; then
  echo "# Session log" > "$LOG"
  echo "" >> "$LOG"
fi
echo "- $(date '+%Y-%m-%d %H:%M:%S') session ended" >> "$LOG" 2>/dev/null || true
exit 0
