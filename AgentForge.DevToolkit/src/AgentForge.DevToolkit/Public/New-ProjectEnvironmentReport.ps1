function New-ProjectEnvironmentReport {
    [CmdletBinding()]
    param(
        [string] $ProjectPath = (Get-Location).Path,

        [Parameter(Mandatory)]
        [string] $ReportPath,

        [object] $ScoutResult,

        [switch] $VerboseReport
    )

    Set-StrictMode -Version Latest

    $resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop).Path
    $package = Read-PackageJson -ProjectPath $resolvedProjectPath
    $packageJson = $package.Data
    $manager = Get-PackageManager -ProjectPath $resolvedProjectPath -PackageJson $packageJson
    $nodeClues = Get-ProjectNodeClues -ProjectPath $resolvedProjectPath -PackageJson $packageJson
    $prereqs = Test-DevPrerequisites -AsObject

    $scripts = if ($packageJson.ContainsKey('scripts') -and $packageJson.scripts -is [hashtable]) {
        $packageJson.scripts.Keys | Sort-Object
    } else {
        @()
    }

    $lockfiles = @('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock') |
        Where-Object { Test-Path -LiteralPath (Join-Path $resolvedProjectPath $_) -PathType Leaf }

    $engines = if ($packageJson.ContainsKey('engines')) { $packageJson.engines | ConvertTo-Json -Compress -Depth 10 } else { '{}' }
    $devEngines = if ($packageJson.ContainsKey('devEngines')) { $packageJson.devEngines | ConvertTo-Json -Compress -Depth 10 } else { '{}' }
    $packageManagerField = if ($packageJson.ContainsKey('packageManager')) { [string]$packageJson.packageManager } else { '' }
    $recommended = if ($ScoutResult -and $ScoutResult.PSObject.Properties.Name -contains 'RecommendedNode') { $ScoutResult.RecommendedNode } else { ($nodeClues.CandidateNodes | Select-Object -First 1) }

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('# Project Environment Report')
    $lines.Add('')
    $lines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
    $lines.Add('')
    $lines.Add('## System')
    $lines.Add('')
    $lines.Add("- OS: $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)")
    $lines.Add("- PowerShell: $($PSVersionTable.PSVersion)")
    $lines.Add("- Volta: $($prereqs.Tools.Volta.Version)")
    $lines.Add("- Git: $($prereqs.Tools.Git.Version)")
    $lines.Add("- Node: $($prereqs.Tools.Node.Version)")
    $lines.Add("- npm: $($prereqs.Tools.Npm.Version)")
    $lines.Add("- pnpm: $($prereqs.Tools.Pnpm.Version)")
    $lines.Add("- yarn: $($prereqs.Tools.Yarn.Version)")
    $lines.Add("- Python: $($prereqs.Tools.Python.Version)")
    $lines.Add('')
    $lines.Add('## Project')
    $lines.Add('')
    $lines.Add("- Path: $resolvedProjectPath")
    $lines.Add("- Package manager: $($manager.Name) ($($manager.Source))")
    $lines.Add("- packageManager: $packageManagerField")
    $lines.Add("- Lockfiles: $(if ($lockfiles) { $lockfiles -join ', ' } else { 'none' })")
    $lines.Add("- Scripts: $(if ($scripts) { $scripts -join ', ' } else { 'none' })")
    $lines.Add("- engines: $engines")
    $lines.Add("- devEngines: $devEngines")
    $lines.Add('')
    $lines.Add('## Node Clues')
    $lines.Add('')
    foreach ($clue in $nodeClues.Clues) {
        $lines.Add("- $($clue.Source): $($clue.RawValue) => $($clue.Candidate)")
    }
    if ($nodeClues.Clues.Count -eq 0) {
        $lines.Add('- none')
    }
    $lines.Add('')
    $lines.Add('## Recommendation')
    $lines.Add('')
    $lines.Add("- Recommended pin: $(if ($recommended) { "node@$recommended" } else { 'none' })")
    $lines.Add("- Pin command: $(if ($recommended) { "volta pin node@$recommended" } else { 'none' })")
    $lines.Add('')
    $lines.Add('## Risks And Warnings')
    $lines.Add('')
    if ($nodeClues.NpmrcSignals.Count -gt 0) {
        foreach ($signal in $nodeClues.NpmrcSignals) {
            $lines.Add("- .npmrc: $signal")
        }
    } else {
        $lines.Add('- No engine-related .npmrc signals detected.')
    }

    if ($ScoutResult -and $ScoutResult.PSObject.Properties.Name -contains 'CandidateResults') {
        $lines.Add('')
        $lines.Add('## Test Results')
        $lines.Add('')
        foreach ($candidate in $ScoutResult.CandidateResults) {
            $lines.Add("- Node $($candidate.NodeVersion): $(if ($candidate.Success) { 'success' } else { 'failed' })")
            if ($VerboseReport) {
                foreach ($command in $candidate.Commands) {
                    $lines.Add("  - `$($command.Command)` => exit $($command.ExitCode)")
                }
            }
        }
    }

    $resolvedReportPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
    $reportDirectory = Split-Path -Parent $resolvedReportPath
    if ($reportDirectory -and -not (Test-Path -LiteralPath $reportDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    }

    Set-Content -LiteralPath $resolvedReportPath -Value $lines -Encoding utf8

    [pscustomobject]@{
        ReportPath = $resolvedReportPath
        ProjectPath = $resolvedProjectPath
        RecommendedNode = $recommended
    }
}
