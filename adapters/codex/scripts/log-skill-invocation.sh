#!/usr/bin/env bash
# log-skill-invocation.sh — append one jsonl row per Skill-tool call.
# Codex's `notify` event granularity may not isolate Skill calls cleanly
# (see README "Known gaps"); we extract a best-effort skill name from the
# payload. If absent, we log "unknown" and tag the row for audit.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
SINK="$AGENT_HOME/telemetry/skill-invocations.jsonl"
mkdir -p "$(dirname "$SINK")" 2>/dev/null || true

PAYLOAD="${1:-}"
TS="$(date -u +%FT%TZ)"

# Try a couple of common payload shapes.
SKILL="$(printf '%s' "$PAYLOAD" | sed -n 's/.*"skill"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [ -z "$SKILL" ]; then
  SKILL="$(printf '%s' "$PAYLOAD" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -z "$SKILL" ] && SKILL="unknown"

# Escape any embedded double-quotes in skill name.
SKILL_ESC="$(printf '%s' "$SKILL" | sed 's/"/\\"/g')"
printf '{"ts":"%s","skill":"%s"}\n' "$TS" "$SKILL_ESC" >> "$SINK" 2>/dev/null || true
exit 0
