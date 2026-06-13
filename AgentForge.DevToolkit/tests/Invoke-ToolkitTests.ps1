[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $root 'src\AgentForge.DevToolkit\AgentForge.DevToolkit.psd1'
Import-Module $modulePath -Force

$failures = [System.Collections.Generic.List[string]]::new()

function Assert-ToolkitCondition {
    param(
        [Parameter(Mandatory)]
        [bool] $Condition,

        [Parameter(Mandatory)]
        [string] $Message
    )

    if (-not $Condition) {
        $script:failures.Add($Message)
    }
}

$npmFixture = Join-Path $root 'examples\npm-lock'
$packageBefore = Get-Content -LiteralPath (Join-Path $npmFixture 'package.json') -Raw
$scout = Invoke-NodeScout -ProjectPath $npmFixture -DryRun
$packageAfter = Get-Content -LiteralPath (Join-Path $npmFixture 'package.json') -Raw

Assert-ToolkitCondition ($scout.PackageManager.Name -eq 'npm') 'npm fixture should detect npm.'
Assert-ToolkitCondition ($scout.RecommendedNode -eq '20') 'npm fixture should recommend Node 20 from engines before fallbacks.'
Assert-ToolkitCondition ($packageBefore -eq $packageAfter) 'Invoke-NodeScout without -Pin must not modify package.json.'

$pnpmScout = Invoke-NodeScout -ProjectPath (Join-Path $root 'examples\pnpm-lock') -DryRun -SkipBuild -SkipTest
Assert-ToolkitCondition ($pnpmScout.PackageManager.Name -eq 'pnpm') 'pnpm fixture should detect pnpm.'

$yarnScout = Invoke-NodeScout -ProjectPath (Join-Path $root 'examples\yarn-lock') -DryRun -SkipBuild -SkipTest
Assert-ToolkitCondition ($yarnScout.PackageManager.Name -eq 'yarn') 'yarn fixture should detect yarn.'

$prereqs = Test-DevPrerequisites -AsObject
Assert-ToolkitCondition ($null -ne $prereqs.PowerShell.Version) 'Prerequisite check should include PowerShell version.'

$reportPath = Join-Path $root '.test-output\environment-report.md'
$report = New-ProjectEnvironmentReport -ProjectPath $npmFixture -ReportPath $reportPath
Assert-ToolkitCondition (Test-Path -LiteralPath $report.ReportPath -PathType Leaf) 'Environment report should be written.'

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "All script-based AgentForge.DevToolkit tests passed."
