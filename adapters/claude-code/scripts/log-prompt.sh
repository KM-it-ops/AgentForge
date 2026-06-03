#!/usr/bin/env bash
# Telemetry: log first 80 chars of user prompt for routing-pattern analysis.
LOG="{{agent_home_native}}/telemetry/prompts.jsonl"
mkdir -p "$(dirname "$LOG")"
INPUT=$(cat || true)
PROMPT=$(echo "$INPUT" | grep -oE '"prompt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"prompt"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' | cut -c1-80 | tr -d '\n' | sed 's/"/\\"/g')
if [ -n "$PROMPT" ]; then
  echo "{\"ts\":\"$(date '+%Y-%m-%dT%H:%M:%S%z')\",\"prompt\":\"$PROMPT\"}" >> "$LOG" 2>/dev/null || true
fi
exit 0
