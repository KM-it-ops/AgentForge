#!/usr/bin/env bash
# log-session-end.sh — append one markdown line on Codex CLI exit.
# Wired via shell rc trap (see install-shell-trap.sh).

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
SINK="$AGENT_HOME/memory/feedback/session-log.md"
mkdir -p "$(dirname "$SINK")" 2>/dev/null || true

TS="$(date -u +%FT%TZ)"
if [ ! -f "$SINK" ]; then
  printf '# Session log\n\nAuto-appended by the SessionEnd hook.\n' > "$SINK"
fi
printf -- '- %s session ended\n' "$TS" >> "$SINK" 2>/dev/null || true
exit 0
