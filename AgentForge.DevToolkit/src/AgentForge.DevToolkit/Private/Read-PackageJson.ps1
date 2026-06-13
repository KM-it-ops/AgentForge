function Read-PackageJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $ProjectPath
    )

    $packageJsonPath = Join-Path $ProjectPath 'package.json'
    if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
        throw "package.json was not found at '$packageJsonPath'. Invoke-NodeScout requires a Node project root."
    }

    try {
        $raw = Get-Content -LiteralPath $packageJsonPath -Raw -ErrorAction Stop
        $json = $raw | ConvertFrom-Json -AsHashtable -Depth 32 -ErrorAction Stop
    } catch {
        throw "Failed to read package.json at '$packageJsonPath': $($_.Exception.Message)"
    }

    [pscustomobject]@{
        Path = $packageJsonPath
        Raw = $raw
        Data = $json
    }
}
