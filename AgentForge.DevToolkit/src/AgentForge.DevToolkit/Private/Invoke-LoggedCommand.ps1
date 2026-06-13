function Invoke-LoggedCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $FilePath,

        [string[]] $ArgumentList = @(),

        [Parameter(Mandatory)]
        [string] $WorkingDirectory,

        [switch] $DryRun
    )

    $display = @($FilePath) + @($ArgumentList) -join ' '
    if ($DryRun) {
        return [pscustomobject]@{
            Command = $display
            ExitCode = 0
            Success = $true
            DurationMs = 0
            Output = @("DRY RUN: $display")
        }
    }

    $originalLocation = Get-Location
    $output = @()
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        Set-Location -LiteralPath $WorkingDirectory
        $output = & $FilePath @ArgumentList 2>&1 | ForEach-Object { [string]$_ }
        $exitCode = if ($null -ne $global:LASTEXITCODE) { [int]$global:LASTEXITCODE } else { 0 }
    } catch {
        $output += $_.Exception.Message
        $exitCode = 1
    } finally {
        $stopwatch.Stop()
        Set-Location -LiteralPath $originalLocation
    }

    [pscustomobject]@{
        Command = $display
        ExitCode = $exitCode
        Success = ($exitCode -eq 0)
        DurationMs = $stopwatch.ElapsedMilliseconds
        Output = @($output)
    }
}
