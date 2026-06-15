#!/usr/bin/env bash
# AgentForge — MCP spec module (spec/mcp.yaml) emit test.
#
# Verifies the OPTIONAL context-mode MCP registration module:
#   A. ABSENT spec  -> no MCP artifacts, round-trip idempotent (byte-identical to baseline).
#   B. EMPTY spec   -> identical to absent.
#   C. PRESENT spec -> correct per-adapter artifact + idempotent + plugin-managed
#                      servers (register:false) are NOT registered.
#   D. MERGE-SAFE   -> a user's existing .cursor/mcp.json server survives emit.
#
# Drives loadOptionalMcp() via the AGENTFORGE_MCP_SPEC env override so the repo's
# own spec/mcp.yaml is irrelevant to these assertions.
#
# Exit 0 on success, non-zero on any failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_ROOT="${SANDBOX_ROOT:-${TMPDIR:-/tmp}/agentforge-mcp-test}"
FIX="$REPO_ROOT/scripts/fixtures/mcp"
PRESENT="$FIX/present.yaml"
EMPTY="$FIX/empty.yaml"
ABSENT="$SANDBOX_ROOT/__nonexistent__.yaml"   # guaranteed-missing path

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "  $*"; }

setup_sandbox() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email mcptest@agentforge.local
  git -C "$dir" config user.name mcptest
}

# emit_twice <adapter> <sandbox> <mcp_spec_path>
# Runs emit twice, asserts second emit reports files_changed: 0 and a clean tree.
emit_twice() {
  local adapter="$1" sandbox="$2" spec="$3"
  local emit="$REPO_ROOT/adapters/$adapter/emit.js"
  [ -f "$emit" ] || fail "$adapter: emit.js not found"
  local log1="$SANDBOX_ROOT/.$adapter-1.log" log2="$SANDBOX_ROOT/.$adapter-2.log"

  if ! AGENTFORGE_MCP_SPEC="$spec" node "$emit" "$sandbox" >"$log1" 2>&1; then
    cat "$log1" >&2; fail "$adapter: first emit exited non-zero"
  fi
  if ! AGENTFORGE_MCP_SPEC="$spec" node "$emit" "$sandbox" >"$log2" 2>&1; then
    cat "$log2" >&2; fail "$adapter: second emit exited non-zero"
  fi
  grep -q '"files_changed": 0' "$log2" || { cat "$log2" >&2; fail "$adapter: second emit files_changed != 0 (spec=$spec)"; }
  local dirty; dirty="$(git -C "$sandbox" status --porcelain)"
  [ -z "$dirty" ] || { echo "$dirty" >&2; fail "$adapter: tree dirty after second emit (spec=$spec)"; }
}

assert_contains()  { grep -qF -- "$2" "$1" || fail "$3 (expected '$2' in $1)"; }
assert_absent_str(){ if [ -f "$1" ]; then grep -qF -- "$2" "$1" && fail "$3 (unexpected '$2' in $1)"; fi; true; }
assert_no_file()   { [ ! -e "$1" ] || fail "$2 (file should not exist: $1)"; }
assert_file()      { [ -f "$1" ] || fail "$2 (file should exist: $1)"; }

echo "AgentForge MCP-module emit test"
echo "  repo:    $REPO_ROOT"
echo "  sandbox: $SANDBOX_ROOT"
echo

# ===========================================================================
echo "=== A/C: codex ==="
S="$SANDBOX_ROOT/codex-absent"; setup_sandbox "$S"; emit_twice codex "$S" "$ABSENT"
assert_absent_str "$S/config.toml" "[mcp_servers" "codex absent: no mcp_servers table"
note "absent OK"
S="$SANDBOX_ROOT/codex-empty"; setup_sandbox "$S"; emit_twice codex "$S" "$EMPTY"
assert_absent_str "$S/config.toml" "[mcp_servers" "codex empty: no mcp_servers table"
note "empty OK"
S="$SANDBOX_ROOT/codex-present"; setup_sandbox "$S"; emit_twice codex "$S" "$PRESENT"
assert_contains "$S/config.toml" "[mcp_servers.context-mode]" "codex present: context-mode table"
assert_contains "$S/config.toml" "[mcp_servers.demo-server]" "codex present: demo-server table"
assert_contains "$S/config.toml" "CONTEXT_MODE_PLATFORM" "codex present: env key"
note "present OK"

echo "=== A/C: cursor ==="
S="$SANDBOX_ROOT/cursor-absent"; setup_sandbox "$S"; emit_twice cursor "$S" "$ABSENT"
assert_no_file "$S/.cursor/mcp.json" "cursor absent: no mcp.json"
note "absent OK"
S="$SANDBOX_ROOT/cursor-present"; setup_sandbox "$S"; emit_twice cursor "$S" "$PRESENT"
assert_file "$S/.cursor/mcp.json" "cursor present: mcp.json exists"
node -e 'const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!o.mcpServers||!o.mcpServers["context-mode"]||o.mcpServers["context-mode"].command!=="npx"||!o.mcpServers["demo-server"]) process.exit(1)' "$S/.cursor/mcp.json" || fail "cursor present: mcp.json shape"
note "present OK"

echo "=== A/C: claude-code ==="
S="$SANDBOX_ROOT/cc-absent"; setup_sandbox "$S"; emit_twice claude-code "$S" "$ABSENT"
assert_absent_str "$S/settings.json" "context-mode" "claude absent: no context-mode"
assert_absent_str "$S/settings.json" "mcpServers" "claude absent: no mcpServers"
note "absent OK"
S="$SANDBOX_ROOT/cc-present"; setup_sandbox "$S"; emit_twice claude-code "$S" "$PRESENT"
# context-mode is plugin-managed -> MUST NOT be registered (double-registration guard)
assert_absent_str "$S/settings.json" "context-mode" "claude present: context-mode must NOT be registered"
assert_contains "$S/settings.json" "demo-server" "claude present: demo-server registered"
note "present OK (no double-registration)"

echo "=== A/C: generic ==="
S="$SANDBOX_ROOT/generic-absent"; setup_sandbox "$S"; emit_twice generic "$S" "$ABSENT"
assert_absent_str "$S/AGENTS.md" "## MCP Servers" "generic absent: no MCP section"
note "absent OK"
S="$SANDBOX_ROOT/generic-present"; setup_sandbox "$S"; emit_twice generic "$S" "$PRESENT"
assert_contains "$S/AGENTS.md" "## MCP Servers" "generic present: MCP section"
assert_contains "$S/AGENTS.md" "context-mode" "generic present: documents context-mode"
note "present OK"

# ===========================================================================
echo "=== D: cursor merge-safety ==="
S="$SANDBOX_ROOT/cursor-merge"; setup_sandbox "$S"
mkdir -p "$S/.cursor"
cp "$FIX/seed-cursor-mcp.json" "$S/.cursor/mcp.json"
emit_twice cursor "$S" "$PRESENT"
node -e 'const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!o.mcpServers["user-existing"]||!o.mcpServers["context-mode"]) process.exit(1)' "$S/.cursor/mcp.json" || fail "cursor merge: user server must survive + context-mode added"
note "merge-safe OK"

echo
echo "All MCP-module assertions passed."
