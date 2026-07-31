---
name: visual-testing
description: Add Sauce Visual regression coverage to Playwright tests as an ADDITIVE layer on top of an already-automated functional flow. USE FOR adding a visual snapshot to an existing/just-written spec, masking run-to-run dynamic data with ignoreRegions, capturing a true full-page snapshot on inner-scroller SPAs, or auditing/re-baselining a Sauce Visual build. Enforces functional-first ordering, the VISUAL=1 opt-in gate (isVisualEnabled), the 3-layer split for visual helpers, and value-only masking that keeps labels/layout compared. DO NOT USE FOR writing the functional test itself (use new-automation), changing locators (use modify-test), or triaging a functional failure (use debug-failure). DO NOT introduce toHaveScreenshot, Applitools, or Percy — this framework uses Sauce Visual only.
version: 1.0.0
author: Moreshwar Landge
license: MIT
testingTypes: [visual, e2e]
frameworks: [playwright]
languages: [typescript]
domains: [web]
---

# Skill: Add Sauce Visual Testing to a Spec

Layer visual regression coverage onto an existing functional test using the repo's **Sauce Visual**
integration, obeying [AGENT.md](../../AGENT.md) and [README.md](../../README.md). Visual checks are
**additive and opt-in** — they must never change, gate, or slow a normal functional run.

## Golden rule — functional first, visual second
Automate and stabilize the functional flow FIRST (use `new-automation`). Only once the spec
passes deterministically do you add a visual snapshot — as the LAST `test.step` of that same test,
reusing the values/state the functional steps already produced. Never write a visual-only spec.

## Gate 0 — Plan + approval (MANDATORY)
1. Provide an implementation plan FIRST (which spec, what gets snapshotted, what gets masked).
2. Wait for explicit user approval.
3. Only after approval, write code.

Anti-hallucination still applies: never invent locators, regions, or behavior. If you cannot name
the dynamic values to mask, say "Insufficient information to determine" and ask.

## What this framework uses (do NOT substitute)
- SDK: `@saucelabs/visual-playwright` (`sauceVisualCheck`) + `@saucelabs/visual` — already devDeps.
- Opt-in gate: `isVisualEnabled()` from `src/utils` = `VISUAL` truthy (`1`/`true`/`yes`) **AND**
  `SAUCE_USERNAME` + `SAUCE_ACCESS_KEY` present. Visual is OFF by default; every CI/functional run
  is unaffected.
- Lifecycle: `global-setup.ts` / `global-teardown.ts` create + finish the Sauce Visual build, both
  already gated by `isVisualEnabled()`. **Do not touch these unless the gate logic itself changes.**
- 🚫 Never add `expect(page).toHaveScreenshot()`, Applitools, Percy, or local PNG baselines. They are
  not part of this framework and would fork the baseline source of truth.

## Step 1 — Reuse-first discovery
Mine existing assets before adding anything (same order as `new-automation`):
1. `.ai-memory/capabilities.json` — check for existing visual helpers FIRST.
2. The reference implementation: [ftr-case-view-verification.spec.ts](../../src/tests/ftr-case-view-verification.spec.ts)
   (additive visual `test.step`) + `FtrCaseViewModule.prepareFullPageCapture()` and
   `getDynamicVisualIgnoreRegions()` — copy this PATTERN, reuse the helpers when the screen matches.
3. `src/utils/visual.ts` (`isVisualEnabled`) and the page/module for the target screen.

If a visual helper for the screen already exists → reuse it; do not re-derive ignore regions.

## Step 2 — Place the snapshot (Spec layer)
Add a `test.step('Capture Sauce Visual snapshot …')`. **STANDARD pattern — every snapshot uses
reversible full-page capture** (release inner scrollers + grow viewport, then restore) so a scroll
bar never clips the image:
```ts
await test.step('Capture Sauce Visual snapshot of the <screen>', async () => {
    // For a snapshot at the END of the test you may use `test.skip(!isVisualEnabled(), ...)`.
    // For a snapshot INTERLEAVED mid-flow, use an early return so later functional steps still run:
    if (!isVisualEnabled()) { return; }
    await <module>.prepareFullPageCapture();            // STANDARD: full-capture every screen
    const ignoreRegions = await <module>.getDynamicVisualIgnoreRegions();
    await sauceVisualCheck(page, testInfo, '<Stable Snapshot Name>', {
        captureDom: false,                             // see Step 4 — avoids huge-DOM upload timeouts
        screenshotOptions: { fullPage: true },
        ignoreRegions,
    });
    await <module>.restoreAfterFullPageCapture();       // STANDARD: undo viewport for later steps
});
```
- Gate keeps the functional assertions running when VISUAL is off (`test.skip` at the end of a test,
  or `if (!isVisualEnabled()) return;` for an interleaved mid-flow snapshot — `test.skip` would abort
  the remaining functional steps).
- Snapshot **name** is the baseline key — keep it stable and descriptive (`'FTR Case View - Full Page'`).
  Renaming it orphans the approved baseline.
- `sauceVisualCheck` is the ONLY raw SDK call allowed in a spec (it is an assertion-tier action).

## Step 3 — Compute masks in the Module (value-only, labels kept)
Region computation = workflow logic → it lives in the **Module**, returning `VisualIgnoreRegion[]`
(`{ x, y, width, height }`, NOT Playwright Locators). Locators come from the **Page**. Mirror
`getDynamicVisualIgnoreRegions()`:
- Mask only the run-to-run **dynamic VALUES** (IDs, status, timestamps, mileage, randomised inputs).
  Keep **labels and layout** in the comparison so real UI changes still fail the diff.
- Scroll to top first so each `boundingBox()` is in document coordinates that match the full-page image.
- Skip null/zero/off-screen boxes so a missing field never breaks the run.
- Use the helper geometry style already present (`wholeRegion`, `valueRightOfLabel`, `valueBelowLabel`)
  rather than hand-coding coordinates.

> Over-masking hides regressions; under-masking causes false diffs. Mask the value, never the label.

## Step 4 — Full-page capture is the STANDARD (reversible) (VERIFIED)
Many SPA screens scroll inside a fixed-height flex/`100vh` container, so the document stays one
viewport tall and native `fullPage:true` CLIPS the content (you see only the first screen, not the
scrolled-below part). **Therefore every snapshot calls `prepareFullPageCapture()` BEFORE computing
regions + snapshot, and `restoreAfterFullPageCapture()` AFTER.** Prep (1) releases real scroll
containers (`overflow:visible; height:auto; max-height:none`) and (2) grows the viewport to the
measured content height (cap 20000); restore puts the original viewport back so later wizard steps
interact with the normal layout. Compute ignore regions AFTER prep so `boundingBox()` coordinates
match the tall full-page image. Both methods live in the **Module** — never inline `evaluate()` hacks
in the spec.

- **`captureDom: false` is the standard** once a page is grown to full height: the expanded DOM is
  large and its `.html` upload can overrun the Sauce upload timeout. The full-page **pixel**
  comparison is the baseline we need; DOM capture is not required.
- If a module has no full-capture helper yet, add `prepareFullPageCapture()` +
  `restoreAfterFullPageCapture()` (save viewport on prep, reset on restore) mirroring `TASModule`.

## Step 5 — Run, review, baseline
- Local/Sauce run:
  `$env:TEST_ENV="uat"; $env:VISUAL="1"; npm run test:sauce -- --select-suite <suite>`
  (`saucectl.yml` forwards `VISUAL`/`SAUCE_*`; `.sauceignore` must NOT exclude `node_modules`).
- Builds appear under **Visual Testing → Builds**; approved baselines under **Baselines**
  (filter Project=`PWAF` + Branch). Baseline is keyed by name + browser + OS + viewport + project + branch.
- **Human review gate:** a visual diff is a *candidate* change — a person approves/rejects in the Sauce
  UI. Never auto-accept. Re-baseline deliberately when the Chrome version changes (local vs Sauce VM
  drift causes benign noise).

## Step 6 — Verify & track (definition of done)
1. Functional run with VISUAL **off** still passes and is unchanged (visual step skips cleanly).
2. `npm run lint` → 0 problems AND `npx tsc --noEmit` → 0 errors.
3. With `VISUAL=1`, the Sauce build is created and the snapshot uploads under the right Project/Branch.
4. Update **README → "Reuse Index (Capabilities)"** and run `npm run index` when you add a new visual
   module method, so the capabilities map stays authoritative.

## Hard rules (visual-specific)
- ❌ No visual-only specs · ❌ no `toHaveScreenshot`/Applitools/Percy · ❌ no raw `sauceVisualCheck`
  region math or `evaluate()` in a spec (only the single `sauceVisualCheck` call) · ❌ no masking of
  labels or whole layouts · ❌ no editing `.env`, `global-setup/teardown`, or the gate to "force" a run.
- ✅ Additive, opt-in, gated · ✅ regions/prep in the Module · ✅ locators in the Page · ✅ stable
  snapshot names · ✅ value-only masking · ✅ human baseline approval · ✅ reversible full-page
  capture (`prepareFullPageCapture()` + `restoreAfterFullPageCapture()`) on EVERY snapshot so a
  scroll bar never clips the image · ✅ `captureDom: false` on grown full-page snapshots.
