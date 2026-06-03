#!/usr/bin/env bash
#
# AgentForge init — thin wrapper around bootstrap.sh for explicit platform selection.
#
# Usage:
#   ./init.sh <platform> [target_dir]
#
# Platforms: claude-code | codex | generic
#
# Examples:
#   ./init.sh claude-code
#   ./init.sh codex ~/.codex.test/
#   ./init.sh generic /path/to/project/agentforge/

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <claude-code|codex|generic> [target_dir]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/bootstrap.sh" "$@"
