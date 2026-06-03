#!/usr/bin/env bash
# install-shell-trap.sh — append a session-end trap to the user's shell rc.
# When the Codex CLI process exits, the trap calls log-session-end.sh.
#
# Idempotent: checks for the AgentForge marker before appending.
# Targets ~/.zshrc if SHELL ends in zsh, else ~/.bashrc.

set -u

AGENT_HOME="$(cd "$(dirname "$0")/.." && pwd)"
TRAP_SCRIPT="$AGENT_HOME/scripts/log-session-end.sh"
MARKER="# >>> AgentForge-codex session-end trap >>>"
END_MARKER="# <<< AgentForge-codex session-end trap <<<"

case "${SHELL:-}" in
  *zsh) RC="$HOME/.zshrc" ;;
  *) RC="$HOME/.bashrc" ;;
esac

if [ -f "$RC" ] && grep -Fq "$MARKER" "$RC"; then
  echo "[install-shell-trap] trap already installed in $RC — leaving unchanged."
  exit 0
fi

# The function wraps `codex` so the trap fires only on Codex exit, not every
# shell exit. Users invoking codex via the wrapper get session-end logging;
# users invoking the bare binary do not (documented gap).
{
  printf '\n%s\n' "$MARKER"
  printf '%s\n' "codex() {"
  printf '%s\n' "  command codex \"\$@\""
  printf '%s\n' "  local rc=\$?"
  printf '%s\n' "  \"$TRAP_SCRIPT\" >/dev/null 2>&1 || true"
  printf '%s\n' "  return \$rc"
  printf '%s\n' "}"
  printf '%s\n' "$END_MARKER"
} >> "$RC"

echo "[install-shell-trap] appended trap to $RC. Open a new shell to activate."
exit 0
