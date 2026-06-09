#!/usr/bin/env bash
# AgentForge round-trip test.
#
# For each adapter:
#   1. Create a fresh sandbox dir with an initialized git repo.
#   2. Run emit.js — captures the first-emit output.
#   3. Run emit.js again — verifies idempotency.
#
# Idempotency criteria (BOTH must hold on the second emit):
#   - exit code 0
#   - `git status --porcelain` is empty inside the sandbox
#   - every adapter emits JSON with files_changed: 0
#
# Exit 0 on success, non-zero on any failure. Designed for CI.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_ROOT="${SANDBOX_ROOT:-${TMPDIR:-/tmp}/agentforge-roundtrip}"
ADAPTERS=("claude-code" "codex" "generic" "cursor")

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

setup_sandbox() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email roundtrip@agentforge.local
  git -C "$dir" config user.name roundtrip
}

run_adapter() {
  local adapter="$1"
  local sandbox="$SANDBOX_ROOT/$adapter"
  local emit="$REPO_ROOT/adapters/$adapter/emit.js"

  echo "=== $adapter ==="
  [ -f "$emit" ] || fail "$adapter: emit.js not found at $emit"

  setup_sandbox "$sandbox"

  # Keep emit logs outside the sandbox so the adapter's own git-checkpoint
  # doesn't sweep them into its tree (would defeat the idempotency check).
  local log1="$SANDBOX_ROOT/.emit-$adapter-1.log"
  local log2="$SANDBOX_ROOT/.emit-$adapter-2.log"

  echo "  first emit -> $sandbox"
  if ! node "$emit" "$sandbox" >"$log1" 2>&1; then
    cat "$log1" >&2
    fail "$adapter: first emit exited non-zero"
  fi

  local file_count
  file_count=$(find "$sandbox" -type f -not -path "*/.git/*" | wc -l)
  echo "  first emit wrote $file_count files"
  [ "$file_count" -gt 0 ] || fail "$adapter: first emit produced no files"

  echo "  second emit (idempotency check)"
  if ! node "$emit" "$sandbox" >"$log2" 2>&1; then
    cat "$log2" >&2
    fail "$adapter: second emit exited non-zero"
  fi

  # Every adapter emits a JSON receipt; assert idempotency from it.
  if ! grep -q '"files_changed": 0' "$log2"; then
    echo "--- second emit log ---" >&2
    cat "$log2" >&2
    fail "$adapter: second emit reported files_changed != 0"
  fi

  # git status must be clean after both emits + checkpoint.
  local dirty
  dirty="$(git -C "$sandbox" status --porcelain)"
  if [ -n "$dirty" ]; then
    echo "--- dirty paths ---" >&2
    echo "$dirty" >&2
    fail "$adapter: working tree not clean after second emit"
  fi

  echo "  OK"
}

main() {
  echo "AgentForge round-trip test"
  echo "  repo:    $REPO_ROOT"
  echo "  sandbox: $SANDBOX_ROOT"
  echo

  command -v node >/dev/null 2>&1 || fail "node not on PATH"
  command -v git >/dev/null 2>&1 || fail "git not on PATH"

  for adapter in "${ADAPTERS[@]}"; do
    run_adapter "$adapter"
  done

  echo
  echo "All adapters round-tripped cleanly."
}

main "$@"
