#!/usr/bin/env bash
# AgentForge pack + install test.
#
# Verifies that `npm pack` produces a tarball whose installed binstub can
# successfully drive each adapter's emit.js. Catches missing `files:` entries
# and bin/agentforge.js regressions that the source-tree round-trip would miss.
#
# Per adapter:
#   1. Install the tarball into a clean throwaway npm project.
#   2. Run `agentforge doctor --json` via the installed binstub.
#   3. Run `agentforge init <adapter> --dir <sandbox>` via the binstub.
#   4. Assert exit 0 and file count matches the verified-baseline counts.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${AGENTFORGE_PACK_TEST_WORK:-${TMPDIR:-/tmp}/agentforge-pack-test-$$}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

expected_files() {
  # Counts dropped by 1 per adapter when the session-log.md seed was removed
  # from memory/feedback (logs now live in logs/, outside the brain).
  case "$1" in
    claude-code) echo 12 ;;
    codex) echo 23 ;;
    generic) echo 6 ;;
    cursor) echo 30 ;;  # +1: .cursor/mcp.json emitted from spec/mcp.yaml (context-mode)
    *) fail "no expected file count for adapter: $1" ;;
  esac
}

main() {
  command -v node >/dev/null 2>&1 || fail "node not on PATH"
  command -v npm  >/dev/null 2>&1 || fail "npm not on PATH"
  command -v git  >/dev/null 2>&1 || fail "git not on PATH"

  rm -rf "$WORK"
  mkdir -p "$WORK"

  echo "=== npm pack ==="
  pushd "$REPO_ROOT" >/dev/null
  local tarball
  tarball="$(npm pack --pack-destination "$WORK" --silent 2>/dev/null | tail -n1)"
  popd >/dev/null
  [ -f "$WORK/$tarball" ] || fail "tarball not produced at $WORK/$tarball"
  echo "  packed: $tarball"

  echo "=== npm install ==="
  local inst="$WORK/install"
  mkdir -p "$inst"
  pushd "$inst" >/dev/null
  npm init -y >/dev/null
  npm install "$WORK/$tarball" --silent --no-audit --no-fund >/dev/null
  popd >/dev/null

  local bin="$inst/node_modules/.bin/agentforge"
  [ -x "$bin" ] || fail "binstub not installed at $bin"

  # --version sanity
  local ver
  ver="$("$bin" --version)"
  echo "  installed binstub reports version: $ver"

  if ! "$bin" doctor --json >"$WORK/doctor.json" 2>&1; then
    cat "$WORK/doctor.json" >&2
    fail "installed binstub doctor failed"
  fi
  if ! grep -q '"ok": true' "$WORK/doctor.json"; then
    cat "$WORK/doctor.json" >&2
    fail "installed binstub doctor did not report ok"
  fi
  echo "  installed binstub doctor OK"

  echo "=== emit each adapter via binstub ==="
  for adapter in claude-code codex generic cursor; do
    local sandbox="$WORK/sandbox-$adapter"
    rm -rf "$sandbox"
    mkdir -p "$sandbox"
    git -C "$sandbox" init -q
    git -C "$sandbox" config user.email packtest@agentforge.local
    git -C "$sandbox" config user.name packtest

    local log="$WORK/emit-$adapter.log"
    if ! "$bin" init "$adapter" --dir "$sandbox" >"$log" 2>&1; then
      cat "$log" >&2
      fail "binstub emit failed for $adapter"
    fi

    local count
    count=$(find "$sandbox" -type f -not -path "*/.git/*" | wc -l | tr -d ' ')
    local expected
    expected="$(expected_files "$adapter")"
    if [ "$count" != "$expected" ]; then
      fail "$adapter file count mismatch: got $count, expected $expected (a missing files: entry in package.json?)"
    fi
    echo "  $adapter: $count files OK"
  done

  echo
  echo "Pack + install + doctor + emit verified for all 4 adapters."
}

main "$@"
