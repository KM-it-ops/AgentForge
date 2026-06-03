#!/usr/bin/env bash
#
# AgentForge bootstrap — detects platform and dispatches to the right adapter.
#
# Usage:
#   ./bootstrap.sh [platform] [target_dir]
#
# Platforms:
#   claude-code      Install to ~/.claude/
#   codex            Install to ~/.codex/
#   generic          Install to <cwd>/agentforge/ (or supplied target_dir)
#   --auto           Detect by looking for `claude` then `codex` then falling back to generic
#
# Examples:
#   ./bootstrap.sh claude-code
#   ./bootstrap.sh codex ~/.codex.test/
#   ./bootstrap.sh --auto
#   ./bootstrap.sh generic /path/to/my/project/agentforge/
#
set -euo pipefail

# --- locate the AgentForge repo root from this script's path ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- preflight: node must be available ---
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required but not found in PATH." >&2
  echo "Install Node.js 18+ before running bootstrap." >&2
  exit 1
fi

# --- preflight: spec must exist and be at the expected schema version ---
if [ ! -d "$REPO_ROOT/spec" ]; then
  echo "ERROR: spec/ directory missing at $REPO_ROOT/spec" >&2
  exit 1
fi
for f in identity.yaml router.yaml memory.yaml telemetry.yaml automation.yaml; do
  if [ ! -f "$REPO_ROOT/spec/$f" ]; then
    echo "ERROR: required spec file missing: spec/$f" >&2
    exit 1
  fi
done

# --- arg parsing ---
PLATFORM="${1:-}"
TARGET="${2:-}"

if [ -z "$PLATFORM" ]; then
  echo "Usage: $0 [claude-code|codex|generic|--auto] [target_dir]"
  echo ""
  echo "Try: $0 --auto"
  exit 1
fi

# --- platform detection if --auto ---
if [ "$PLATFORM" = "--auto" ]; then
  if command -v claude >/dev/null 2>&1; then
    PLATFORM="claude-code"
    echo "auto-detected: claude-code (found \`claude\` in PATH)"
  elif command -v codex >/dev/null 2>&1; then
    PLATFORM="codex"
    echo "auto-detected: codex (found \`codex\` in PATH)"
  else
    PLATFORM="generic"
    echo "auto-detected: generic (no known agent CLI found)"
  fi
fi

# --- validate platform ---
ADAPTER_DIR="$REPO_ROOT/adapters/$PLATFORM"
if [ ! -d "$ADAPTER_DIR" ]; then
  echo "ERROR: unknown platform '$PLATFORM'." >&2
  echo "Available adapters: $(ls "$REPO_ROOT/adapters" | tr '\n' ' ')" >&2
  exit 1
fi

if [ ! -f "$ADAPTER_DIR/emit.js" ]; then
  echo "ERROR: adapter $PLATFORM is missing emit.js — adapter incomplete." >&2
  exit 1
fi

# --- compute default target dir if not supplied ---
if [ -z "$TARGET" ]; then
  case "$PLATFORM" in
    claude-code) TARGET="$HOME/.claude" ;;
    codex)       TARGET="$HOME/.codex" ;;
    generic)     TARGET="$(pwd)/agentforge" ;;
  esac
fi

echo ""
echo "AgentForge bootstrap"
echo "  platform : $PLATFORM"
echo "  target   : $TARGET"
echo "  source   : $REPO_ROOT"
echo ""

# --- confirm before writing if target already exists and is non-empty ---
if [ -d "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "Target directory exists and is non-empty."
  echo "AgentForge install is idempotent — running on an existing install will reconcile to spec."
  echo "Existing user-authored files (skills, memory entries) are preserved."
  echo ""
  read -r -p "Proceed? [y/N] " ans
  if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# --- dispatch to adapter ---
echo "→ running adapter emitter..."
node "$ADAPTER_DIR/emit.js" "$TARGET"

# --- post-install summary ---
echo ""
echo "✓ AgentForge installed for $PLATFORM at $TARGET"
echo ""
echo "Next steps:"
echo "  • Read $ADAPTER_DIR/README.md for platform-specific post-install steps"
echo "  • Universal lessons live at $REPO_ROOT/universal/docs/lessons/"
echo "  • Re-run this command anytime to reconcile target with spec (idempotent)"
echo ""
