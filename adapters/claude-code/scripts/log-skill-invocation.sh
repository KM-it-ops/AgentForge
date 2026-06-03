#!/usr/bin/env bash
# Telemetry: log skill name + timestamp on every Skill tool invocation.
# Reads JSON from stdin per Claude Code hook convention; matches skill name from tool_input.
LOG="{{agent_home_native}}/telemetry/skill-invocations.jsonl"
mkdir -p "$(dirname "$LOG")"
INPUT=$(cat || true)
SKILL=$(echo "$INPUT" | grep -oE '"skill"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"skill"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -n "$SKILL" ]; then
  echo "{\"ts\":\"$(date '+%Y-%m-%dT%H:%M:%S%z')\",\"skill\":\"$SKILL\"}" >> "$LOG" 2>/dev/null || true
fi
exit 0
