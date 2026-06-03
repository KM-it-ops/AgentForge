#!/usr/bin/env bash
# auto-prune-weekly.sh — wrapper that generates a dead-skills report and then
# spawns Codex non-interactively with the bounded prune prompt from
# spec/automation.yaml. Logs everything to telemetry/auto-prune.log.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$AGENT_HOME/telemetry/auto-prune.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

TS="$(date -u +%FT%TZ)"
echo "=== $TS auto-prune start ===" >> "$LOG"

# 1. Generate fresh dead-skills report.
REPORT="$("$AGENT_HOME/scripts/dead-skills-report.sh")" || REPORT=""
echo "report: $REPORT" >> "$LOG"

DATE="$(date +%F)"
TELEMETRY_SKILLS_PATH="$AGENT_HOME/telemetry/skill-invocations.jsonl"
TELEMETRY_PROMPTS_PATH="$AGENT_HOME/telemetry/prompts.jsonl"
GRACE_PERIOD_DAYS=60

# 2. Build the bounded prompt (mirrors automation.yaml prompt_template).
PROMPT="$(cat <<EOF
You are running as a scheduled weekly maintenance agent for $AGENT_HOME.
Your one job: act on the latest dead-skills report at $REPORT.

Steps you MUST take in order:
1. Read $REPORT.
2. Read $TELEMETRY_SKILLS_PATH to determine the AGE of each unused skill.
3. For EACH local skill listed as having zero invocations:
   - If the skill directory is older than $GRACE_PERIOD_DAYS days (mtime),
     move it to $AGENT_HOME/skills/_archived/<name>/.
   - If younger, leave it alone (grace period).
4. Read the identity file and identify the Skill Router table.
5. Read the last ~200 lines of $TELEMETRY_PROMPTS_PATH. Look for repeated phrasings
   that are not currently routed. Propose (do NOT apply) up to 3 router-table additions.
   Write proposals to $AGENT_HOME/memory/feedback/router-suggestions-$DATE.md.
6. If you archived any skills, commit the changes:
   git add -A && git commit -m 'chore: weekly auto-prune (N skills archived after ${GRACE_PERIOD_DAYS}d zero use)'
7. Print a one-paragraph summary of what you did. Exit.

Hard rules:
- Never delete; only move to _archived/.
- Never modify the identity file directly in this run; only WRITE router suggestions for human review.
- Never touch platform plugins or settings.
- Stay inside $AGENT_HOME. Do not modify any project repo.
EOF
)"

# 3. Spawn Codex non-interactively with a 15-minute hard timeout.
#    Codex CLI flag names may drift across builds; --non-interactive and
#    --auto-approve are inherited from spec/automation.yaml. The pre-flight
#    below verifies both flags exist in the installed Codex binary's --help
#    output. If either is missing, abort with an actionable message instead
#    of silently failing with an unrecognized-flag error.
CODEX_BIN="${CODEX_BIN:-codex}"
if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  echo "codex binary not found on PATH ($CODEX_BIN); aborting" >> "$LOG"
  echo "=== $(date -u +%FT%TZ) auto-prune abort (no codex) ===" >> "$LOG"
  exit 0
fi

# Pre-flight: confirm both flags exist. `codex --help` may write to stdout
# or stderr depending on build; capture both. If we cannot run --help at
# all, fall through (the actual invocation will surface a useful error).
HELP_OUT="$("$CODEX_BIN" --help 2>&1 || true)"
MISSING_FLAGS=""
if ! printf '%s' "$HELP_OUT" | grep -qE -- '--non-interactive'; then
  MISSING_FLAGS="$MISSING_FLAGS --non-interactive"
fi
if ! printf '%s' "$HELP_OUT" | grep -qE -- '--auto-approve'; then
  MISSING_FLAGS="$MISSING_FLAGS --auto-approve"
fi
if [ -n "$MISSING_FLAGS" ]; then
  {
    echo "auto-prune abort: installed Codex build does not expose:$MISSING_FLAGS"
    echo "  fix: run '$CODEX_BIN --help' yourself, find the equivalent flags,"
    echo "       then update spec/automation.yaml and re-emit, OR override"
    echo "       this script directly. See adapters/codex/README.md gap #4."
  } >> "$LOG"
  echo "=== $(date -u +%FT%TZ) auto-prune abort (flags unsupported) ===" >> "$LOG"
  exit 0
fi

# 15-minute timeout (timeout binary is on most Linux; mac uses gtimeout).
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN="timeout 15m"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN="gtimeout 15m"
fi

printf '%s' "$PROMPT" | $TIMEOUT_BIN "$CODEX_BIN" --non-interactive --auto-approve >> "$LOG" 2>&1
RC=$?

echo "=== $(date -u +%FT%TZ) auto-prune end rc=$RC ===" >> "$LOG"
exit 0
