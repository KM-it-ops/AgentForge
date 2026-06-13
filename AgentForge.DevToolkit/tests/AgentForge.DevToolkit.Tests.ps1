Describe 'AgentForge.DevToolkit' {
    $script:Root = Split-Path -Parent $PSScriptRoot
    Import-Module (Join-Path $script:Root 'src\AgentForge.DevToolkit\AgentForge.DevToolkit.psd1') -Force

    It 'imports the module' {
        Get-Command Invoke-NodeScout | Should Not BeNullOrEmpty
    }

    It 'dry-runs the npm fixture and keeps package.json unchanged' {
        $fixture = Join-Path $script:Root 'examples\npm-lock'
        $before = Get-Content -LiteralPath (Join-Path $fixture 'package.json') -Raw
        $result = Invoke-NodeScout -ProjectPath $fixture -DryRun
        $after = Get-Content -LiteralPath (Join-Path $fixture 'package.json') -Raw

        $result.PackageManager.Name | Should Be 'npm'
        $result.RecommendedNode | Should Be '20'
        $after | Should Be $before
    }

    It 'detects pnpm and yarn fixtures' {
        (Invoke-NodeScout -ProjectPath (Join-Path $script:Root 'examples\pnpm-lock') -DryRun -SkipBuild -SkipTest).PackageManager.Name | Should Be 'pnpm'
        (Invoke-NodeScout -ProjectPath (Join-Path $script:Root 'examples\yarn-lock') -DryRun -SkipBuild -SkipTest).PackageManager.Name | Should Be 'yarn'
    }

    It 'writes an environment report' {
        $reportPath = Join-Path $script:Root '.test-output\pester-report.md'
        $report = New-ProjectEnvironmentReport -ProjectPath (Join-Path $script:Root 'examples\npm-lock') -ReportPath $reportPath
        Test-Path -LiteralPath $report.ReportPath | Should Be $true
    }
}
