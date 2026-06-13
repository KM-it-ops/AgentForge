function Get-PackageManager {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $ProjectPath,

        [Parameter(Mandatory)]
        [hashtable] $PackageJson,

        [ValidateSet('npm', 'pnpm', 'yarn')]
        [string] $Override
    )

    $signals = [ordered]@{
        Override = $Override
        PackageManagerField = $null
        Lockfiles = @()
    }

    if ($Override) {
        return [pscustomobject]@{
            Name = $Override
            Source = 'parameter'
            Signals = $signals
        }
    }

    if ($PackageJson.ContainsKey('packageManager') -and $PackageJson.packageManager) {
        $declared = [string]$PackageJson.packageManager
        $signals.PackageManagerField = $declared
        if ($declared -match '^(npm|pnpm|yarn)@') {
            return [pscustomobject]@{
                Name = $Matches[1]
                Source = 'package.json packageManager'
                Signals = $signals
            }
        }
    }

    $lockfileMap = [ordered]@{
        'package-lock.json' = 'npm'
        'pnpm-lock.yaml' = 'pnpm'
        'yarn.lock' = 'yarn'
    }

    foreach ($lockfile in $lockfileMap.Keys) {
        if (Test-Path -LiteralPath (Join-Path $ProjectPath $lockfile) -PathType Leaf) {
            $signals.Lockfiles += $lockfile
            return [pscustomobject]@{
                Name = $lockfileMap[$lockfile]
                Source = $lockfile
                Signals = $signals
            }
        }
    }

    [pscustomobject]@{
        Name = 'npm'
        Source = 'default'
        Signals = $signals
    }
}
