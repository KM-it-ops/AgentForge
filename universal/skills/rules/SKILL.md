---
name: rules
description: On-demand dispatcher for the user's 15 global engineering rule files (coding style, naming, security, testing, error handling, API design, database, performance, monitoring, accessibility, dependency management, docs, git, code review, agents). Use when the user asks about coding standards, conventions, code review checklists, error handling patterns, security defaults, API design rules, database schema rules, naming conventions, git workflow, dependency policy, performance budgets, monitoring/SLO standards, accessibility requirements, or "what's our convention for X". Loads only the relevant rule file(s), not all 15.
---

# Rules dispatcher

These 15 files were previously auto-loaded into every session (~34KB / 650 lines of context cost). They now load only when relevant.

Read **only** the file(s) that match the task. Do not bulk-read.

| Trigger | File |
|---|---|
| code review, PR review checklist | `refs/code-review.md` |
| naming variables / classes / files / DB | `refs/naming.md` |
| coding style, formatting, file organization | `refs/coding-style.md` |
| API design, REST, status codes, versioning, pagination | `refs/api-design.md` |
| database, queries, indexing, migrations, schema, N+1 | `refs/database.md` |
| security, secrets, input validation, auth, HTTPS headers | `refs/security.md` |
| testing, coverage, mocks, CI test rules | `refs/testing.md` |
| error handling, error types, recovery, logging errors | `refs/error-handling.md` |
| git workflow, commits, branches, PR, merge | `refs/git-workflow.md` |
| documentation, README, JSDoc, ADRs | `refs/documentation.md` |
| performance, caching, loading, frontend perf, profiling | `refs/performance.md` |
| monitoring, logging, metrics, alerting, dashboards, SLOs | `refs/monitoring.md` |
| accessibility, WCAG, ARIA, keyboard nav | `refs/accessibility.md` |
| dependencies, package versions, audits, license compliance | `refs/dependency-management.md` |
| subagents, delegation, budget, decomposition, safety | `refs/agents.md` |

## How to use

1. Identify which rule(s) match the user's task. Usually 1-2.
2. Read the file(s) with the Read tool.
3. Apply rules to the work. Reference specific line numbers when citing.
4. Do not paste rule text wholesale into the response — apply, don't recite.

## Project override

A repo-level `docs/agents/*.md` or `CONTEXT.md` always overrides these globals. Check for those first when working in a project.
