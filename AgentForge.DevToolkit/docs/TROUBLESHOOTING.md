# Troubleshooting

## Volta Is Missing

Run:

```powershell
Test-DevPrerequisites
```

Install Volta from the official Volta project, then restart PowerShell so PATH updates are loaded.

## Volta Is Not First For Node

`Test-DevPrerequisites` checks `Get-Command node -All`. If a non-Volta Node appears before Volta, fix PATH ordering before pinning projects.

## EBADENGINE

Run:

```powershell
Repair-NodeProject -ProjectPath C:\repo\project -ErrorLogPath .\npm-debug.log
```

Then retry `Invoke-NodeScout` with candidates that satisfy the `engines.node` range.

## node-gyp, Python, Or MSBuild Failures

Check Python and Visual Studio Build Tools hints:

```powershell
Test-DevPrerequisites
```

Native modules usually need Python plus Visual Studio Build Tools with C++ workload support.

## Lockfile Mismatch

For npm projects, `npm ci` requires the lockfile to match `package.json`. For pnpm and yarn, frozen or immutable installs make mismatches visible. Regenerate lockfiles only when you intentionally accept dependency changes.

## Cleanup

`Repair-NodeProject` only removes `node_modules` when you explicitly pass `-CleanInstallState` and confirm the prompt, or when `-Yes` is supplied.
