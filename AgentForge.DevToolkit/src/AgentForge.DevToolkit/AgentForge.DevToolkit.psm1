Set-StrictMode -Version Latest

$privatePath = Join-Path $PSScriptRoot 'Private'
$publicPath = Join-Path $PSScriptRoot 'Public'

Get-ChildItem -Path $privatePath -Filter '*.ps1' -File | Sort-Object Name | ForEach-Object {
    . $_.FullName
}

Get-ChildItem -Path $publicPath -Filter '*.ps1' -File | Sort-Object Name | ForEach-Object {
    . $_.FullName
}

Set-Alias -Name 'node-scout' -Value 'Invoke-NodeScout'

Export-ModuleMember -Function @(
    'Invoke-NodeScout',
    'Repair-NodeProject',
    'New-ProjectEnvironmentReport',
    'Test-DevPrerequisites',
    'Install-AgentForgeDevToolkit'
) -Alias 'node-scout'
