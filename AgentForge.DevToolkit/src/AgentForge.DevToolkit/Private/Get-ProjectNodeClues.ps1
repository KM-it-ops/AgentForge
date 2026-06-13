function ConvertTo-NodeCandidate {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object] $Value
    )

    if ($null -eq $Value) {
        return $null
    }

    $text = ([string]$Value).Trim()
    if (-not $text) {
        return $null
    }

    if ($text -match '^\s*(?:node@)?(?<version>\d+(?:\.\d+){0,2})\s*$') {
        return $Matches.version
    }

    if ($text -match '(?<major>1[8-9]|2[0-9])(?:\.\d+|\.x|x|\b)') {
        return $Matches.major
    }

    return $null
}

function Get-ProjectNodeClues {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $ProjectPath,

        [Parameter(Mandatory)]
        [hashtable] $PackageJson
    )

    $clues = [System.Collections.Generic.List[object]]::new()

    if ($PackageJson.ContainsKey('volta') -and $PackageJson.volta -is [hashtable] -and $PackageJson.volta.ContainsKey('node')) {
        $clues.Add([pscustomobject]@{
            Source = 'package.json volta.node'
            RawValue = [string]$PackageJson.volta.node
            Candidate = ConvertTo-NodeCandidate $PackageJson.volta.node
        })
    }

    foreach ($fileName in @('.nvmrc', '.node-version')) {
        $path = Join-Path $ProjectPath $fileName
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $raw = (Get-Content -LiteralPath $path -TotalCount 1 -ErrorAction Stop).Trim()
            $clues.Add([pscustomobject]@{
                Source = $fileName
                RawValue = $raw
                Candidate = ConvertTo-NodeCandidate $raw
            })
        }
    }

    if ($PackageJson.ContainsKey('engines') -and $PackageJson.engines -is [hashtable] -and $PackageJson.engines.ContainsKey('node')) {
        $clues.Add([pscustomobject]@{
            Source = 'package.json engines.node'
            RawValue = [string]$PackageJson.engines.node
            Candidate = ConvertTo-NodeCandidate $PackageJson.engines.node
        })
    }

    if ($PackageJson.ContainsKey('devEngines') -and $PackageJson.devEngines -is [hashtable]) {
        $devEngines = $PackageJson.devEngines
        if ($devEngines.ContainsKey('runtime')) {
            $runtime = $devEngines.runtime
            if ($runtime -is [hashtable] -and $runtime.ContainsKey('version')) {
                $clues.Add([pscustomobject]@{
                    Source = 'package.json devEngines.runtime.version'
                    RawValue = [string]$runtime.version
                    Candidate = ConvertTo-NodeCandidate $runtime.version
                })
            }
        }

        if ($devEngines.ContainsKey('node')) {
            $clues.Add([pscustomobject]@{
                Source = 'package.json devEngines.node'
                RawValue = [string]$devEngines.node
                Candidate = ConvertTo-NodeCandidate $devEngines.node
            })
        }
    }

    $npmrcPath = Join-Path $ProjectPath '.npmrc'
    $npmrcSignals = @()
    if (Test-Path -LiteralPath $npmrcPath -PathType Leaf) {
        $npmrcSignals = Get-Content -LiteralPath $npmrcPath -ErrorAction Stop |
            Where-Object { $_ -match '^\s*(engine-strict|node-version|use-node-version)\s*=' }
    }

    $declaredCandidates = @(
        $clues |
            Where-Object { $_.Candidate } |
            ForEach-Object { $_.Candidate }
    )

    $candidateOrder = [System.Collections.Generic.List[string]]::new()
    foreach ($candidate in ($declaredCandidates + @('20', '22', '18'))) {
        if ($candidate -and -not $candidateOrder.Contains([string]$candidate)) {
            $candidateOrder.Add([string]$candidate)
        }
    }

    [pscustomobject]@{
        Clues = @($clues)
        NpmrcSignals = @($npmrcSignals)
        CandidateNodes = @($candidateOrder)
    }
}
