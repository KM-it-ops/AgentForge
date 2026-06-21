#!/usr/bin/env bash
# Fail if spec/*.yaml contains machine-specific or personal paths/names.
# Keeps the public repo safe for demo, Studio, and npm publish.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPEC_DIR="$REPO_ROOT/spec"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "  $*"; }

# Patterns that must not appear in committed spec YAML (use {HOME} placeholders instead).
FORBIDDEN=(
  'C:\\Users\\'
  'C:/Users/'
  'C:\\AI\\'
  'C:/AI/'
  'alkur'
  'Mahmoud'
  'Charlotte, NC'
)

echo "AgentForge spec/public check"
echo "  dir: $SPEC_DIR"
echo

shopt -s nullglob
files=("$SPEC_DIR"/*.yaml)
[ "${#files[@]}" -gt 0 ] || fail "no spec/*.yaml files found"

for pattern in "${FORBIDDEN[@]}"; do
  if grep -rF --include='*.yaml' -l "$pattern" "$SPEC_DIR" >/dev/null 2>&1; then
    echo "Forbidden pattern in spec/: $pattern" >&2
    grep -rF --include='*.yaml' -n "$pattern" "$SPEC_DIR" >&2 || true
    fail "spec contains personal or machine-specific data — use placeholders (see spec/CUSTOMIZE.md)"
  fi
  note "ok: no '$pattern'"
done

echo
echo "spec/*.yaml is public-safe."
