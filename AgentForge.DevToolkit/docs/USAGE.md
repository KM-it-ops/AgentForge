# Usage

## Scout A Project

```powershell
Invoke-NodeScout -ProjectPath C:\repo\my-node-project
```

The command requires `package.json`. It inspects project declarations, chooses candidate Node versions, tests candidates with `volta run`, and stops at the first working candidate.

## Dry Run

```powershell
Invoke-NodeScout -ProjectPath C:\repo\my-node-project -DryRun
```

Dry run prints the commands it would execute without running package installation, build, test, or pin commands.

## Skip Build Or Test

```powershell
Invoke-NodeScout -SkipBuild
Invoke-NodeScout -SkipTest
Invoke-NodeScout -SkipBuild -SkipTest
```

Build runs only when `scripts.build` exists. Test runs only when `scripts.test` exists.

## Package Manager Detection

Detection order:

1. Explicit `-PackageManager`
2. `package.json` `packageManager`
3. `package-lock.json`
4. `pnpm-lock.yaml`
5. `yarn.lock`
6. `npm`

Override detection when needed:

```powershell
Invoke-NodeScout -PackageManager pnpm
```

## Candidate Node Versions

Default order:

1. Project-declared version from Volta, `.nvmrc`, `.node-version`, `engines`, or `devEngines`
2. `20`
3. `22`
4. `18`

Override candidates:

```powershell
Invoke-NodeScout -CandidateNodes 22,20,18
```

## Pin Only When Ready

```powershell
Invoke-NodeScout -Pin
```

Without `-Pin`, the command prints:

```powershell
volta pin node@<recommended>
```

## Reports

```powershell
Invoke-NodeScout -ReportPath .\node-scout-report.md
New-ProjectEnvironmentReport -ReportPath .\environment-report.md
```
