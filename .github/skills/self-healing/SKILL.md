---
name: self-healing
description: Understand and apply the framework's runtime self-healing (SmartLocator) and healing telemetry. USE FOR adding or auditing SmartLocator fallback chains, reading SELF_HEALING_REPORT.md or self-healing.json, hardening flaky locators, or proposing a CI healing-ratio guard. Explains how the healing engine (SmartLocator), the per-test fixture session, and AiDebugReporter integrate to lower flakiness and speed up failure triage. DO NOT USE FOR general new-test creation or full failure triage (use debug-failure).
version: 1.0.0
author: Moreshwar Landge
license: MIT
testingTypes: [e2e]
frameworks: [playwright]
languages: [typescript]
domains: [web]
---

# Skill: Self-Healing (SmartLocator) & Telemetry

Operational guide for the framework's self-healing layer. Architecture and the full locator
standard live in [README.md](../../README.md); this skill is the how-to.

## What is implemented
- **Engine — `src/utils/SmartLocator.ts`:** tries locator strategies in priority order, falls
  back automatically if the primary fails, and captures strategy-level telemetry (attempts,
  events, durations) tagged with test/project session context.
- **Lifecycle — `src/fixtures/index.ts`:** starts a healing session per test, captures events
  during the run, and attaches machine-readable healing artifacts to the Playwright results.
- **Reporting — `src/utils/AiDebugReporter.ts`:** writes to `ai-debug-report/` (gitignored
  locally, uploaded as a CI artifact): `DEBUG_REPORT.md` (failures + AI-healable categories),
  `SELF_HEALING_REPORT.md` (healing telemetry summary), `self-healing.json` (dashboards/CI).

## Using SmartLocator in Pages/Modules
```ts
import { SmartLocator } from '../utils/SmartLocator';

const submitButton = await SmartLocator.resolve('Submit Button', [
  { name: 'role',   locator: page.getByRole('button', { name: /submit|save/i }) },
  { name: 'testid', locator: page.getByTestId('submit-btn') },
  { name: 'css',    locator: page.locator('form button[type="submit"]') }, // reason: icon-only fallback
]);

await submitButton.click();
```

## Strategy rules (keep chains lean)
1. Default to ONE strategy (Tier 1). A fallback is the exception, not the rule.
2. Max 3 strategies total; every fallback needs a concrete `// reason:` comment.
3. Semantic locators first (`getByRole`, `getByLabel`, `getByText`).
4. CSS/XPath only as the last fallback (icon-only / structural scoping).
5. No two fallbacks of the same handle type; no "just in case" fallbacks.
6. Reuse the same strategy order across environments.
7. `SmartLocator` is for SINGLE elements only — collections use plain Playwright locators.

Full standard: README → **"Locator Standard"**.

## Workflow during failures
1. Run tests (or download the CI artifact): `npm test`.
2. Open `ai-debug-report/DEBUG_REPORT.md` and `SELF_HEALING_REPORT.md`.
3. Fix via the **debug-failure** skill, keeping SmartLocator fallback chains intact.
4. Re-run the failed scope: `npx playwright test <spec> --grep "<test name>"`.

## Hardening ideas (apply selectively)
- Built-in Playwright trace viewer — first line of diagnostics (already enabled).
- Consume `self-healing.json` in a CI dashboard for fragility trends.
- `axe-playwright` for accessibility regressions that correlate with unstable locators.
- Slack/Teams webhook to alert when healing count spikes.
- A CI guard that fails the build when the healing ratio exceeds a threshold (e.g. >30%) to
  force locator cleanup.
