function Write-ToolkitLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Message,

        [ValidateSet('Info', 'Warning', 'Error', 'Success')]
        [string] $Level = 'Info'
    )

    $prefix = "[AgentForge.DevToolkit][$Level]"
    switch ($Level) {
        'Warning' { Write-Warning "$prefix $Message" }
        'Error' { Write-Error "$prefix $Message" }
        default { Write-Host "$prefix $Message" }
    }
}
