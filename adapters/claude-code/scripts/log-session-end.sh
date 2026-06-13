#!/usr/bin/env bash
# SessionEnd: append timestamped session marker for retrospective analysis.
# Logs live OUTSIDE memory/ — memory/ holds curated knowledge only (brain hygiene).
LOG="{{agent_home_native}}/logs/session-log.md"
mkdir -p "$(dirname "$LOG")"
if [ ! -f "$LOG" ]; then
  echo "# Session log" > "$LOG"
  echo "" >> "$LOG"
fi
echo "- $(date '+%Y-%m-%d %H:%M:%S') session ended" >> "$LOG" 2>/dev/null || true
exit 0
