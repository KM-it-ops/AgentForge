#!/usr/bin/env bash
# AgentForge pack + install test.
#
# Verifies that `npm pack` produces a tarball whose installed binstub can
# successfully drive each adapter's emit.js. Catches missing `files:` entries
# and bin/agentforge.js regressions that the source-tree round-trip would miss.
#
# Per adapter:
#   1. Install the tarball into a clean throwaway npm project.
#   2. Run `agentforge init <adapter> --dir <sandbox>` via the binstub.
#   3. Assert exit 0 and file count matches the verified-baseline counts.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/agentforge-pack-test"

declare -A EXPECTED_FILES
EXPECTED_FILES[claude-code]=13
EXPECTED_FILES[codex]=21
EXPECTED_FILES[generic]=7
EXPECTED_FILES[cursor]=23

fail() {
  echo "FAIL: $*" >&2
  exit 1
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
    local expected="${EXPECTED_FILES[$adapter]}"
    if [ "$count" != "$expected" ]; then
      fail "$adapter file count mismatch: got $count, expected $expected (a missing files: entry in package.json?)"
    fi
    echo "  $adapter: $count files OK"
  done

  echo
  echo "Pack + install + emit verified for all 4 adapters."
}

main "$@"
