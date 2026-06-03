# AgentForge bootstrap — PowerShell variant for Windows users without Git Bash.
#
# Usage:
#   .\bootstrap.ps1 [platform] [target_dir]
#
# Platforms:
#   claude-code      Install to $env:USERPROFILE\.claude\
#   codex            Install to $env:USERPROFILE\.codex\
#   generic          Install to .\agentforge\ (or supplied target_dir)
#   -Auto            Detect by looking for `claude` then `codex` then falling back to generic
#
# Examples:
#   .\bootstrap.ps1 claude-code
#   .\bootstrap.ps1 codex $env:USERPROFILE\.codex.test
#   .\bootstrap.ps1 -Auto

[CmdletBinding()]
param(
  [Parameter(Position=0)][string]$Platform,
  [Parameter(Position=1)][string]$Target,
  [switch]$Auto
)

$ErrorActionPreference = 'Stop'

# --- locate AgentForge repo root from this script's path ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir

# --- preflight: node must be available ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "node is required but not found in PATH. Install Node.js 18+ before running bootstrap."
  exit 1
}

# --- preflight: spec files must exist ---
$SpecFiles = 'identity.yaml','router.yaml','memory.yaml','telemetry.yaml','automation.yaml'
foreach ($f in $SpecFiles) {
  if (-not (Test-Path "$RepoRoot\spec\$f")) {
    Write-Error "required spec file missing: spec\$f"
    exit 1
  }
}

# --- arg handling ---
if ($Auto) { $Platform = '--auto' }
if (-not $Platform) {
  Write-Host "Usage: .\bootstrap.ps1 [claude-code|codex|generic] [target_dir]"
  Write-Host "       .\bootstrap.ps1 -Auto"
  exit 1
}

# --- platform detection ---
if ($Platform -eq '--auto') {
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    $Platform = 'claude-code'
    Write-Host "auto-detected: claude-code (found ``claude`` in PATH)"
  } elseif (Get-Command codex -ErrorAction SilentlyContinue) {
    $Platform = 'codex'
    Write-Host "auto-detected: codex (found ``codex`` in PATH)"
  } else {
    $Platform = 'generic'
    Write-Host "auto-detected: generic (no known agent CLI found)"
  }
}

# --- validate platform ---
$AdapterDir = "$RepoRoot\adapters\$Platform"
if (-not (Test-Path $AdapterDir)) {
  $available = (Get-ChildItem "$RepoRoot\adapters" -Directory | Select-Object -ExpandProperty Name) -join ', '
  Write-Error "unknown platform '$Platform'. Available adapters: $available"
  exit 1
}
if (-not (Test-Path "$AdapterDir\emit.js")) {
  Write-Error "adapter $Platform is missing emit.js — adapter incomplete."
  exit 1
}

# --- default target dir ---
if (-not $Target) {
  switch ($Platform) {
    'claude-code' { $Target = "$env:USERPROFILE\.claude" }
    'codex'       { $Target = "$env:USERPROFILE\.codex" }
    'generic'     { $Target = (Join-Path (Get-Location) 'agentforge') }
  }
}

Write-Host ""
Write-Host "AgentForge bootstrap"
Write-Host "  platform : $Platform"
Write-Host "  target   : $Target"
Write-Host "  source   : $RepoRoot"
Write-Host ""

# --- confirm before writing to non-empty target ---
if ((Test-Path $Target) -and (Get-ChildItem $Target -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
  Write-Host "Target directory exists and is non-empty."
  Write-Host "AgentForge install is idempotent — running on an existing install will reconcile to spec."
  Write-Host "Existing user-authored files (skills, memory entries) are preserved."
  Write-Host ""
  $ans = Read-Host "Proceed? [y/N]"
  if ($ans -ne 'y' -and $ans -ne 'Y') {
    Write-Host "Aborted."
    exit 0
  }
}

# --- dispatch ---
Write-Host "→ running adapter emitter..."
node "$AdapterDir\emit.js" $Target

Write-Host ""
Write-Host "✓ AgentForge installed for $Platform at $Target"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  • Read $AdapterDir\README.md for platform-specific post-install steps"
Write-Host "  • Universal lessons live at $RepoRoot\universal\docs\lessons\"
Write-Host "  • Re-run this command anytime to reconcile target with spec (idempotent)"
Write-Host ""
