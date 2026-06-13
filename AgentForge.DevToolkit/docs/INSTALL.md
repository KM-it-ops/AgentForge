# Install

## Import From Source

From the `AgentForge.DevToolkit` directory:

```powershell
Import-Module ./src/AgentForge.DevToolkit/AgentForge.DevToolkit.psd1 -Force
```

## Install To User Module Path

```powershell
Import-Module ./src/AgentForge.DevToolkit/AgentForge.DevToolkit.psd1 -Force
Install-AgentForgeDevToolkit
```

The installer copies the module into:

```powershell
$HOME\Documents\PowerShell\Modules\AgentForge.DevToolkit
```

To add the profile helper:

```powershell
Install-AgentForgeDevToolkit -AddProfileFunction
```

Before changing your profile, the installer creates a timestamped backup next to the original profile file.

## Verify

```powershell
Import-Module AgentForge.DevToolkit -Force
Get-Command -Module AgentForge.DevToolkit
Test-DevPrerequisites
```
