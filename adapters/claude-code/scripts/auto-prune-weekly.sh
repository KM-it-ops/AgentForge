#!/usr/bin/env bash
# Weekly self-improvement loop (AgentForge / Claude Code adapter):
#  1. Generate the dead-skills telemetry report.
#  2. Spawn a non-interactive Claude session that:
#       - reads the report
#       - archives skills with ZERO invocations over {{grace_period_days}}+ days
#       - proposes (does NOT apply) router-table edits for high-frequency patterns
#       - commits the changes in {{agent_home_native}}/ with a conventional message
#  3. Log the run.
#
# Triggered by Windows Task Scheduler (see scripts/install-task.ps1).
# Manual run: bash {{agent_home_posix}}/hooks/scripts/auto-prune-weekly.sh

set -e

CLAUDE_HOME="{{agent_home_native}}"
LOG="$CLAUDE_HOME/telemetry/auto-prune.log"
mkdir -p "$(dirname "$LOG")"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] auto-prune started" >> "$LOG"

# 1. Run the report
bash "$CLAUDE_HOME/hooks/scripts/dead-skills-report.sh" >> "$LOG" 2>&1

# Locate the freshest report file
LATEST_REPORT=$(ls -t "$CLAUDE_HOME/memory/feedback/"dead-skills-*.md 2>/dev/null | head -1)

if [ -z "$LATEST_REPORT" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] no report generated; aborting" >> "$LOG"
  exit 0
fi

# 2. Spawn Claude in non-interactive mode with a bounded autonomous prompt.
#    Use --dangerously-skip-permissions because the action surface is narrow
#    and the changes are reversible via git ({{agent_home_native}}/ is a git repo).
PROMPT="You are running as a scheduled weekly maintenance agent for {{agent_home_native}}/.
Your one job: act on the latest dead-skills report at $LATEST_REPORT.

Steps you MUST take in order:
1. Read $LATEST_REPORT.
2. Read {{agent_home_native}}/telemetry/skill-invocations.jsonl to determine the AGE of each unused skill (when its directory was created — use 'stat' or git log on {{agent_home_native}}/skills/<name>/).
3. For EACH local skill listed as having zero invocations:
   - If the skill directory is older than {{grace_period_days}} days (mtime), move it to {{agent_home_native}}/skills/_archived/<name>/.
   - If younger than {{grace_period_days}} days, leave it alone (grace period).
4. Read {{agent_home_native}}/CLAUDE.md and identify the '## Skill Router' table.
5. Read the last ~200 lines of {{agent_home_native}}/telemetry/prompts.jsonl. Look for repeated phrasings that are not currently routed. Propose (do NOT apply) up to 3 router-table additions. Write proposals to {{agent_home_native}}/memory/feedback/router-suggestions-\$(date +%F).md.
6. If you archived any skills, commit the changes in {{agent_home_native}}/ with:
   git add -A && git commit -m 'chore: weekly auto-prune (N skills archived after {{grace_period_days}}d zero use)'
7. Print a one-paragraph summary of what you did. Exit.

Hard rules:
- Never delete; only move to _archived/.
- Never modify {{agent_home_native}}/CLAUDE.md directly in this run; only WRITE router suggestions to the feedback file for human review.
- Never touch {{agent_home_native}}/plugins/ or settings.json.
- Stay inside {{agent_home_native}}/. Do not modify any project repo."

cd "$CLAUDE_HOME"

claude {{agent_invocation_flags}} "$PROMPT" >> "$LOG" 2>&1 || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] claude exited non-zero; check log" >> "$LOG"
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] auto-prune finished" >> "$LOG"
exit 0
