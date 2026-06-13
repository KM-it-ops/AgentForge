function Invoke-NodeScout {
    [CmdletBinding()]
    param(
        [switch] $Pin,

        [switch] $SkipBuild,

        [switch] $SkipTest,

        [string] $ProjectPath = (Get-Location).Path,

        [string[]] $CandidateNodes,

        [ValidateSet('npm', 'pnpm', 'yarn')]
        [string] $PackageManager,

        [switch] $DryRun,

        [string] $ReportPath,

        [switch] $Yes,

        [switch] $VerboseReport
    )

    Set-StrictMode -Version Latest

    $resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop).Path
    $package = Read-PackageJson -ProjectPath $resolvedProjectPath
    $packageJson = $package.Data
    $managerArguments = @{
        ProjectPath = $resolvedProjectPath
        PackageJson = $packageJson
    }
    if ($PackageManager) {
        $managerArguments.Override = $PackageManager
    }
    $manager = Get-PackageManager @managerArguments
    $nodeClues = Get-ProjectNodeClues -ProjectPath $resolvedProjectPath -PackageJson $packageJson

    $candidateOrder = if ($CandidateNodes -and $CandidateNodes.Count -gt 0) {
        @($CandidateNodes | Where-Object { $_ } | Select-Object -Unique)
    } else {
        @($nodeClues.CandidateNodes)
    }

    if (-not $candidateOrder -or $candidateOrder.Count -eq 0) {
        $candidateOrder = @('20', '22', '18')
    }

    Write-ToolkitLog "Project: $resolvedProjectPath"
    Write-ToolkitLog "Package manager: $($manager.Name) ($($manager.Source))"
    Write-ToolkitLog "Candidate Node order: $($candidateOrder -join ', ')"

    $candidateResults = [System.Collections.Generic.List[object]]::new()
    $recommended = $null

    foreach ($candidate in $candidateOrder) {
        Write-ToolkitLog "Testing Node $candidate through Volta"
        $result = Test-NodeCandidate `
            -ProjectPath $resolvedProjectPath `
            -NodeVersion $candidate `
            -PackageManager $manager.Name `
            -PackageJson $packageJson `
            -SkipBuild:$SkipBuild `
            -SkipTest:$SkipTest `
            -DryRun:$DryRun

        $candidateResults.Add($result)
        if ($result.Success) {
            $recommended = $candidate
            break
        }
    }

    $pinResult = $null
    if ($recommended) {
        Write-ToolkitLog "Recommendation: node@$recommended" -Level Success
        if ($Pin) {
            if (-not $Yes) {
                $confirmation = Read-Host "Run 'volta pin node@$recommended' in $resolvedProjectPath? Type YES to continue"
                if ($confirmation -ne 'YES') {
                    Write-ToolkitLog "Pin skipped by user confirmation." -Level Warning
                } else {
                    $pinResult = Invoke-LoggedCommand -FilePath 'volta' -ArgumentList @('pin', "node@$recommended") -WorkingDirectory $resolvedProjectPath -DryRun:$DryRun
                }
            } else {
                $pinResult = Invoke-LoggedCommand -FilePath 'volta' -ArgumentList @('pin', "node@$recommended") -WorkingDirectory $resolvedProjectPath -DryRun:$DryRun
            }
        } else {
            Write-ToolkitLog "Pin command, when ready: volta pin node@$recommended"
        }
    } else {
        Write-ToolkitLog "No candidate completed successfully. Review command output and run Repair-NodeProject for remediation advice." -Level Warning
    }

    $summary = [pscustomobject]@{
        ProjectPath = $resolvedProjectPath
        PackageManager = $manager
        NodeClues = $nodeClues
        CandidateNodes = @($candidateOrder)
        CandidateResults = @($candidateResults)
        RecommendedNode = $recommended
        PinRequested = [bool]$Pin
        PinCommand = if ($recommended) { "volta pin node@$recommended" } else { $null }
        PinResult = $pinResult
        DryRun = [bool]$DryRun
        Warnings = @(
            if (-not $recommended) { 'No working candidate found.' }
            if ($nodeClues.NpmrcSignals.Count -gt 0) { '.npmrc contains engine-related settings; verify they match the selected Node version.' }
        )
    }

    if ($ReportPath) {
        New-ProjectEnvironmentReport -ProjectPath $resolvedProjectPath -ReportPath $ReportPath -ScoutResult $summary -VerboseReport:$VerboseReport | Out-Null
        Write-ToolkitLog "Report written to $ReportPath"
    }

    $summary
}
