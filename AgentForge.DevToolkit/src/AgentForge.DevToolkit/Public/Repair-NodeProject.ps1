function Repair-NodeProject {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string] $ProjectPath = (Get-Location).Path,

        [string] $ErrorLogPath,

        [switch] $CleanInstallState,

        [switch] $Yes
    )

    Set-StrictMode -Version Latest

    $resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop).Path
    $package = Read-PackageJson -ProjectPath $resolvedProjectPath
    $manager = Get-PackageManager -ProjectPath $resolvedProjectPath -PackageJson $package.Data
    $logText = ''

    if ($ErrorLogPath) {
        $resolvedLog = Resolve-Path -LiteralPath $ErrorLogPath -ErrorAction Stop
        $logText = Get-Content -LiteralPath $resolvedLog.Path -Raw -ErrorAction Stop
    } else {
        $candidateLogs = @('npm-debug.log', 'yarn-error.log', 'pnpm-debug.log') |
            ForEach-Object { Join-Path $resolvedProjectPath $_ } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
        if ($candidateLogs) {
            $logText = Get-Content -LiteralPath $candidateLogs[0] -Raw -ErrorAction Stop
        }
    }

    $findings = [System.Collections.Generic.List[object]]::new()
    $patterns = @(
        @{ Name = 'node-gyp'; Pattern = 'node-gyp|gyp ERR'; Advice = 'Install Python and Visual Studio Build Tools with C++ workload, then retry the install.' },
        @{ Name = 'MSBuild'; Pattern = 'MSB\d+|msbuild|Visual Studio'; Advice = 'Verify Visual Studio Build Tools C++ components are installed.' },
        @{ Name = 'Python missing'; Pattern = 'Python is not set|Can''t find Python|python.*not found'; Advice = 'Install Python and ensure python is on PATH.' },
        @{ Name = 'EBADENGINE'; Pattern = 'EBADENGINE|Unsupported engine'; Advice = 'Run Invoke-NodeScout and choose a Node version satisfying package engines.' },
        @{ Name = 'Lockfile mismatch'; Pattern = 'package-lock.*out of sync|frozen-lockfile|lockfile.*not.*up.to.date|immutable'; Advice = 'Regenerate the lockfile only if dependency changes are intentional.' },
        @{ Name = 'Missing package manager'; Pattern = 'pnpm.*not recognized|yarn.*not recognized|command not found.*pnpm|command not found.*yarn'; Advice = 'Install or activate the package manager declared by the project.' }
    )

    foreach ($entry in $patterns) {
        if ($logText -match $entry.Pattern) {
            $findings.Add([pscustomobject]@{
                Pattern = $entry.Name
                Advice = $entry.Advice
            })
        }
    }

    if ($findings.Count -eq 0) {
        $findings.Add([pscustomobject]@{
            Pattern = 'No known failure pattern detected'
            Advice = 'Run Test-DevPrerequisites and retry Invoke-NodeScout with -VerboseReport for more command output.'
        })
    }

    $suggestedInstall = switch ($manager.Name) {
        'npm' {
            if (Test-Path -LiteralPath (Join-Path $resolvedProjectPath 'package-lock.json') -PathType Leaf) { 'npm ci' } else { 'npm install' }
        }
        'pnpm' {
            if (Test-Path -LiteralPath (Join-Path $resolvedProjectPath 'pnpm-lock.yaml') -PathType Leaf) { 'pnpm install --frozen-lockfile' } else { 'pnpm install' }
        }
        'yarn' {
            if (Test-Path -LiteralPath (Join-Path $resolvedProjectPath 'yarn.lock') -PathType Leaf) { 'yarn install --immutable' } else { 'yarn install' }
        }
    }

    Write-ToolkitLog "Project: $resolvedProjectPath"
    Write-ToolkitLog "Detected package manager: $($manager.Name)"
    Write-ToolkitLog "Suggested install command: $suggestedInstall"
    foreach ($finding in $findings) {
        Write-ToolkitLog "$($finding.Pattern): $($finding.Advice)"
    }

    $cleanupPerformed = $false
    $nodeModulesPath = Join-Path $resolvedProjectPath 'node_modules'
    if ($CleanInstallState) {
        if (Test-Path -LiteralPath $nodeModulesPath -PathType Container) {
            $approved = $Yes
            if (-not $approved) {
                $response = Read-Host "Remove '$nodeModulesPath'? Type YES to continue"
                $approved = ($response -eq 'YES')
            }

            if ($approved -and $PSCmdlet.ShouldProcess($nodeModulesPath, 'Remove failed install state')) {
                Remove-Item -LiteralPath $nodeModulesPath -Recurse -Force
                $cleanupPerformed = $true
            }
        } else {
            Write-ToolkitLog "No node_modules directory found to clean."
        }
    }

    [pscustomobject]@{
        ProjectPath = $resolvedProjectPath
        PackageManager = $manager.Name
        SuggestedInstallCommand = $suggestedInstall
        Findings = @($findings)
        CleanupPerformed = $cleanupPerformed
    }
}
