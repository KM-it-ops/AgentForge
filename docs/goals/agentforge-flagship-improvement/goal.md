# AgentForge Flagship Improvement

## Objective

Make `C:\AI\AgentForge` a flagship project through phased technical-health and demo-readiness improvements. This tranche should discover enough evidence, select the highest-leverage safe work, implement successive verified slices, and continue until a final audit proves the repo is flagship-ready.

## Original Request

Prepare a fresh GoalBuddy board at `docs/goals/agentforge-flagship-improvement/` for making `C:\AI\AgentForge` a flagship project through phased technical-health and demo-readiness improvements.

## Intake Summary

- Input shape: `vague`
- Audience: the repo owner and future users/evaluators of AgentForge
- Authority: `approved`
- Proof type: `demo`
- Completion proof: current repo health evidence plus a verified, polished demo/app experience or equivalent artifact showing the project is flagship-ready
- Goal oracle: repo health checks and demo-readiness walkthrough evidence that map directly to completed task receipts
- Likely misfire: spending the run on broad discovery, cosmetic cleanup, or small isolated improvements without proving flagship readiness
- Blind spots considered: broad scope can sprawl; "flagship" must be grounded in technical health, visible demo quality, onboarding clarity, verification, and final audit evidence
- Existing plan facts: create only GoalBuddy control files, use a local live board, start with Scout, then Judge selects the largest safe useful implementation tranche

## Goal Oracle

The oracle for this goal is:

`Current repo health evidence plus a verified, polished demo/app experience or equivalent artifact showing AgentForge is flagship-ready.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`open_ended`

## Current Tranche

Discover the current repo purpose, architecture, verification surface, technical health, demo quality, onboarding clarity, and obvious flagship-readiness gaps. Then choose and execute the largest safe useful verified implementation slices until the full flagship outcome is complete.

## Non-Negotiable Constraints

- Scope is broad: any local repo improvement is in scope when it advances flagship quality.
- Credentials, secrets, destructive operations, production changes, and major dependency churn require explicit approval.
- Follow existing repository conventions before applying global defaults.
- Keep one active task at a time and do not implement without an active Worker or PM task that permits the edits.
- Completion requires a final Judge or PM audit receipt with `full_outcome_complete: true`.
- GoalBuddy update checking previously failed locally with an `EPERM` read on `C:\Users\alkur`; this should not block the goal.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/agentforge-flagship-improvement/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/agentforge-flagship-improvement/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
