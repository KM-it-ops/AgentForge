function Get-ToolStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [string[]] $VersionArguments = @('--version')
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        return [pscustomobject]@{
            Name = $Name
            Available = $false
            Source = $null
            Version = 'not found'
        }
    }

    $version = 'detected'
    try {
        $versionOutput = & $Name @VersionArguments 2>$null | Select-Object -First 1
        if ($versionOutput) {
            $version = [string]$versionOutput
        }
    } catch {
        $version = "version check failed: $($_.Exception.Message)"
    }

    [pscustomobject]@{
        Name = $Name
        Available = $true
        Source = $command.Source
        Version = $version
    }
}

function Test-DevPrerequisites {
    [CmdletBinding()]
    param(
        [switch] $AsJson,

        [switch] $AsObject
    )

    Set-StrictMode -Version Latest

    $nodeCommands = @(Get-Command node -All -ErrorAction SilentlyContinue)
    $nodeFirstSource = if ($nodeCommands.Count -gt 0) { $nodeCommands[0].Source } else { $null }
    $voltaFirst = if ($nodeFirstSource) { $nodeFirstSource -match '\\Volta\\|/volta/' } else { $false }

    $tools = [ordered]@{
        Volta = Get-ToolStatus -Name 'volta'
        Git = Get-ToolStatus -Name 'git'
        Node = Get-ToolStatus -Name 'node'
        Npm = Get-ToolStatus -Name 'npm'
        Pnpm = Get-ToolStatus -Name 'pnpm'
        Yarn = Get-ToolStatus -Name 'yarn'
        Python = Get-ToolStatus -Name 'python'
        WindowsTerminal = Get-ToolStatus -Name 'wt' -VersionArguments @('--version')
    }

    $vsWhere = Get-Command 'vswhere' -ErrorAction SilentlyContinue
    $buildToolsHint = if ($vsWhere) {
        'vswhere detected; run vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 for exact C++ Build Tools verification.'
    } else {
        'vswhere not detected; install Visual Studio Build Tools if native Node modules fail.'
    }

    $result = [pscustomobject]@{
        PowerShell = [pscustomobject]@{
            Version = [string]$PSVersionTable.PSVersion
            IsPowerShell7OrNewer = ($PSVersionTable.PSVersion.Major -ge 7)
        }
        Tools = $tools
        NodeResolution = [pscustomobject]@{
            FirstNodeSource = $nodeFirstSource
            VoltaAppearsFirst = $voltaFirst
            AllNodeSources = @($nodeCommands | ForEach-Object { $_.Source })
        }
        VisualStudioBuildTools = $buildToolsHint
    }

    if ($AsJson) {
        return ($result | ConvertTo-Json -Depth 10)
    }

    if ($AsObject) {
        return $result
    }

    Write-Host 'AgentForge Developer Toolkit prerequisites'
    Write-Host "PowerShell: $($result.PowerShell.Version) (7+: $($result.PowerShell.IsPowerShell7OrNewer))"
    foreach ($toolName in $tools.Keys) {
        $tool = $tools[$toolName]
        $status = if ($tool.Available) { 'OK' } else { 'Missing' }
        Write-Host ("{0}: {1} - {2}" -f $toolName, $status, $tool.Version)
    }
    Write-Host "Node first on PATH: $($result.NodeResolution.FirstNodeSource)"
    Write-Host "Volta first for node: $($result.NodeResolution.VoltaAppearsFirst)"
    Write-Host "Build tools: $($result.VisualStudioBuildTools)"

    $result
}
