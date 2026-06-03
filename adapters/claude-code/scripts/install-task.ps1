# install-task.ps1 — Register the AgentForge weekly auto-prune task on Windows.
# Schedule: Fridays 3:00 PM local. Hard timeout: 15 minutes.
# Reversible: -Unregister flag removes the task.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -AgentHome "C:\Users\alkur\.claude"
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -AgentHome "C:\Users\alkur\.claude" -Unregister

param(
  [Parameter(Mandatory=$true)] [string]$AgentHome,
  [string]$TaskName = "AgentForge-AutoPruneWeekly",
  [switch]$Unregister
)

if ($Unregister) {
  try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Output "Unregistered task: $TaskName"
  } catch {
    Write-Output "Task $TaskName not found or already removed."
  }
  exit 0
}

if (-not (Test-Path $AgentHome)) {
  Write-Error "AgentHome path does not exist: $AgentHome"
  exit 1
}

$scriptPath = Join-Path $AgentHome "hooks\scripts\auto-prune-weekly.sh"
if (-not (Test-Path $scriptPath)) {
  Write-Error "auto-prune-weekly.sh not found at $scriptPath. Run emit.js first."
  exit 1
}

# Find bash.exe (Git Bash preferred)
$bashExe = $null
$candidates = @(
  "C:\Program Files\Git\bin\bash.exe",
  "C:\Program Files (x86)\Git\bin\bash.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)
foreach ($c in $candidates) {
  if (Test-Path $c) { $bashExe = $c; break }
}
if (-not $bashExe) {
  Write-Error "bash.exe (Git Bash) not found. Install Git for Windows."
  exit 1
}

# POSIX-style path for bash
$posixScript = $scriptPath -replace '\\','/' -replace '^([A-Z]):','/$1' -replace '/','/'
# Normalize: C:/Users/... -> /c/Users/...
if ($posixScript -match '^([A-Za-z]):/(.*)$') {
  $drive = $Matches[1].ToLower()
  $rest = $Matches[2]
  $posixScript = "/$drive/$rest"
}

$action = New-ScheduledTaskAction -Execute $bashExe -Argument "`"$posixScript`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At "3:00PM"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

Register-ScheduledTask -TaskName $TaskName `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "AgentForge weekly self-improvement loop (auto-prune dead skills, propose router updates)." | Out-Null

Write-Output "Registered task: $TaskName"
Write-Output "  Schedule: Fridays 3:00 PM (local time)"
Write-Output "  Command:  $bashExe $posixScript"
Write-Output "  Timeout:  15 minutes"
