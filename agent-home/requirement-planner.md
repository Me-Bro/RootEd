---
name: requirement-planner
description: Turn a requirement markdown file in agent-home/requirements into a repo-aligned phased implementation plan, per-phase task docs, requirement traceability, a checkpoint state ledger, TDD/seed/e2e steps, and TMC PM subtask suggestions under agent-home/plans and agent-home/states. Trigger on "plan this ticket", "turn this requirement into a plan", "break this feature into phases", or similar.
---

# Requirement Planner

Turn a requirement doc into a decision-complete implementation plan: independently
executable phase docs, requirement traceability, and a checkpoint state ledger a
later session can resume from cold.

## Required Input

A requirement markdown file in `agent-home/requirements/`.

If given only a ticket ID or vague description, find matching files in
`agent-home/requirements/`. Multiple matches — ask which one.

If given no ticket ID, no description, and no existing file: draft one.
Scan `agent-home/requirements/` for filenames matching `TICKET-<N>-*.md`,
take the highest `N`, assign `N+1` (start at `TICKET-001` if none exist).
Ask the user for a one-line feature description if they haven't given one in
chat, then write `agent-home/requirements/TICKET-<NNN>-<slug>.md` (slug =
kebab-case of the description) with whatever detail was given — mark
unclear sections `TBD` rather than inventing scope. Continue planning from
that file as the required input above.

## Output Contract

Derive `ticketId` from the requirement filename (`TICKET-042` from
`agent-home/requirements/TICKET-042-fee-late-charge-retry.md`).

Produce or update:

- `agent-home/plans/<ticketId>/00-overall-plan.md`
- `agent-home/plans/<ticketId>/01-<phase-slug>.md`, more numbered phase docs in
  execution order
- `agent-home/states/<ticketId>.md`

Plan needs 2-6 implementation phases, one validation phase, one final
precommit review/simplification phase. State file names planned phases,
current phase, next phase, so a later session can resume from
`agent-home/states/<ticketId>.md` alone.

Unlike this file itself (a tracked repo runbook), `agent-home/requirements/`,
`agent-home/plans/`, and `agent-home/states/` are per-ticket working state
(gitignored) — do not stage or commit files under any of them, even though
`agent-home/*.md` runbooks are normally
tracked in this repo.

## Core Workflow

1. Read the requirement doc first.
2. Read existing `agent-home/plans/<ticketId>/` and
   `agent-home/states/<ticketId>.md` if present — resume, don't restart.
3. Read `CLAUDE.md` (multi-tenant model, tenantScope, RBAC, request
   lifecycle, workers, field encryption, i18n coverage rule).
4. Read relevant `agent-home/*.md` runbooks for the surfaces involved —
   [[feature-tdd-seed-e2e]] for the TDD/seed/e2e shape every implementation
   phase follows, [[restore-dev-stack]] if a phase needs the docker stack up,
   [[branch-commit-pr-from-upstream]] for the branch/commit/PR mechanics,
   [[local-dev-login-and-manual-verification]] if a phase needs manual UI
   verification, [[prod-staging-mongo-migration]] if the change touches the
   shared Mongo instance or tunnel config.
5. Inspect only the implementation surfaces the requirement actually touches
   (routes in `apps/api/src/routes/`, models in `apps/api/src/models/`, pages
   in `apps/web/src/`, shared Zod schemas in `packages/shared/src/`).
6. Build a requirement inventory before designing phases.
7. Write the overall plan, phase docs, validation phase, precommit
   review/simplification phase, checkpoint state ledger.
8. Self-check traceability before the final response.

## Requirement Inventory

Inventory every explicit requirement from functional sections, validations,
acceptance checks, edge cases, and user-visible feedback states.

- Assign stable IDs: `R1`, `V1`, `AC1`, `EH1`.
- Tag each item's behavior type: `visibility`, `interaction`, `feedback`,
  `save-block`, `config`, `persistence`, `edge-case`, `validation`,
  `permission` (this repo's RBAC/permission strings), `tenant-isolation`
  (anything that must stay `tenantId`-scoped).
- Keep control-state behavior separate from feedback behavior.
- Map every item to exactly one implementation phase, the validation phase,
  or an explicit out-of-scope note.
- Unmapped item = incomplete planning.

### Screening AI-Drafted Requirement Items

Requirement docs are often AI-assisted drafts and can carry items that were
never actually required. Screen every inventory item two ways.

Against the document itself: compare how rigorously the item is specified
against comparable items in the same doc. Neighbours that get an exact
permission string, a Zod schema shape, an exact error message, or a named
consumer set the bar. An item asserted in a single clause with nothing
defining how it's configured, computed, or consumed is a screening hit. One
mention alone is not.

Against the codebase: grep for the item's name and plausible synonyms
(`PERMISSIONS` list in `apps/api/src/models/Role.js`, existing route names,
existing i18n keys) before treating it as new. Behavior that already exists
under a different name is a rename, not a new requirement.

A screening hit is never dropped. Keep it in the inventory, map it like any
other item, and record it in the overall plan as an open question with
evidence for and against — a human decides.

## Phase Design

- Slice implementation phases by behavior or owned surface, not by file type.
- A phase that changes a shared model/route/permission (anything under
  `apps/api/src/models/`, `apps/api/src/routes/`, `packages/shared/src/`,
  `Role.js`'s `PERMISSIONS` list) must proactively inspect every caller —
  frontend pages/components consuming that route, other routes reading that
  model, other permission checks — and name the caller files plus the
  regression risk in the phase doc.
- If a phase touches `tenantScope`-covered models, state explicitly how
  `tenantId` scoping is preserved (or why the model is one of the two
  exemptions, `Tenant`/`User`).
- If a phase adds a user-facing string anywhere under
  `apps/web/src/components/**`, it must go through `useTranslation()`/`t()`
  and get `en`/`hi` keys — never hardcoded text (see CLAUDE.md's i18n
  section).
- Keep tightly coupled schema, route, Zod schema, and TDD coverage in the
  same phase.
- Each implementation phase must be independently executable in a separate
  session and follow [[feature-tdd-seed-e2e]]'s shape: failing test first
  (`apps/api/src/__tests__/*.test.js`, `pnpm --filter api test -- <name>`),
  smallest implementation, extend `apps/api/src/scripts/seed-test-data.js`
  additively if new UI/routes need fixtures, then Playwright coverage under
  `apps/web/tests/` if the phase changes user-facing flow.
- Do not add standalone lint/typecheck steps inside implementation phases —
  the precommit review/simplification phase owns those.
- Each phase ends with a mandatory git commit (work outside `agent-home/`
  only) before moving to the next phase — conventional commit type, no AI
  attribution line unless the user's own instructions say otherwise, per
  [[branch-commit-pr-from-upstream]].
- State/plan updates under `agent-home/` get written to disk for continuity
  but are never staged or committed.
- Keep validation separate from implementation phases.
- Keep the precommit review/simplification phase separate and last.
- Prefer one implementation phase per session unless the user explicitly
  asks for end-to-end execution.

### New Configuration Surfaces

Before a phase adds a setting, permission string, Zod field, Mongoose schema
field, or BullMQ job, inventory what already covers that surface. For each
candidate: who writes it, who reads it. Reuse when the real-world meaning is
identical; add new when it differs even if the shape matches — but note that
reuse widens blast radius across every existing consumer, and name them.
State the decision and reason in the phase doc explicitly.

## Overall Plan Requirements

`00-overall-plan.md` must include:

- Goal
- Requirement reference
- Requirement inventory
- Current implementation summary (which routes/models/pages/workers already
  exist for this surface)
- Constraints and repo guidance (tenant isolation, RBAC, encryption, i18n,
  conventional commits)
- Requirement traceability table
- Ordered phases
- Execution rules
- `## Suggested TMC PM Subtasks` — exactly one line per planned phase

## Phase Doc Requirements

Each numbered phase doc must include:

- Objective
- Scope
- Relevant requirement sections
- Requirement IDs covered
- Current implementation notes
- TDD-oriented implementation plan (test file path, `pnpm --filter api test
  -- <name>` or Playwright spec path)
- Focused validation steps
- Checkpoint update instructions for `agent-home/states/<ticketId>.md`
- Mandatory commit instructions after validation evidence and checkpoint
  updates, explicitly excluding every file under `agent-home/`
- A configuration decision table (`name | written by | read by | reuse or
  add | why`) whenever the phase adds or reuses a permission, schema field,
  Zod field, or job
- Dependencies and risks

Validation phase docs need a requirement evidence table covering every
inventory item — cite the actual Jest/Playwright run, not just intent.

Precommit review/simplification phase docs must require, in order: code
review and simplification pass (design before touching code), then this
repo's actual gate commands as the final check before PR —
`prettier --write .`, `pnpm lint`, `pnpm --filter api test`, and the
Playwright specs for any module the change touches or reads from (per
[[feature-tdd-seed-e2e]]'s regression-check note). This repo has no separate
`pre-pr-review`/`pre-pr-gates` skills — these commands are the gate.

Each phase doc must carry enough context for an agent to run only that phase
after reading the overall plan and state file.

## Guardrails

- Planning only — do not implement feature code from this skill.
- Do not invent scope not in the requirement document.
- Do not drop or narrow a requirement item on suspicion it's AI-drafted
  noise — record it as an open question instead.
- Do not skip `CLAUDE.md` or relevant `agent-home/*.md` runbooks.
- Do not stage or commit any file under `agent-home/requirements/`,
  `agent-home/plans/`, or `agent-home/states/`.
- Do not mark phases complete without validation evidence.
- Do not leave explicit requirements, validation expectations, acceptance
  checks, edge cases, or user-visible feedback unmapped.
- Do not create or link TMC PM tickets from this skill — only suggest
  one-line PM subtasks.
