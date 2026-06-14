# Security Policy

## Supported versions

AgentForge is pre-1.0; security fixes land on the latest `main` and the most recent tagged
release.

| Version | Supported |
|---------|-----------|
| latest `main` | ✅ |
| `0.2.x` | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not report security issues in public GitHub issues, discussions, or pull requests.**

Use GitHub's private vulnerability reporting instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (GitHub Private Vulnerability Reporting).
3. Include a description, reproduction steps, affected version/commit, and impact.

You'll get an acknowledgment as soon as the report is triaged. Please give us a reasonable
window to investigate and ship a fix before any public disclosure.

## Scope notes

AgentForge generates configuration files and runs local install scripts. When reviewing
or reporting, the areas most worth scrutiny are:

- Adapter emitters that write to user directories (`~/.claude`, `~/.codex`, etc.).
- Bootstrap installers under `bootstrap/`.
- Any code path that executes shell scripts (`scripts/run-bash-script.js`).

The project ships with **zero runtime dependencies**, so supply-chain surface is intentionally minimal.
