param(
  [string]$OutputPath = ".test-output/release-evidence-current.json",
  [string]$NpmPath = "C:\Program Files\nodejs\npm.cmd",
  [string]$NodeJsPath = "C:\Program Files\nodejs",
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

function Invoke-Captured {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][scriptblock]$Script
  )

  $stdout = New-TemporaryFile
  $stderr = New-TemporaryFile
  try {
    & $Script *> $stdout 2> $stderr
    $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
    [ordered]@{
      command = $Command
      exitCode = $exitCode
      ok = $exitCode -eq 0
      stdout = (Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue)
      stderr = (Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)
    }
  } catch {
    [ordered]@{
      command = $Command
      exitCode = 1
      ok = $false
      stdout = (Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue)
      stderr = $_.Exception.Message
    }
  } finally {
    Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
  }
}

function Get-JsonOrText {
  param([string]$Text)
  try {
    return $Text | ConvertFrom-Json
  } catch {
    return $Text
  }
}

$repoRoot = (Resolve-Path ".").Path
$outputFullPath = Join-Path $repoRoot $OutputPath
$outputDir = Split-Path -Parent $outputFullPath
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

if (Test-Path -LiteralPath $NpmPath) {
  $env:PATH = "$NodeJsPath;$env:PATH"
}
$npmCache = Join-Path $repoRoot ".test-output/npm-cache"
New-Item -ItemType Directory -Path $npmCache -Force | Out-Null
$env:npm_config_cache = $npmCache

$gitHead = Invoke-Captured "git rev-parse HEAD" { git rev-parse HEAD }
$gitOriginMain = Invoke-Captured "git rev-parse origin/main" { git rev-parse origin/main }
$gitRemote = Invoke-Captured "git remote -v" { git remote -v }
$gitLsRemote = Invoke-Captured "git -c credential.helper= -c core.askPass= ls-remote origin refs/heads/main" {
  git -c credential.helper= -c core.askPass= ls-remote origin refs/heads/main
}

$doctor = Invoke-Captured "node bin/agentforge.js doctor --json" { node bin/agentforge.js doctor --json }
$packDryRun = Invoke-Captured "$NpmPath pack --dry-run --json" { & $NpmPath pack --dry-run --json }
$npmView = Invoke-Captured "$NpmPath view @kmitops/agentforge version name dist-tags.latest --json" {
  & $NpmPath view @kmitops/agentforge version name dist-tags.latest --json
}

$verify = if ($SkipVerify) {
  [ordered]@{
    command = "$NpmPath run verify"
    exitCode = $null
    ok = $null
    skipped = $true
    stdout = ""
    stderr = ""
  }
} else {
  Invoke-Captured "$NpmPath run verify" { & $NpmPath run verify }
}

$githubCommits = Invoke-Captured "GET https://api.github.com/repos/KM-it-ops/AgentForge/commits/main" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "https://api.github.com/repos/KM-it-ops/AgentForge/commits/main" -Headers @{ "User-Agent" = "AgentForge-Release-Readiness" }
  $response.StatusCode
  $response.Content
}
$githubActions = Invoke-Captured "GET https://api.github.com/repos/KM-it-ops/AgentForge/actions/runs?branch=main&per_page=1" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "https://api.github.com/repos/KM-it-ops/AgentForge/actions/runs?branch=main&per_page=1" -Headers @{ "User-Agent" = "AgentForge-Release-Readiness" }
  $response.StatusCode
  $response.Content
}

$pack = Get-JsonOrText $packDryRun.stdout
$packFiles = @()
$packItems = @($pack)
if ($packItems.Count -gt 0 -and $packItems[0].files) {
  $packFiles = @($packItems[0].files | ForEach-Object { $_.path })
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  repoRoot = $repoRoot
  noCredentialBoundary = "This script does not login, publish, tag, push, create GitHub releases, or pass credentials."
  expectedPackage = "@kmitops/agentforge"
  expectedVersion = "0.3.1"
  checks = [ordered]@{
    gitRemote = $gitRemote
    gitHead = $gitHead
    gitOriginMain = $gitOriginMain
    gitLsRemote = $gitLsRemote
    doctor = $doctor
    npmPackDryRun = $packDryRun
    npmVerify = $verify
    npmViewAgentforge = $npmView
    githubCommitsMain = $githubCommits
    githubActionsMain = $githubActions
  }
  summary = [ordered]@{
    localHead = $gitHead.stdout.Trim()
    localOriginMain = $gitOriginMain.stdout.Trim()
    doctorOk = $doctor.ok
    packDryRunOk = $packDryRun.ok
    verifyOk = $verify.ok
    npmPackageVisible = $npmView.ok
    publicGithubCommitsVisible = $githubCommits.ok
    publicGithubActionsVisible = $githubActions.ok
    packIncludesChangelog = $packFiles -contains "CHANGELOG.md"
    registryPackage = "@kmitops/agentforge"
    registryLatestExpected = "0.3.1"
    packIncludesArchivedReleasePacket = $packFiles -contains "docs/releases/v0.2-readiness.md"
    remainingOwnerGate = "Fresh GitHub remote/Actions evidence and owner approval are required before publishing any future version."
  }
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputFullPath -Encoding UTF8
Write-Output $outputFullPath
