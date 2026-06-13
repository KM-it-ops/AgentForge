function Get-InstallCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $ProjectPath,

        [Parameter(Mandatory)]
        [ValidateSet('npm', 'pnpm', 'yarn')]
        [string] $PackageManager
    )

    switch ($PackageManager) {
        'npm' {
            if (Test-Path -LiteralPath (Join-Path $ProjectPath 'package-lock.json') -PathType Leaf) {
                return @('npm', 'ci')
            }
            return @('npm', 'install')
        }
        'pnpm' {
            if (Test-Path -LiteralPath (Join-Path $ProjectPath 'pnpm-lock.yaml') -PathType Leaf) {
                return @('pnpm', 'install', '--frozen-lockfile')
            }
            return @('pnpm', 'install')
        }
        'yarn' {
            if (Test-Path -LiteralPath (Join-Path $ProjectPath 'yarn.lock') -PathType Leaf) {
                return @('yarn', 'install', '--immutable')
            }
            return @('yarn', 'install')
        }
    }
}

function Get-ScriptCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('npm', 'pnpm', 'yarn')]
        [string] $PackageManager,

        [Parameter(Mandatory)]
        [ValidateSet('build', 'test')]
        [string] $ScriptName
    )

    if ($ScriptName -eq 'test') {
        switch ($PackageManager) {
            'npm' { return @('npm', 'test') }
            'pnpm' { return @('pnpm', 'test') }
            'yarn' { return @('yarn', 'test') }
        }
    }

    switch ($PackageManager) {
        'npm' { return @('npm', 'run', $ScriptName) }
        'pnpm' { return @('pnpm', 'run', $ScriptName) }
        'yarn' { return @('yarn', $ScriptName) }
    }
}

function Invoke-VoltaRun {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $NodeVersion,

        [Parameter(Mandatory)]
        [string[]] $Command,

        [Parameter(Mandatory)]
        [string] $ProjectPath,

        [switch] $DryRun
    )

    $arguments = @('run', '--node', $NodeVersion, '--') + $Command
    Invoke-LoggedCommand -FilePath 'volta' -ArgumentList $arguments -WorkingDirectory $ProjectPath -DryRun:$DryRun
}

function Test-NodeCandidate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $ProjectPath,

        [Parameter(Mandatory)]
        [string] $NodeVersion,

        [Parameter(Mandatory)]
        [ValidateSet('npm', 'pnpm', 'yarn')]
        [string] $PackageManager,

        [Parameter(Mandatory)]
        [hashtable] $PackageJson,

        [switch] $SkipBuild,

        [switch] $SkipTest,

        [switch] $DryRun
    )

    $commands = [System.Collections.Generic.List[object]]::new()
    $install = Get-InstallCommand -ProjectPath $ProjectPath -PackageManager $PackageManager
    $commands.Add((Invoke-VoltaRun -NodeVersion $NodeVersion -Command $install -ProjectPath $ProjectPath -DryRun:$DryRun))

    $scripts = if ($PackageJson.ContainsKey('scripts') -and $PackageJson.scripts -is [hashtable]) {
        $PackageJson.scripts
    } else {
        @{}
    }

    if (-not $commands[-1].Success) {
        return [pscustomobject]@{
            NodeVersion = $NodeVersion
            Success = $false
            Commands = @($commands)
        }
    }

    if (-not $SkipBuild -and $scripts.ContainsKey('build')) {
        $build = Get-ScriptCommand -PackageManager $PackageManager -ScriptName 'build'
        $commands.Add((Invoke-VoltaRun -NodeVersion $NodeVersion -Command $build -ProjectPath $ProjectPath -DryRun:$DryRun))
        if (-not $commands[-1].Success) {
            return [pscustomobject]@{
                NodeVersion = $NodeVersion
                Success = $false
                Commands = @($commands)
            }
        }
    }

    if (-not $SkipTest -and $scripts.ContainsKey('test')) {
        $test = Get-ScriptCommand -PackageManager $PackageManager -ScriptName 'test'
        $commands.Add((Invoke-VoltaRun -NodeVersion $NodeVersion -Command $test -ProjectPath $ProjectPath -DryRun:$DryRun))
        if (-not $commands[-1].Success) {
            return [pscustomobject]@{
                NodeVersion = $NodeVersion
                Success = $false
                Commands = @($commands)
            }
        }
    }

    [pscustomobject]@{
        NodeVersion = $NodeVersion
        Success = $true
        Commands = @($commands)
    }
}
