# AgentForge Developer Toolkit Instructions

## Project Constraints & Learnings

- This toolkit is Windows-first and PowerShell 7 compatible; keep public commands usable from Windows Terminal without requiring WSL.
- Preserve the "discover first, pin second" workflow: never run `volta pin` unless `Invoke-NodeScout -Pin` is explicitly supplied.
- Do not modify `package.json` directly; Node pinning must happen only through `volta pin`.
- Prefer structured JSON parsing for `package.json`; avoid brittle text edits or string-only package metadata inspection.
- Keep repair behavior conservative: explain and suggest commands before running cleanup, and require confirmation or `-Yes` for destructive cleanup.
