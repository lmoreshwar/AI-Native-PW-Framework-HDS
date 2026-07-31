---
name: debug-failure
description: Analyze and fix failing Playwright tests using run artifacts and framework rules. USE FOR a failing spec, a DEBUG_REPORT.md, a trace or error-context, or flaky tests that need triage. Enforces category-based triage (Locator Change, Script Issue, UI Bug, Environment Issue, Unknown), evidence-first locator fixes via the failed run's error-context, SmartLocator healing, wrapper-first repairs, and verify-after-fix with zero regressions. DO NOT USE FOR writing new tests (use new-automation) or non-failure refactors (use modify-test).
version: 1.0.0
author: Moreshwar Landge
license: MIT
testingTypes: [e2e]
frameworks: [playwright]
languages: [typescript]
domains: [web]
---

# Skill: Debug & Fix Failing Playwright Tests

Triage and repair failures from existing evidence. Rules from
[AGENT.md](../../AGENT.md) and [README.md](../../README.md).

Primary inputs (read these first): `ai-debug-report/DEBUG_REPORT.md`,
`ai-debug-report/SELF_HEALING_REPORT.md`, and the failed run's
`test-results/**/error-context.md` / trace / screenshot.

There are **two producers** of `ai-debug-report/DEBUG_REPORT.md` — know which one you're reading:

**A. Local run** (`AiDebugReporter`, live Playwright reporter) — a **triage-first** report with three
sections: **🧭 Where to look first** (category distribution + auto-fixable / app-infra / manual split),
**🧩 Root Causes** (failures clustered by shared error signature, sorted by blast radius — fix one
group, clear many), and **📋 All Failures** (one lean row each). `ai-debug-report/results.json` carries
the full fields (`category`, `confidence`, `confidenceLabel`, `signals`, `secondaryCategory`).

**B. Sauce cloud run** (`scripts/aggregate-debug-report.mjs`, runs automatically after `npm run
test:sauce*`) — on Sauce every test is its **own job/VM**, so this aggregator **overwrites**
`DEBUG_REPORT.md` with a deliberately **lightweight, failures-only** combined report covering ALL
jobs. Layout: header counts → **🧩 Root causes** (clustered) → **🤖 Copilot-fixable** (Locator/Script)
→ **🧑 Needs human — likely product bug / infra** (UI Bug/Env/Perf/Unknown). Each failure is ~4 lines:
`title` + `spec:line`, `category · % · element (tried strategies)`, one-line error, one-line fix, and a
**pointer** to that test's `error-context.md` + Sauce job link. It does NOT inline the page snapshot —
open the linked `error-context.md` when you need the aria snapshot to fix a locator. The full,
machine-readable detail (full error, last-actions, snapshot excerpt, evidence, `fixable`/`owner`/
`recommendedAction`) lives in **`ai-debug-report/sauce-results.json`**.

For BOTH: start from the Root Causes / clustered groups — fix the biggest group first. Use each row
as the starting hypothesis; do NOT re-derive from scratch. The lightweight Sauce report is built so
you can act from the `spec:line` + error + fix line alone, only opening `error-context.md` /
`sauce-results.json` for locator evidence or deeper context.

## Gate 0 — Plan + approval (MANDATORY)
1. Provide a fix plan FIRST (what changes and why). 2. Wait for approval. 3. Only then fix.

Compliance references (README): **Anti-Hallucination Rules**, **@playwright/cli Locator
Workflow**, **Locator Standard**. Don't invent. Unclear → "Insufficient information to determine."

## Step 1 — Debug-first reuse discovery
1. `.ai-memory/capabilities.json` FIRST (reuse index).
2. Only the referenced failing spec/module/page the index points to.
3. The failed run artifacts: `error-context.md`, trace, screenshot, console/log output.
4. Existing `.playwright-cli` snapshots for that screen.
Reuse validated evidence before asking the user for more.

## Step 2 — Snapshot gate (only for locator fixes)
Before changing any locator you MUST have UI evidence for the failing screen — the
`error-context.md` from the failed run is preferred. No evidence → STOP, capture via
`playwright-cli` or ask the user. First distinguish app-flakiness from a real bug: if a
known-flaky anchor failed transiently, retry before changing locators.

## Step 3 — Confidence-driven triage (commit to ONE category)

Turn the reporter's category + confidence into a **single** precise verdict. **Never hedge with
"could be A or B"** unless the evidence is genuinely balanced (reporter marked it 🔴 Low with a
`secondaryCategory`) — and even then, name the ONE artifact that resolves it.

**Confidence protocol (batch of failures — triage High→Low):**
- 🟢 **High (≥80%)** — trust the category. Act on it directly; a quick artifact glance only to confirm.
- 🟡 **Medium (55–79%)** — trust it, but open the `error-context.md`/trace to confirm the top signal before editing code.
- 🔴 **Low (<55%)** — the reporter is unsure. Open the trace + screenshot + error-context and DECIDE. Only after reading evidence, state the final category. If truly 50/50, report exactly: *"X vs Y — resolved by <specific artifact/line>."*

**Decision tree (evidence overrides a low-confidence guess):**
1. Error text has `strict mode` / "resolved to N elements" → **Script Issue** (selector matches many → add `.first()` or tighten it).
2. JS runtime error (`is not a function`, `cannot read properties`, `TypeError`) → **Script Issue** (fix module/spec logic).
3. `net::err_`, `ECONNREFUSED`, navigation timeout, 502/503/504, `target closed` → **Environment Issue** (do NOT fix code; retry when stable).
4. SmartLocator "all strategies failed" OR "waiting for locator/getBy…" timeout OR "not found" → **Locator Change** → snapshot gate (Step 2) → fix the PRIMARY locator to match reality.
5. `expected: … received: …` / `toHaveText|Value|Count` mismatch on an element that WAS present → **UI Bug** (app changed — do NOT fix the test; report it). EXCEPTION — a **bare boolean** assertion (`Expected: true / Received: false`, i.e. `toBe(true/false)`) is NOT a UI-Bug signal: it just means a Module/helper returned a boolean, most often a **fragile matcher** (e.g. `getByText(exact:true)` vs a combined string), **changed test data**, or a **timing gap**. Open the `error-context.md` page snapshot: if the expected content IS present on the page, it's a **Script Issue** (fix the matcher/wait/data in the Page or Module), not a UI Bug. Only a mismatch of **concrete values** (e.g. `"ES 250"` vs `"ES 350"`) is a real UI Bug.
6. "Test timeout … exceeded" / `networkidle` / near-budget duration with NO missing element → **Performance Issue** (investigate app/network; never mask with a bigger timeout).
7. None of the above → **Unknown** → read trace/screenshot/console; classify if identifiable, else report what's missing.

### Category → action
- **🔗 Locator Change:** focused impact analysis (exact failing locator, all usages, affected
  tests) → `playwright-cli snapshot` to find the real element → fix the PRIMARY locator to match
  reality (Tier 1; fallback only with `// reason:`; max 3, no duplicates) → re-run.
- **📝 Script Issue:** read error + trace → fix logic in Module or Spec → re-run.
- **🐛 UI Bug:** do NOT fix. Report: "Application bug, not a test issue."
- **🌐 Environment Issue:** do NOT fix. Report: "Environment was down — retry when stable."
- **🐢 Performance Issue:** do NOT mask with a longer hardcoded timeout. Report the slow step/page and the app/network cause; suggest the right `WaitHelper` wait if a bad wait is the cause.
- **❓ Unknown:** investigate trace/screenshot/console; fix if identifiable, else report.

## Step 4 — Wrapper-first repair & SmartLocator
- Keep specs thin — never patch a failure by adding raw Playwright into a spec.
- Prefer `Actions` (interactions), `WorkflowActions` (repeated flows), `WaitHelper` (generic
  waits). Raw Playwright only for justified low-level cases, localized, with a reason comment.
- For recurring DOM drift, add a `SmartLocator.resolve('Name', [...])` fallback chain (single
  elements only) so the test self-heals; keep it within the Tier limits in the Locator Standard.
- **Failing file upload / attachment:** if an upload step silently uploaded nothing (filename never
  appeared), the app likely hides the real `<input type="file">` behind a Browse button — a direct
  `setInputFiles` is ignored. Fix by routing through `Actions.uploadViaFileChooser(browseBtn, path)`
  (clicks the visible control + handles the OS file chooser). Keep files in
  `src/testdata/attachments/` referenced via `attachmentPath('<file-name>')`; verify by the filename
  appearing in the uploaded-files list, not by the input's value. Fix inside the Module's
  `uploadAttachment` — never patch the spec with raw upload calls.

## Step 5 — Verify after fix
1. Run only the failing test: `npx playwright test <spec> --grep "<test name>"`.
2. Run the full suite → zero regressions.
3. `npm run lint` + `npx tsc --noEmit` clean.
4. Update README's reuse index if structure changed.
