function Install-AgentForgeDevToolkit {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string] $DestinationRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PowerShell\Modules'),

        [switch] $AddProfileFunction,

        [switch] $Force,

        [switch] $Yes
    )

    Set-StrictMode -Version Latest

    $sourceModuleRoot = Split-Path -Parent $PSScriptRoot
    $destination = Join-Path $DestinationRoot 'AgentForge.DevToolkit'
    $changes = [System.Collections.Generic.List[string]]::new()

    if (-not (Test-Path -LiteralPath $DestinationRoot -PathType Container)) {
        if ($PSCmdlet.ShouldProcess($DestinationRoot, 'Create module destination root')) {
            New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
            $changes.Add("Created $DestinationRoot")
        }
    }

    if ((Test-Path -LiteralPath $destination -PathType Container) -and -not $Force) {
        throw "Destination '$destination' already exists. Re-run with -Force to replace it."
    }

    if ($PSCmdlet.ShouldProcess($destination, 'Copy AgentForge.DevToolkit module')) {
        if (Test-Path -LiteralPath $destination -PathType Container) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        Copy-Item -LiteralPath $sourceModuleRoot -Destination $destination -Recurse -Force
        $changes.Add("Copied module to $destination")
    }

    if ($AddProfileFunction) {
        $profilePath = $PROFILE.CurrentUserCurrentHost
        $profileDirectory = Split-Path -Parent $profilePath
        $profileSnippet = @'

function node-scout {
    Invoke-NodeScout @args
}
'@

        if (-not (Test-Path -LiteralPath $profileDirectory -PathType Container)) {
            New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
            $changes.Add("Created $profileDirectory")
        }

        $profileText = if (Test-Path -LiteralPath $profilePath -PathType Leaf) {
            Get-Content -LiteralPath $profilePath -Raw
        } else {
            ''
        }

        if ($profileText -notmatch 'function\s+node-scout') {
            $approved = $Yes
            if (-not $approved) {
                $response = Read-Host "Add node-scout helper to '$profilePath'? Type YES to continue"
                $approved = ($response -eq 'YES')
            }

            if ($approved -and $PSCmdlet.ShouldProcess($profilePath, 'Append node-scout profile helper')) {
                if (Test-Path -LiteralPath $profilePath -PathType Leaf) {
                    $backup = "$profilePath.$(Get-Date -Format 'yyyyMMddHHmmss').bak"
                    Copy-Item -LiteralPath $profilePath -Destination $backup -Force
                    $changes.Add("Backed up profile to $backup")
                }
                Add-Content -LiteralPath $profilePath -Value $profileSnippet -Encoding utf8
                $changes.Add("Added node-scout helper to $profilePath")
            }
        } else {
            $changes.Add("Profile already contains a node-scout function; no profile change made")
        }
    }

    foreach ($change in $changes) {
        Write-ToolkitLog $change
    }

    [pscustomobject]@{
        Destination = $destination
        Changes = @($changes)
    }
}
