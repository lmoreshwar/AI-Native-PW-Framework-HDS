---
name: modify-test
description: Safely modify or improve existing Playwright automation with full impact analysis. USE FOR changing an existing locator, adding a step or assertion, refactoring a Module/Spec/Page, or extending an existing test. Enforces reuse-first impact discovery, dependency-order edits (Pages then Modules then Specs then Fixtures), locator-safety rules, the snapshot gate for changed locators, and zero-regression verification. DO NOT USE FOR creating a brand-new test (use new-automation) or triaging a failed run (use debug-failure).
version: 1.0.0
author: Moreshwar Landge
license: MIT
testingTypes: [e2e]
frameworks: [playwright]
languages: [typescript]
domains: [web]
---

# Skill: Modify Existing Playwright Automation

Change existing code safely without breaking other tests. Rules from
[AGENT.md](../../AGENT.md) and [README.md](../../README.md).

## Gate 0 — Plan + approval (MANDATORY)
1. Provide an implementation plan FIRST. 2. Wait for explicit approval. 3. Only then edit.

Compliance references (README): **Anti-Hallucination Rules**, **@playwright/cli Locator
Workflow**, **Locator Standard**. Don't invent behavior/locators. Unclear → "Insufficient
information to determine."

## Step 1 — Impact analysis BEFORE any edit
1. READ the entire target file(s).
2. SEARCH all usages of the function/locator being changed (grep across `src/`).
3. LIST every test that will be affected.
4. Mine reuse-first before asking the user for anything:
   `.ai-memory/capabilities.json` (FIRST) → only the specific Page/Module/Spec it points to →
   debug artifacts/snapshots/traces.
5. PRESENT the impact analysis. Proceed only after confirming no unintended side effects.

## Step 2 — Snapshot gate (only if a locator changes)
If the change needs a NEW/CHANGED locator, you MUST have UI evidence for that screen
(pasted snapshot, existing `.playwright-cli/*.yml`, `test-results/**/error-context.md`, or
labeled DOM excerpt). No evidence → STOP, capture via `playwright-cli` or ask the user.
Does NOT apply to pure logic/data/assertion/rename work.

## Step 3 — Layer-safety rules
- **Locator change:** keep the function name/signature; prefer one Tier-1 strategy; add a
  fallback only with a concrete `// reason:`; max 3 strategies, no duplicate handle types; if
  the primary is reliable now, REMOVE stale fallbacks instead of stacking more.
- **Adding a locator:** follow naming convention; check other pages first to avoid duplicates.
- **Deleting a locator:** refuse unless explicitly asked; show all usages; remove references first.
- **Module method change:** keep signature; preserve/renumber `Logger.step()`; insert steps,
  don't restructure; prefer `Actions` / `WorkflowActions` / `WaitHelper`; raw Playwright only
  for justified low-level cases with a reason comment.
- **Spec change:** don't change test titles, tags, or order unless asked; keep
  `describe → module.method` pattern; never add raw `.click()/.fill()` flows into finished specs;
  add new tests AFTER existing ones with the existing tag/fixture pattern.
- **File uploads / attachments:** reuse the existing utility — never re-implement uploads. Put
  files in `src/testdata/attachments/` and reference them with `attachmentPath('<file-name>')`
  (from `../utils`); upload via `Actions.uploadViaFileChooser(browseBtn, path)` (required for hidden
  inputs behind a Browse button). Keep the split: Browse-button + uploaded-row locators in the Page,
  an `uploadAttachment(fileName)` workflow (returns `true` once the file is listed) in the Module,
  the assertion in the Spec. When adding an upload step to an existing spec, wire the Module method
  in — do NOT inline `setInputFiles`.

## Step 4 — Edit order & verification
1. Edit in dependency order: **Pages → Modules → Specs → Fixtures.** Check TS errors after each.
2. `npx playwright test --project=desktop-chrome` → verify ZERO regressions.
3. `npm run lint` → 0 problems AND `npx tsc --noEmit` → 0 errors.
4. Show a diff summary of all changes.
5. If any test breaks and can't be fixed cleanly: roll back and report.
6. **If you RENAMED or DELETED a spec file:** sync `saucectl.yml` in the SAME change — rename/remove the
   matching suite (`name: <spec-basename>-$TEST_ENV` + `testMatch: - <spec-basename>\.spec\.ts$`) and run
   `npm run index`. An unregistered/stale suite breaks Sauce runs. Verify with `npm run test:sauce:uat -- --dry-run`.
7. Update **README → "Reuse Index (Capabilities)"** by hand if any Page/Module/Spec/fixture changed
   (`capabilities.json` auto-refreshes via globalSetup; the README index is manual).
