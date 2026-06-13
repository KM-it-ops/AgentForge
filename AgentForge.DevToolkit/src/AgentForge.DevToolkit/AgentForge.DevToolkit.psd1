@{
    RootModule = 'AgentForge.DevToolkit.psm1'
    ModuleVersion = '0.1.0'
    GUID = '65ed0a89-64f0-4db6-80a2-9bb1cc0d5c0d'
    Author = 'AgentForge'
    CompanyName = 'AgentForge'
    Copyright = '(c) AgentForge. All rights reserved.'
    Description = 'Windows-first developer environment toolkit for discover-first, pin-second Node project workflows.'
    PowerShellVersion = '7.0'
    FunctionsToExport = @(
        'Invoke-NodeScout',
        'Repair-NodeProject',
        'New-ProjectEnvironmentReport',
        'Test-DevPrerequisites',
        'Install-AgentForgeDevToolkit'
    )
    CmdletsToExport = @()
    VariablesToExport = @()
    AliasesToExport = @('node-scout')
}
