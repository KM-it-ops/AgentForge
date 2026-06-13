#!/usr/bin/env bash
# AgentForge merge-safe test.
#
# Verifies that emitting into a target that ALREADY contains user-authored
# config/identity files PRESERVES the user's content instead of clobbering it.
#
# This guards the real-world adoption path: a user with a hand-maintained
# ~/.codex (custom config.toml, curated AGENTS.md learnings) runs the adapter
# and must not lose their settings.
#
# Per adapter that owns an identity/config file:
#   1. Seed a sandbox with pre-existing user files carrying unique markers.
#   2. Emit.
#   3. Assert the user's markers survive AND AgentForge's managed block / sidecar
#      is present.
#   4. Re-emit; assert still preserved (adoption path is idempotent too).
#
# Exit 0 on success, non-zero on any failure. Designed for CI.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_ROOT="${SANDBOX_ROOT:-${TMPDIR:-/tmp}/agentforge-mergesafe}"

# Unique strings that must survive an emit unscathed.
USER_AGENTS_MARK="USER-LEARNING-KEEP: volta EPERM -> NVM-first PATH"
USER_CONFIG_MARK='model = "gpt-5.5-keep-me"'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

seed_repo() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email mergesafe@agentforge.local
  git -C "$dir" config user.name mergesafe
}

test_codex() {
  local sb="$SANDBOX_ROOT/codex"
  seed_repo "$sb"

  # Pre-existing, hand-authored user files (NOT AgentForge-generated).
  printf '%s\n%s\n' "# My hand-written Codex brain" "$USER_AGENTS_MARK" > "$sb/AGENTS.md"
  printf '%s\n%s\n' "$USER_CONFIG_MARK" 'sandbox_mode = "workspace-write"' > "$sb/config.toml"

  echo "=== codex: first emit into seeded target ==="
  if ! node "$REPO_ROOT/adapters/codex/emit.js" "$sb" >"$SANDBOX_ROOT/.codex-1.log" 2>&1; then
    cat "$SANDBOX_ROOT/.codex-1.log" >&2
    fail "codex: emit exited non-zero"
  fi

  grep -qF "$USER_AGENTS_MARK" "$sb/AGENTS.md" \
    || fail "codex: user AGENTS.md learning was CLOBBERED"
  grep -q "AGENTFORGE:BEGIN" "$sb/AGENTS.md" \
    || fail "codex: AgentForge managed-block marker missing from AGENTS.md"
  grep -qF "$USER_CONFIG_MARK" "$sb/config.toml" \
    || fail "codex: user config.toml was CLOBBERED"
  [ -f "$sb/config.agentforge.toml" ] \
    || fail "codex: expected sidecar config.agentforge.toml (managed config for manual merge)"

  echo "=== codex: re-emit (adoption idempotency) ==="
  if ! node "$REPO_ROOT/adapters/codex/emit.js" "$sb" >"$SANDBOX_ROOT/.codex-2.log" 2>&1; then
    cat "$SANDBOX_ROOT/.codex-2.log" >&2
    fail "codex: re-emit exited non-zero"
  fi
  grep -qF "$USER_AGENTS_MARK" "$sb/AGENTS.md" \
    || fail "codex: user learning lost on re-emit"
  grep -qF "$USER_CONFIG_MARK" "$sb/config.toml" \
    || fail "codex: user config lost on re-emit"

  echo "  codex OK"
}

test_cursor() {
  local sb="$SANDBOX_ROOT/cursor"
  seed_repo "$sb"

  # Pre-existing, hand-authored .cursorrules (the file users write by hand).
  printf '%s\n%s\n' "# My hand-written Cursor rules" "$USER_AGENTS_MARK" > "$sb/.cursorrules"

  echo "=== cursor: first emit into seeded target ==="
  if ! node "$REPO_ROOT/adapters/cursor/emit.js" "$sb" >"$SANDBOX_ROOT/.cursor-1.log" 2>&1; then
    cat "$SANDBOX_ROOT/.cursor-1.log" >&2
    fail "cursor: emit exited non-zero"
  fi

  grep -qF "$USER_AGENTS_MARK" "$sb/.cursorrules" \
    || fail "cursor: user .cursorrules content was CLOBBERED"
  grep -q "AGENTFORGE:BEGIN" "$sb/.cursorrules" \
    || fail "cursor: AgentForge managed-block marker missing from .cursorrules"

  echo "=== cursor: re-emit (adoption idempotency) ==="
  if ! node "$REPO_ROOT/adapters/cursor/emit.js" "$sb" >"$SANDBOX_ROOT/.cursor-2.log" 2>&1; then
    cat "$SANDBOX_ROOT/.cursor-2.log" >&2
    fail "cursor: re-emit exited non-zero"
  fi
  grep -qF "$USER_AGENTS_MARK" "$sb/.cursorrules" \
    || fail "cursor: user content lost on re-emit"

  echo "  cursor OK"
}

# An emit into a target that is NOT a git repo must never `git init` one. Doing
# so would sweep whatever already lives in the target (e.g. ~/.codex secrets like
# .credentials.json / auth.json) into a fresh repo via `git add -A`.
test_no_repo_init() {
  local adapter="$1"
  local sb="$SANDBOX_ROOT/noinit-$adapter"
  rm -rf "$sb"; mkdir -p "$sb"   # deliberately NOT a git repo
  # Drop a credential-shaped file the checkpoint must never stage.
  printf 'SECRET-TOKEN-DO-NOT-STAGE\n' > "$sb/.credentials.json"

  echo "=== $adapter: emit into non-git target ==="
  if ! node "$REPO_ROOT/adapters/$adapter/emit.js" "$sb" >"$SANDBOX_ROOT/.noinit-$adapter.log" 2>&1; then
    cat "$SANDBOX_ROOT/.noinit-$adapter.log" >&2
    fail "$adapter: emit into non-git target exited non-zero"
  fi
  [ ! -e "$sb/.git" ] \
    || fail "$adapter: emit created a git repo in a non-repo target (would stage secrets via git add -A)"
  grep -qF "SECRET-TOKEN-DO-NOT-STAGE" "$sb/.credentials.json" \
    || fail "$adapter: pre-existing credential file was altered"

  echo "  $adapter OK"
}

main() {
  echo "AgentForge merge-safe test"
  echo "  repo:    $REPO_ROOT"
  echo "  sandbox: $SANDBOX_ROOT"
  echo

  command -v node >/dev/null 2>&1 || fail "node not on PATH"
  command -v git  >/dev/null 2>&1 || fail "git not on PATH"

  test_codex
  test_cursor
  test_no_repo_init codex
  test_no_repo_init cursor

  echo
  echo "All adapters preserve pre-existing user content."
}

main "$@"
