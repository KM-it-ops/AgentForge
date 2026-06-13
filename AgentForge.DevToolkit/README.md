# AgentForge Developer Toolkit

AgentForge Developer Toolkit is a Windows-first PowerShell module for Node project environment discovery. It helps you inspect a project, test likely Node versions with Volta, and recommend a pin without blindly changing `package.json`.

The workflow is simple:

1. Discover project clues from `package.json`, lockfiles, `.nvmrc`, `.node-version`, `.npmrc`, `engines`, `devEngines`, `packageManager`, and existing Volta config.
2. Test candidate Node versions with `volta run` so the project is evaluated without pinning first.
3. Recommend the first working candidate.
4. Pin only when you explicitly pass `-Pin`.

## Quick Start

```powershell
Import-Module ./src/AgentForge.DevToolkit/AgentForge.DevToolkit.psd1
Invoke-NodeScout -ProjectPath ./examples/npm-lock -DryRun
node-scout -ProjectPath ./examples/pnpm-lock -SkipBuild -SkipTest
Test-DevPrerequisites
New-ProjectEnvironmentReport -ProjectPath ./examples/npm-lock -ReportPath ./environment-report.md
```

To pin after reviewing the recommendation:

```powershell
Invoke-NodeScout -ProjectPath C:\path\to\project -Pin
```

Without `-Pin`, the toolkit does not run `volta pin` and prints the exact command you can run later.

## Commands

- `Invoke-NodeScout` inspects a Node project, tests candidate Node versions through Volta, and recommends a pin.
- `Repair-NodeProject` detects common install failure patterns and suggests conservative repair commands.
- `New-ProjectEnvironmentReport` writes a markdown environment report.
- `Test-DevPrerequisites` checks Windows, PowerShell, Volta, Git, Node, package manager, Python, build tool, and Windows Terminal hints.
- `Install-AgentForgeDevToolkit` copies the module to the user PowerShell module folder and can add a `node-scout` profile helper with backup.
- `node-scout` is a wrapper function for `Invoke-NodeScout`.

## Safety

- No `volta pin` is run unless `-Pin` is passed.
- No direct `package.json` mutation is performed.
- `Repair-NodeProject` does not delete install state unless cleanup is explicitly requested and confirmed.
- Uncertainty is reported as a warning instead of being hidden behind guesses.

See [docs/INSTALL.md](docs/INSTALL.md), [docs/USAGE.md](docs/USAGE.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more.
