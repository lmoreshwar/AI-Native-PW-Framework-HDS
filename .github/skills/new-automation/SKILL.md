---
name: new-automation
description: Create new Playwright test automation (Page Objects, Modules, Specs) from a requirement or user story. USE FOR creating a brand-new test, automating a new screen or flow, adding a new spec, or batch-automating multiple scenarios. Enforces reuse-first discovery via the capabilities index, evidence-based locators with @playwright/cli, the strict 3-layer architecture, wrapper-driven code, and a plan-approval gate before any code is written. DO NOT USE FOR modifying an existing test (use modify-test) or fixing a failing run (use debug-failure).
version: 1.0.0
author: Moreshwar Landge
license: MIT
testingTypes: [e2e]
frameworks: [playwright]
languages: [typescript]
domains: [web]
---

# Skill: Create New Playwright Automation

Build a new test end-to-end while maximizing reuse and obeying the framework rules in
[AGENT.md](../../AGENT.md) and [README.md](../../README.md).

## Gate 0 — Plan + approval (MANDATORY)
1. Provide an implementation plan FIRST.
2. Wait for explicit user approval.
3. Only after approval, write code.

Compliance references (see README): **Anti-Hallucination Rules**, **@playwright/cli Locator
Workflow**, **Locator Standard**. Never invent behavior, locators, or undocumented features.
If information is unclear, say "Insufficient information to determine."

## Step 1 — Reuse-first discovery (before writing anything)
Mine existing knowledge in this order; if an asset exists, REUSE it (do not re-derive):
1. `.ai-memory/capabilities.json` — the reuse index of every Page, locator method, Module
   workflow, fixture, util, and spec. **Check FIRST.**
2. Only the specific `src/pages/*` / `src/modules/*` file the index points to (for exact signatures).
3. `src/tests/*` coverage (avoid duplicate specs).
4. `src/fixtures/index.ts` (existing fixtures) and `src/config/index.ts` (`env()` / `credentials()`).
5. `test-results/**/error-context.md`, traces, screenshots, existing `.playwright-cli` snapshots.

If a locator/method/fixture already exists → use it. Do not re-ask the user for evidence a
prior validated screen already proves.

## Step 2 — Evidence-based locators (@playwright/cli)
For any NEW or CHANGED locator:
1. Read the requirement and any provided snapshot/screenshot.
2. `playwright-cli open <url>` → navigate/authenticate to the target screen.
3. `playwright-cli snapshot` → read the real element refs.
4. Save those refs as semantic locators in the Page Object (single source of truth).
5. Use ONLY those saved Page Object locators in the Module and Spec.

If no evidence exists for the screen: STOP — capture via `playwright-cli` if reachable, or ask
the user to paste a snapshot. Never guess a locator. This gate applies to locators only — not
to test data, assertions, renames, or timing.

## Step 3 — Build across the 3 layers
- **Page (`src/pages/[Feature]Page.ts`)** — locators + locator helpers ONLY. Format:
  `elementName = () => this.page.getByRole(...)`. No business logic, no assertions.
- **Module (`src/modules/[Feature]Module.ts`)** — workflows: sequences of Page calls with
  `Logger.step()`. `Actions` for every interaction; `WorkflowActions` for reusable multi-step
  flows; `WaitHelper` for generic waits. No raw `page.locator()`, no assertions.
- **Spec (`src/tests/[domain].spec.ts`)** — `test.describe()` with `@Tags`, calls module
  methods, holds the `expect` assertions, uses fixtures from `src/fixtures/index.ts`.
  **SPEC-FILE NAMING = DOMAIN, NEVER A SINGLE SCENARIO.** Name the file after the functional
  domain/feature it covers (`pqr.spec.ts`, `dpr.spec.ts`, `case-search.spec.ts`) so every scenario
  for that domain lives together — NEVER encode one test case in the filename (no
  `pqr-single-vin-submit.spec.ts`). Use a `describe` title that spans all cases (e.g.
  `PQR Create & Validation Flows`). Split into `[domain]-[capability].spec.ts` (e.g.
  `ftr-create-submit.spec.ts`, `ftr-vin-validation.spec.ts`) ONLY when a domain grows large or
  covers clearly distinct sub-flows.
  **GROUP BY PAGE/MODULE:** a case that fits an EXISTING domain's spec is added there as a new
  `test()` — do NOT create a new file. Same page/module + same entry flow → ONE spec, many
  `test()` blocks in a shared `describe`. Separate files only for a different module (never mix
  FTR/PQR/TAS), a long cross-screen journey, or different fixtures/roles/global-setup.

Register new Page/Module fixtures in `src/fixtures/index.ts` (and the relevant barrel).

## Step 4 — Keep code short & wrapper-driven
- One action = one line; methods ~5–15 lines, single responsibility.
- One wait, then act (loader hidden) — no stacked speculative `.catch()` waits.
- No speculative fallbacks/force-clicks/`evaluate()` hacks unless a captured run proves them needed.
- Promote any repeated/complex block (date pickers, loader waits, dropdowns, login chains) into
  `Actions` / `WaitHelper` / `WorkflowActions` / a dedicated helper the FIRST time — never copy-paste.
- Parameterize variants (Yes/No, Save/Submit) with a typed default param — never write twin methods.
- **File uploads / attachments:** put files in `src/testdata/attachments/` and reference them with
  `attachmentPath('<file-name>')` (from `../utils`). Upload via `Actions.uploadViaFileChooser(browseBtn, path)`
  (clicks the visible Browse control + handles the OS file chooser — required for hidden inputs behind a
  button). Keep the split: Browse-button + uploaded-row locators in the Page, an `uploadAttachment(fileName)`
  workflow that returns `true` once the file is listed in the Module, the assertion in the Spec.
- Locator standard: Tier 1 single strategy by default; a fallback needs a `// reason:`; max 3
  strategies; collections use plain Playwright locators (not `SmartLocator`). Full rules in README.
- Never hardcode timeouts/data/credentials: use `TIMEOUTS`, `testData.json`, `credentials()`/`env()`.

## Step 5 — Verify & track (definition of done)
1. `npx playwright test <new-spec> --project=desktop-chrome` → passes.
2. Full suite shows zero regressions; fix before reporting done.
3. `npm run lint` → 0 problems AND `npx tsc --noEmit` → 0 errors.
4. `capabilities.json` auto-refreshes on every `playwright test` (globalSetup); run
   `npm run index` to refresh without running tests.
5. **Sauce registry sync (MANDATORY for a NEW or RENAMED spec file):** add/rename the matching
   `saucectl.yml` suite (`name: <spec-basename>-$TEST_ENV` + `testMatch: - <spec-basename>\.spec\.ts$`)
   in the SAME change — an unregistered spec cannot run on Sauce. Verify with
   `npm run test:sauce:uat -- --dry-run`. (Suite name = basename minus `.spec.ts`, never the filename.)
6. Update **README → "Reuse Index (Capabilities)"** by hand with the new Page/Module/Spec/fixture.

## Batch mode
For multiple scenarios: group related ones (same screen/flow family) to maximize reuse, one
spec per **domain** (`[domain].spec.ts`), one `test()` per scenario. Cases for the SAME
page/module belong in the SAME domain spec file (add to an existing domain's spec if one already
exists) — never one-file-per-case. Renaming a spec renames its Sauce suite
(`<spec-basename>-<TEST_ENV>`), so update `saucectl.yml` + README references when you rename.
In the plan, list which scenarios reuse existing assets vs. need new ones, which spec file each
case lands in, and the wave number (e.g. "Wave 1 of 3: scenarios 1–5").
