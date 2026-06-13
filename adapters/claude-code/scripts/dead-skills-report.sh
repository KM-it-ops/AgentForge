#!/usr/bin/env bash
# Weekly dead-skills report: list all skill dirs that have ZERO invocations in telemetry.
# Run via /loop 7d or manually.
TELEMETRY="{{agent_home_native}}/telemetry/skill-invocations.jsonl"
SKILLS_DIR="{{agent_home_native}}/skills"
TODAY=$(date '+%Y-%m-%d')
# Report lives in logs/ (outside the brain), fixed filename — no dated accumulation.
OUT="{{agent_home_native}}/logs/dead-skills-latest.md"
mkdir -p "$(dirname "$OUT")"

if [ ! -f "$TELEMETRY" ]; then
  echo "# Dead skills report — $TODAY" > "$OUT"
  echo "" >> "$OUT"
  echo "Telemetry log not found at $TELEMETRY. No data yet." >> "$OUT"
  exit 0
fi

INVOKED=$(grep -oE '"skill":"[^"]+"' "$TELEMETRY" | sed -E 's/.*"skill":"([^"]+)".*/\1/' | sort -u)
ALL_SKILLS=$(ls -1 "$SKILLS_DIR" 2>/dev/null | grep -v '^_archived$' | sort)

{
  echo "# Dead skills report — $TODAY"
  echo ""
  echo "Local skills with zero invocations in telemetry:"
  echo ""
  for s in $ALL_SKILLS; do
    if ! echo "$INVOKED" | grep -qx "$s"; then
      echo "- $s"
    fi
  done
  echo ""
  echo "Invoked skills (any time):"
  echo "$INVOKED" | sed 's/^/- /'
} > "$OUT"

echo "wrote $OUT"
exit 0
