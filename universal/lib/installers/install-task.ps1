# universal/lib/installers/install-task.ps1
#
# Adapter-agnostic Windows Task Scheduler installer for AgentForge.
#
# Invoked by the sibling install-cron.sh on Windows hosts, or directly:
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 `
#     -TaskName "AgentForge-AutoPruneWeekly" `
#     -Script "C:\Users\me\.codex\scripts\auto-prune-weekly.sh" `
#     -Schedule "0 15 * * 5"
#
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 `
#     -TaskName "AgentForge-AutoPruneWeekly" -Unregister
#
# Schedule is a 5-field cron expression. This installer supports the subset
# AgentForge schedules actually use:
#   minute  hour  *  *  dow            -> Weekly trigger
#   minute  hour  *  *  *              -> Daily trigger
#   minute  hour  dom *  *             -> Monthly trigger (single day)
# Anything else falls back to Daily and prints a warning.
#
# The task runs as the invoking user at Limited run-level (no elevation
# required for execution; only registration may require elevation depending
# on Windows policy).

param(
  [Parameter(Mandatory=$true)] [string]$TaskName,
  [string]$Script,
  [string]$Schedule,
  [int]$TimeoutMinutes = 15,
  [string]$Description = "",
  [switch]$Unregister
)

if ($Unregister) {
  try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Output "Unregistered task: $TaskName"
  } catch {
    Write-Output "Task '$TaskName' not found or already removed."
  }
  exit 0
}

if (-not $Script)   { Write-Error "-Script is required on install"; exit 2 }
if (-not $Schedule) { Write-Error "-Schedule is required on install"; exit 2 }

if (-not (Test-Path $Script)) {
  Write-Error "Script path does not exist: $Script"
  exit 1
}

# Reject UNC paths up front. The drive-letter regex below cannot translate
# \\server\share\... into a POSIX path Git Bash understands; we'd silently
# produce a malformed argument instead of failing loudly.
if ($Script -like '\\\\*') {
  Write-Error "UNC paths are not supported (got: $Script). Map the share to a drive letter first."
  exit 2
}

# Find bash.exe (Git Bash preferred).
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
  Write-Error "bash.exe (Git Bash) not found on PATH. Install Git for Windows from https://git-scm.com/."
  exit 1
}

# Convert Script path to POSIX form for bash (C:\foo\bar -> /c/foo/bar).
$posixScript = $Script -replace '\\','/'
if ($posixScript -match '^([A-Za-z]):/(.*)$') {
  $drive = $Matches[1].ToLower()
  $rest = $Matches[2]
  $posixScript = "/$drive/$rest"
}

# Translate the cron subset we support into ScheduledTaskTrigger parameters.
# Cron: minute hour day-of-month month day-of-week
$cronFields = $Schedule -split '\s+'
if ($cronFields.Count -lt 5) {
  Write-Error "Invalid cron expression (need 5 fields): '$Schedule'"
  exit 2
}
$minute = $cronFields[0]
$hour   = $cronFields[1]
$dom    = $cronFields[2]
# $month is parsed but not used — AgentForge schedules are weekly/daily.
$dow    = $cronFields[4]

# Build the At-time string (24h -> 12h).
try {
  $atDate = Get-Date -Hour $hour -Minute $minute -Second 0
  $atString = $atDate.ToString("h:mmtt")
} catch {
  Write-Error "Invalid hour/minute in cron expression: '$hour' / '$minute'"
  exit 2
}

# Map dow numbers (0-6, Sunday=0) to PowerShell day names.
$dowMap = @{
  "0" = "Sunday";  "7" = "Sunday"
  "1" = "Monday"
  "2" = "Tuesday"
  "3" = "Wednesday"
  "4" = "Thursday"
  "5" = "Friday"
  "6" = "Saturday"
  "MON" = "Monday";  "TUE" = "Tuesday"; "WED" = "Wednesday"; "THU" = "Thursday"
  "FRI" = "Friday";  "SAT" = "Saturday"; "SUN" = "Sunday"
}

if ($dow -ne "*" -and $dowMap.ContainsKey($dow.ToUpper())) {
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dowMap[$dow.ToUpper()] -At $atString
} elseif ($dow -ne "*" -and ($dow -match '[,/-]')) {
  # Multi-day patterns (5,6 or 1-5 or */2) would silently fall through to
  # Daily under the old logic — wrong, and the user wouldn't notice until
  # the task fired on the wrong day. Refuse explicitly.
  Write-Error "Unsupported day-of-week expression: '$dow'. The Windows backend only handles a single day (0-7 or MON..SUN). Register manually in Task Scheduler for multi-day schedules."
  exit 2
} elseif ($dom -ne "*") {
  # Monthly on a single day-of-month.
  $trigger = New-ScheduledTaskTrigger -Daily -At $atString
  Write-Warning "Monthly cron not natively supported; scheduling as Daily at $atString. Adjust manually in Task Scheduler if needed."
} else {
  $trigger = New-ScheduledTaskTrigger -Daily -At $atString
}

$action = New-ScheduledTaskAction -Execute $bashExe -Argument "`"$posixScript`""

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes $TimeoutMinutes) `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

# Replace any prior registration with the same name (idempotent install).
try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

if (-not $Description) {
  $Description = "AgentForge scheduled task: $TaskName"
}

Register-ScheduledTask -TaskName $TaskName `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description $Description | Out-Null

Write-Output "Registered task: $TaskName"
Write-Output "  Schedule: $Schedule  (translated: $atString)"
Write-Output "  Command:  $bashExe `"$posixScript`""
Write-Output "  Timeout:  $TimeoutMinutes minutes"
