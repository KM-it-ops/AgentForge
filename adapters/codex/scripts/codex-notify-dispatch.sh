#!/usr/bin/env bash
# codex-notify-dispatch.sh — Codex `notify` is a single coarse-grained hook.
# We read the event payload (Codex passes JSON on stdin in current builds; if
# your build differs, see GAP in adapters/codex/README.md) and route to the
# right log script.
#
# Idempotent and safe to call repeatedly. Errors are swallowed so a logging
# failure never blocks the agent.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$AGENT_HOME/telemetry"
mkdir -p "$LOG_DIR" 2>/dev/null || true

# Read payload from stdin (best-effort; tolerate empty).
PAYLOAD="$(cat 2>/dev/null || true)"

# Try to extract event kind. Three known shapes:
#   {"type":"tool-call",...}  ->  skill_invocation candidate
#   {"type":"user-message",...} -> user_prompt
#   {"type":"session-end",...} -> session_end (rare via notify; usually handled by shell trap)
# Fall back to logging to a generic sink.
KIND=""
if [ -n "$PAYLOAD" ]; then
  KIND="$(printf '%s' "$PAYLOAD" | sed -n 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
fi

case "$KIND" in
  tool-call|tool_use|tool.use)
    "$AGENT_HOME/scripts/log-skill-invocation.sh" "$PAYLOAD" >/dev/null 2>&1 || true
    ;;
  user-message|user_prompt|user.prompt)
    "$AGENT_HOME/scripts/log-user-prompt.sh" "$PAYLOAD" >/dev/null 2>&1 || true
    ;;
  session-end|session_end|session.end)
    "$AGENT_HOME/scripts/log-session-end.sh" >/dev/null 2>&1 || true
    ;;
  *)
    # Unknown event kind — log to generic sink for later auditing.
    printf '%s %s\n' "$(date -u +%FT%TZ)" "${KIND:-unknown} ${PAYLOAD:0:200}" \
      >> "$LOG_DIR/notify-generic.log" 2>/dev/null || true
    ;;
esac
exit 0
