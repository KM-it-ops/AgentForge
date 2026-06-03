#!/usr/bin/env bash
# log-user-prompt.sh — append one jsonl row per user prompt (first 80 chars).

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
SINK="$AGENT_HOME/telemetry/prompts.jsonl"
mkdir -p "$(dirname "$SINK")" 2>/dev/null || true

PAYLOAD="${1:-}"
TS="$(date -u +%FT%TZ)"

# Extract the prompt text. Try common keys.
TXT="$(printf '%s' "$PAYLOAD" | sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [ -z "$TXT" ]; then
  TXT="$(printf '%s' "$PAYLOAD" | sed -n 's/.*"content"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -z "$TXT" ] && TXT=""

# Truncate to 80 chars.
TRUNC="$(printf '%s' "$TXT" | cut -c1-80)"
TRUNC_ESC="$(printf '%s' "$TRUNC" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf '{"ts":"%s","prompt":"%s"}\n' "$TS" "$TRUNC_ESC" >> "$SINK" 2>/dev/null || true
exit 0
