# 🚀 Playwright AI Automation Framework

The single source of truth for this framework. Everything a QA engineer needs — setup,
architecture, every command (local, Sauce Labs, UI, debug), coding rules, CI, and AI usage — is here.

> **App under test:** Web application (`https://app.example.com`, `qa`, `dev`)
> **Stack:** Playwright + TypeScript · `@playwright/cli` for locator discovery · Sauce Labs cloud · Sauce Visual (opt-in) · GitHub Copilot agent

---

## 📑 Table of Contents

1. [Quick Start](#-quick-start)
2. [Environments & Secrets](#-environments--secrets)
3. [Command Cheat Sheet](#-command-cheat-sheet) ← all run commands
4. [Debug & UI Mode Explained](#-debug--ui-mode-explained)
5. [Sauce Labs Execution](#-sauce-labs-execution)
6. [Visual Testing (Sauce Visual)](#-visual-testing-sauce-visual)
7. [Project Structure](#-project-structure)
8. [3-Layer Architecture](#-3-layer-architecture)
9. [Locator Standard](#-locator-standard)
10. [Wrapper APIs (Actions / WaitHelper / WorkflowActions)](#-wrapper-apis)
11. [Coding Rules & Merge Gate](#-coding-rules--merge-gate)
12. [@playwright/cli Locator Workflow](#-playwrightcli-locator-workflow)
13. [Reports & Failure Triage](#-reports--failure-triage)
14. [Reuse Index (Capabilities)](#-reuse-index-capabilities)
15. [AI Agent Usage (Copilot)](#-ai-agent-usage-copilot)
16. [Workflow Examples (Copilot)](#-workflow-examples-copilot)
17. [CI / GitHub Actions](#-ci--github-actions)
18. [Anti-Hallucination Rules](#-anti-hallucination-rules)

---

## ⚡ Quick Start

```bash
npm install
npx playwright install

# copy the template and fill in your local credentials (never commit .env)
cp .env.example .env.uat

# run one spec against UAT with a visible browser
npx cross-env TEST_ENV=uat playwright test src/tests/create-case.spec.ts --project=desktop-chrome --headed

# open the last report
npm run test:report
```

---

## 🔐 Environments & Secrets

Credentials and URLs live in **`.env.<env>` files only** — never in code, specs, or `testData.json`.

| File | Used when |
|---|---|
| `.env.qa` | `TEST_ENV=qa` (default) |
| `.env.uat` | `TEST_ENV=uat` |
| `.env.dev` | `TEST_ENV=dev` |
| `.env.example` | committed template (placeholders only) |

`.env`, `.env.*`, `.ai-memory/`, `.recovery/`, and all reports are gitignored. **Only `.env.example` is committed.**

**Read values in code:**

```typescript
import { env, credentials } from '../config';

credentials('app')   // { username, password } from APP_USERNAME / APP_PASSWORD
credentials('ftr')   // FTR_APP_USERNAME / FTR_APP_PASSWORD
credentials('dpr')   // DPR_APP_USERNAME / DPR_APP_PASSWORD
credentials('pqr')   // PQR_APP_USERNAME / PQR_APP_PASSWORD
env('APP_BASE_URL')   // any other .env value
```

**Required keys** (per environment — also the GitHub repository secrets checklist for CI):

```
APP_BASE_URL           APP_USERNAME      APP_PASSWORD
SAUCE_USERNAME         SAUCE_ACCESS_KEY  SAUCE_URL
FTR_APP_USERNAME       FTR_APP_PASSWORD  (if FTR flows run)
DPR_APP_USERNAME       DPR_APP_PASSWORD  (if DPR flows run)
PQR_APP_USERNAME       PQR_APP_PASSWORD  (if PQR flows run)
```

> `TEST_ENV` selects the `.env` file. If unset, it defaults to `qa`.

---

## 🧾 Command Cheat Sheet

`TEST_ENV` controls the environment (`qa` default). Add `--headed` to watch the browser, `--project=<name>` to pick a browser.

### Install / setup
```bash
npm install                     # install dependencies
npx playwright install          # install browsers
npm run cli:install             # install @playwright/cli globally
```

### Run the whole suite
```bash
npm test                        # all specs, qa, headless
npm run test:headed             # all specs, visible browser
npm run test:qa                 # all specs against qa
npm run test:uat                # all specs against uat
npm run test:dev                # all specs against dev
```

### Run ONE spec (most common)
```bash
# default (qa, headless)
npx playwright test src/tests/create-case.spec.ts

# headed
npx playwright test src/tests/create-case.spec.ts --headed

# specific browser
npx playwright test src/tests/create-case.spec.ts --project=desktop-chrome

# UAT + headed + chrome  (typical local debugging run)
npx cross-env TEST_ENV=uat playwright test src/tests/create-case.spec.ts --project=desktop-chrome --headed
```

### Run ONE test by name (inside a spec)
```bash
npx playwright test src/tests/verify-case-creator.spec.ts -g "Creator name"
npx cross-env TEST_ENV=uat playwright test src/tests/verify-case-creator.spec.ts -g "Creator name" --project=desktop-chrome --headed
```

### Run by tag
```bash
npm run test:smoke              # @Smoke
npm run test:regression         # @Regression
npm run test:p0                 # @P0
npx playwright test --grep @Regression
npx cross-env TEST_ENV=uat playwright test --grep @Regression --project=desktop-chrome
```

### Run by browser / device
```bash
npm run test:chromium           # desktop-chrome
npm run test:firefox            # desktop-firefox
npm run test:webkit             # desktop-safari
npm run test:edge               # desktop-edge
npm run test:mobile             # mobile-chrome + mobile-safari
npm run test:tablet             # tablet-chrome
```

### Debug / inspect (see next section for what they do)
```bash
npm run test:debug              # Playwright Inspector (step through)
npm run test:ui                 # Playwright UI mode (time-travel)
npm run test:ui:uat             # UI mode against uat
npm run test:report             # open the last HTML report
```

### Sauce Labs (cloud)
```bash
npm run test:sauce              # cloud run, current TEST_ENV
npm run test:sauce:qa           # cloud run, qa
npm run test:sauce:uat          # cloud run, uat
npm run test:sauce:dev          # cloud run, dev
npm run test:sauce:uat -- --dry-run   # preview the parallel plan, run nothing

# run ONE test (single suite) on the cloud — suite name = <spec-basename>-<TEST_ENV>
npm run test:sauce:uat -- --select-suite create-case-uat
```

### Visual testing (Sauce Visual — opt-in, OFF by default)
```bash
# enable with VISUAL=1 + Sauce creds; adds a gated visual test.step (PowerShell)
$env:TEST_ENV="uat"; $env:VISUAL="1"; npm run test:sauce -- --select-suite ftr-case-view-verification-uat
npm test                        # normal run — all visual steps skip automatically
```

### Quality gate (must pass before done)
```bash
npm run lint                    # eslint  → 0 problems
npx tsc --noEmit                # types   → 0 errors
npm run lint:fix                # auto-fix lint
npm run format                  # prettier write
npm run index                   # regenerate .ai-memory/capabilities.json
```

### @playwright/cli (locator discovery)
```bash
npm run cli:open                # open the app headed
npm run cli:snapshot            # accessibility snapshot with element refs
```

---

## 🐞 Debug & UI Mode Explained

### `npm run test:debug` — Playwright Inspector
Launches the **Playwright Inspector**: the browser opens, execution **pauses on the first action**, and you step through the test one action at a time.

- **Use it for:** understanding *why* a step fails, watching each locator resolve, trying selectors live.
- **What you can do:** Step over each action, resume/pause, see the **exact locator** Playwright is using highlighted on the page, and use the **"Pick locator"** tool to hover an element and get a suggested locator.
- **Single spec:** `npx playwright test src/tests/ftr-create-submit.spec.ts --debug`

### `npm run test:ui` — UI Mode (time-travel)
Opens Playwright's **UI Mode**: a visual runner with a list of tests, a timeline, and **time-travel snapshots** of the DOM before/after every action.

- **Use it for:** exploring a suite, re-running individual tests, scrubbing the timeline to see the page state at each step, inspecting network/console per action.
- **Best day-to-day tool** for authoring and triaging because you can watch, re-run, and inspect without a full headless run.

### `--headed`
Not a debugger — just runs the test at full speed with the **browser visible**. Use it to eyeball a flow; use `--debug` or UI mode when you need to stop and inspect.

| Command | Pauses? | Best for |
|---|---|---|
| `--headed` | No | Watching a run at full speed |
| `test:debug` (`--debug`) | Yes, per action | Stepping through, picking locators |
| `test:ui` | Re-runnable | Authoring + time-travel triage |

---

## ☁️ Sauce Labs Execution

Cloud runs are driven by [saucectl.yml](saucectl.yml).

- Runner: **Playwright**, platform **Windows 11**, project `desktop-chrome`
- Headed on the VM so Live View + video show the real browser
- **Parallel via `numShards: 3`** (Playwright native sharding `--shard=i/N`); keep `numShards` and `sauce.concurrency` equal to scale
- Groups jobs under one build: `PWAF-<env>-<BUILD_TAG>`, artifacts download to `test-results/sauce`
- Passes `TEST_ENV`, `BASE_URL`, `APP_USERNAME`, `APP_PASSWORD` into the run
- **Auto-synced suites:** `scripts/run-sauce.js` rewrites `saucectl.yml` so every `*.spec.ts` becomes its own suite named `<spec-basename>-<TEST_ENV>` — new specs run on the cloud with no manual `saucectl.yml` edits

```bash
export SAUCE_USERNAME=<your-sauce-username>
export SAUCE_ACCESS_KEY=<your-sauce-access-key>
npm run test:sauce:uat            # run on cloud against uat
npm run test:sauce:uat -- --dry-run   # preview shard plan only
npm run test:sauce:uat -- --select-suite create-case-uat   # run a SINGLE test on the cloud
```

Each shard is its own Sauce job with its own Live View, video, and pass/fail. The terminal prints a job link per shard: `https://app.saucelabs.com/tests/<job-id>`.

### Run a single test on Sauce

Every spec is auto-registered as a Sauce suite named **`<spec-basename>-<TEST_ENV>`** (e.g. `pqr-uat`). Pass `--select-suite <name>` through to `saucectl` to run just that one:

```bash
# single functional test on UAT
npm run test:sauce:uat -- --select-suite pqr-uat

# single test with Sauce Visual enabled (PowerShell)
$env:TEST_ENV="uat"; $env:VISUAL="1"; npm run test:sauce -- --select-suite ftr-case-view-verification-uat
```

> Suite names follow the spec file name (drop `.spec.ts`, append `-<TEST_ENV>`). Run `npm run test:sauce:uat -- --dry-run` to list the exact suite names available.

---

## �️ Visual Testing (Sauce Visual)

Visual regression is an **additive, opt-in** layer on top of an already-passing functional test — it
never changes or slows a normal run. It uses **Sauce Visual** (`@saucelabs/visual-playwright`), not
local screenshots, Applitools, or Percy.

### How it works
- **Gate:** visual checks run only when `VISUAL` is truthy (`1`/`true`/`yes`) **and** `SAUCE_USERNAME` +
  `SAUCE_ACCESS_KEY` are set. `isVisualEnabled()` (`src/utils/visual.ts`) enforces this; when off, the
  visual `test.step` is skipped and the functional assertions run untouched.
- **Lifecycle:** `global-setup.ts` / `global-teardown.ts` create and finish the Sauce Visual build (both gated).
- **Snapshot:** the spec's last `test.step` calls `sauceVisualCheck(page, testInfo, '<name>', { … })`.
- **3-layer split:** full-page prep + ignore-region geometry live in the **Module** (returns
  `VisualIgnoreRegion[]` = `{ x, y, width, height }`); locators stay in the **Page**; the single
  `sauceVisualCheck` call stays in the **Spec**.
- **Value-only masking:** mask only run-to-run dynamic VALUES (IDs, status, timestamps, randomised
  inputs) via `ignoreRegions` — labels and layout stay compared so real UI changes still fail.
- **Full-page on inner-scroller SPAs:** screens that scroll inside a fixed-height container need
  `prepareFullPageCapture()` (releases scroll containers + grows the viewport) before the snapshot,
  or native `fullPage` clips the content.
- **Full-page is the standard for EVERY snapshot:** each `sauceVisualCheck` is preceded by
  `prepareFullPageCapture()` and followed by `restoreAfterFullPageCapture()` (resets the viewport so
  later wizard steps lay out normally). Grown full-page snapshots use `captureDom: false` — the
  expanded DOM upload can overrun the Sauce upload timeout; the pixel baseline is what we compare.

### How to run
```bash
# UAT, visual enabled, single suite, on Sauce (PowerShell)
$env:TEST_ENV="uat"; $env:VISUAL="1"; npm run test:sauce -- --select-suite ftr-case-view-verification-uat

# locally (still needs Sauce creds — snapshots upload to the Sauce build)
$env:TEST_ENV="uat"; $env:VISUAL="1"; npx playwright test src/tests/ftr-case-view-verification.spec.ts --project=desktop-chrome
```
> `saucectl.yml` forwards `VISUAL` + `SAUCE_*`; `.sauceignore` must NOT exclude `node_modules` (the SDK is bundled).

### Review & baselines
- Builds appear in Sauce under **Visual Testing → Builds**; approved baselines under **Baselines**
  (filter Project=`PWAF`, Branch). A baseline is keyed by name + browser + OS + viewport + project + branch.
- A diff is a **candidate** change — a human approves/rejects it in the Sauce UI. Never auto-accept.
  Re-baseline deliberately when the Chrome version changes (local vs Sauce VM drift causes benign noise).
- Optional env `VISUAL_BRANCH` (defaults to `main`) sets the baseline branch.

Full playbook: the **visual-testing** skill (loads automatically when you ask to add a visual check).

---

## �📁 Project Structure

```
src/
├── config/index.ts        ← multi-env config + env()/credentials() helpers
├── fixtures/index.ts      ← Playwright fixtures (Page/Module DI) + popup handlers
├── pages/                 ← LAYER 1: locators ONLY
│   ├── LoginPage.ts  CaseSearchPage.ts  TASPage.ts  FTRPage.ts  UserHomePage.ts
│   ├── PqrPage.ts  FtrCaseViewPage.ts
├── modules/               ← LAYER 2: workflows + Logger.step()
│   ├── LoginModule.ts  CaseViewModule.ts  TASModule.ts  FTRModule.ts  UserHomeModule.ts
│   ├── PqrModule.ts  FtrCaseViewModule.ts
├── tests/                 ← LAYER 3: specs + assertions + @Tags
│   ├── create-case.spec.ts  case-search.spec.ts  filter-case-by-status.spec.ts
│   ├── verify-case-creator.spec.ts  update-case-status-save-submit.spec.ts
│   ├── watch-case.spec.ts  precall-worksheet.spec.ts
│   ├── ftr-create-draft.spec.ts  ftr-create-submit.spec.ts  ftr-vin-validation.spec.ts
│   ├── pqr.spec.ts
│   ├── ftr-case-view-verification.spec.ts  ← functional verify + opt-in Sauce Visual snapshot
├── testdata/testData.json ← non-secret test data (no credentials)
└── utils/                 ← Actions, WaitHelper, WorkflowActions, SmartLocator,
                              DatePickerHelper, Logger, AiDebugReporter,
                              RecoveryConsole, visual (isVisualEnabled), constants (TIMEOUTS), types

global-setup.ts            ← creates the Sauce Visual build when VISUAL=1 (gated)
global-teardown.ts         ← finishes the Sauce Visual build when VISUAL=1 (gated)

playwright.config.ts       ← projects + reporters (AiDebugReporter, html, json, list)
saucectl.yml               ← Sauce Labs cloud runner
.github/workflows/playwright.yml  ← GitHub Actions CI (local runner or Sauce Labs)
.github/copilot-instructions.md  ← always-on pointer to AGENT.md (applies in every chat)
.github/skills/            ← auto-loading workflow playbooks (new/modify/debug/self-healing/visual)
.github/agents/            ← Playwright Engineer agent definition
AGENT.md                   ← machine rulebook the AI agent loads (keep concise)
FRAMEWORK_HUB/
└── Automation_Inputs/     ← user stories, test cases, requirements (TAS/FTR inputs)
```

---

## 🏗️ 3-Layer Architecture

```
TESTS (src/tests/*.spec.ts)      → intent + assertions + @Tags. Keep thin.
  ↓ calls
MODULES (src/modules/*Module.ts) → orchestrate page actions + Logger.step(). NO assertions.
  ↓ calls
PAGES (src/pages/*Page.ts)       → locators + locator helpers ONLY. NO business logic, NO assertions.
```

**Hard rules:** no business logic in Pages · no assertions in Modules · no raw Playwright actions in specs.
**File naming:** `[Feature]Page.ts` · `[Feature]Module.ts` · `[feature].spec.ts`.

---

## 🎯 Locator Standard

**Priority:** `getByRole()` > `getByLabel()` > `getByPlaceholder()` > `getByText()` > `getByTestId()` > CSS

> Write ONE good locator. Add a fallback only when you can name a concrete reason it will break.

- **Tier 1 (DEFAULT, ~80%):** a single strategy, no fallback. Use whenever a stable role+name, label, or testid exists.
- **Tier 2:** primary + at most ONE fallback, which MUST have a `// reason:` comment.
- **Tier 3 (EXCEPTION, ≤3 strategies):** only for icon-only controls or the known-flaky list; state why.
- **Hard limits:** max 3 strategies; no two fallbacks of the same handle type; no "just in case" fallbacks; collections (≥2 elements) use PLAIN Playwright locators (not `SmartLocator`); no format/regex assumptions on domain data (DTC codes, case IDs). A locator with 4–6 strategies is a code smell — refactor it down.

---

## 🧰 Wrapper APIs

Use these wrappers instead of raw Playwright. `Actions` for interactions, `WaitHelper` for waits, `WorkflowActions` for multi-step flows.

### Actions — `src/utils/Actions.ts`
```typescript
import { Actions } from '../utils';
const actions = new Actions(page);
await actions.click(page.getByRole('button', { name: 'Search' }));
await actions.type(page.getByLabel('Case #'), 'TA241500045');
await actions.fill('input[name="vin"]', '58AD11D19MU001187', { clearFirst: true });
await actions.check('input[type="checkbox"][name="terms"]');
await actions.selectOption('select[name="region"]', 'US');
await actions.waitForVisible('[data-testid="toast-success"]');
await actions.waitForHidden('[data-testid="global-loader"]');
```
Also: `rightClick`, `doubleClick`, `hover`, `clear`, `blur`, `uncheck`, `dragAndDrop`, `uploadFiles`, `scrollIntoView`, `pressOn`, `press`.

### WaitHelper — `src/utils/WaitHelper.ts`
```typescript
import { WaitHelper } from '../utils';
const waitHelper = new WaitHelper(page);
await waitHelper.waitForPageReady();
await waitHelper.waitForUrlMatch(/\/tas\/case-view/i);
await waitHelper.waitForVisible(page.getByText(/case information/i));
await waitHelper.waitForHidden(page.locator('[role="progressbar"]'));
```
Pass non-default timeouts as `TIMEOUTS` constants — never a raw millisecond literal.

> **Never wait on network-idle in these apps.** The app MFEs poll the backend continuously, so
> `networkidle` never settles and silently burns the full timeout. Wait on the UI instead
> (`waitForActiveLoaderToClear`, a target element visible, or `waitForUrlMatch`/`waitForUrlContains`).
> `goto(..., { waitUntil: 'domcontentloaded' })` is fine.

### WorkflowActions — `src/utils/WorkflowActions.ts`
```typescript
import { WorkflowActions } from '../utils';
const workflowActions = new WorkflowActions(page);
await workflowActions.waitForLoadingToStabilize();
await workflowActions.clickMenuPath('[data-testid="hamburger"]', page.getByRole('menuitem', { name: 'TAS' }));
await workflowActions.searchWithOptionalSubmit(page.getByLabel('Case #'), 'TA241500045', page.getByRole('button', { name: 'Search' }));
const newTab = await workflowActions.clickAndWaitForNewTab(page.getByRole('link', { name: 'TA241500045' }));
```

Raw Playwright is allowed only for advanced cases (calendars, overlays, `evaluate()`, canvas) — kept at the lowest layer, never in specs, with a one-line reason comment. If a complex interaction recurs (date pickers, loader waits, dropdowns, login chains), extract it into the right shared helper the first time.

---

## 🧹 Coding Rules & Merge Gate

> **Definition of done:** `npm run lint` → 0 problems AND `npx tsc --noEmit` → 0 errors.

- **NEVER hardcode timeouts or magic numbers.** No raw ms literals (`30000`, `page.waitForTimeout(2000)`, `{ timeout: 15000 }`, `test.setTimeout(420000)`). Use `TIMEOUTS` in `src/utils/constants.ts` (`SHORT`, `MEDIUM`, `LONG`, `EXPECT`, `ACTION`, `NAVIGATION`, `TEST`, `TEST_LONG`) via `import { TIMEOUTS } from '../utils';`. If no value fits, add a named constant.
- **No hardcoded test data or credentials.** Data from `testData.json`; secrets from `.env` via `credentials()` / `env()`.
- **Keep tests declarative** — intent + assertions only; orchestration in modules; locators in pages.
- **Use the wrappers** — no raw `page.click()`/`waitForTimeout()` in modules; one action = one line; keep methods short (~5–15 lines).
- **Remove duplication** (same logic 2+ times) → extract to a shared helper.
- **ESM imports only** (no `require()`); **no unused** vars/params/imports (bindingless `} catch {`); **no `any`**; prefer regex literals `/.../`; **no dead code**.
- `prefer-const`, `eqeqeq`, `no-var`, `no-duplicate-imports` are hard errors.

---

## 🎬 @playwright/cli Locator Workflow

Never guess a locator from memory. For ANY new or changed locator:

1. Read the requirement + any provided snapshot/screenshot.
2. `playwright-cli open <url>` → navigate/authenticate to the screen.
3. `playwright-cli snapshot` → read the real element refs.
4. Save those refs as semantic locators in the **Page Object** (single source of truth).
5. Use ONLY those saved Page Object locators in the Module and Spec.

```bash
playwright-cli open https://app.example.com
playwright-cli snapshot                    # e5[input,name="username"] ...
playwright-cli click e15
playwright-cli fill e5 "value" --submit
playwright-cli screenshot
playwright-cli close
```

Common commands: `goto`, `click`, `dblclick`, `fill`, `type`, `hover`, `check`, `uncheck`, `select`, `press`, `snapshot [ref]`, `eval`, `screenshot`, `go-back`, `reload`, `tab-new/close/select`, `state-save/load`, `route`, `console`, `network`, `tracing-start/stop`, `list`, `close-all`. Targets can be refs (`e15`), CSS, or locators (`getByRole('button',{name:'Submit'})`).

---

## 📊 Reports & Failure Triage

Every run produces (via reporters in `playwright.config.ts`):

| Output | Location |
|---|---|
| AI debug report (categorized RCA) | `ai-debug-report/DEBUG_REPORT.md` + `index.html` |
| Self-healing report | `ai-debug-report/SELF_HEALING_REPORT.md` |
| Playwright HTML report | `playwright-report/` (`npm run test:report`) |
| JSON results | `test-results/results.json` |
| Screenshots / video / trace | `test-results/` (on failure) |

`AiDebugReporter` auto-categorizes each failure into **Locator Change · Script Issue · UI Bug · Environment Issue · Performance Issue · Unknown**, with a suggestion and a self-healable flag. Feed `DEBUG_REPORT.md` to the Copilot **debug-failure** prompt for grouped root-cause analysis.

### Confidence-scored triage (precise RCA at scale)

The reporter runs a **multi-signal engine** — it weighs the full error + step text, self-healing telemetry, screenshot presence, and timing (not just the top error line) — and commits to **ONE** category per failure with a **confidence score**. `DEBUG_REPORT.md` is built for triaging a big run (e.g. 50 fails / 500) at a glance, in three short sections:

1. **🧭 Where to look first** — the category distribution (`🔗 Locator 22 · 🌐 Environment 10 · 📝 Script 8 · 🐛 UI Bug 5 · 🐢 Performance 3 · ❓ Unknown 2`) plus a **who-fixes-what split**: test-side auto-fixable (Locator + Script) vs app/infra team (UI Bug + Environment) vs needs-a-manual-look (Performance + Unknown).
2. **🧩 Root Causes** — failures that share the same normalised error signature are **clustered into distinct problems**, sorted by blast radius, so *50 failures become the 6 real issues to fix*. Each group shows the category + confidence, how many tests it hit, the shared cause, and an example spec — with a *"fixing G1 likely clears N tests"* hint.
3. **📋 All Failures** — one lean row per failure: `# · Spec · Test · Diagnosis (category · confidence%) · Why it failed` (a runner-up shows as `(or X?)` only when evidence is genuinely balanced — no "could be A or B" hedging).

The full evidence (`category`, `confidence`, `confidenceLabel`, `signals`, `secondaryCategory`, error, location) is in `results.json`, and the **GitHub Actions step summary** shows the same category + confidence — so local runs and the CI/CD pipeline produce the identical, portable report.

**Workflow:** paste `DEBUG_REPORT.md` into the Copilot chat and ask *"debug these failures"* — the **debug-failure** skill applies a confidence protocol (High → act, Medium → confirm, Low → read trace) and a decision tree to turn each group/row into a concrete fix.

### Live Recovery (opt-in)

For headed, non-CI debugging you can let a locator failure pause for a live fix instead of failing the run. Enable with `LIVE_RECOVERY=1`:

```bash
$env:LIVE_RECOVERY="1"; npx cross-env TEST_ENV=uat playwright test src/tests/create-case.spec.ts --project=desktop-chrome --headed
```

On a locator miss, `RecoveryConsole` writes `.recovery/` (`snapshot.yml`, `screenshot.png`, `REQUEST.json`) and waits for `.recovery/response.txt` with one of `retry` · `pause` · `abort` · `<selector>`, then continues live. `.recovery/` is gitignored.

---

## 🧠 Reuse Index (Capabilities)

A local-only store at `.ai-memory/` (gitignored, never pushed):

- **`capabilities.json`** — the authoritative map of every Page, locator method, Module workflow, fixture, util, and spec. **Check it FIRST** to decide reuse in seconds. Regenerate with `npm run index` after creating/modifying any Page/Module/Spec.

---

## 🤖 AI Agent Usage (Copilot)

This repo ships a custom agent plus auto-loading workflow skills.

- **`.github/copilot-instructions.md`** — always-on pointer auto-injected into every Copilot chat; tells the model to read and follow `AGENT.md`.
- **`AGENT.md`** — the concise rulebook the agent loads on every request (architecture, locators, simplicity, clean-code gate, anti-hallucination). It links back into this README.
- **Workflow skills** (`.github/skills/`): `new-automation`, `modify-test`, `debug-failure`, `self-healing`, `visual-testing`. These load **automatically by intent** — describe the task ("create a test", "this spec is failing", "add a visual snapshot") and the matching playbook is applied; no slash command needed.

**Chat panel vs Agent mode:** use the **chat panel** for anything needing live locator evidence, debugging, or decisions (it enforces the plan-approval + evidence gate). Use **Agent mode** for large, already-patterned jobs (bulk specs from captured locators, repo-wide mechanical refactors) — the `new-automation` skill covers batch automation.

---

## 🧪 Workflow Examples (Copilot)

Each task maps to an auto-loading skill — just describe the goal in chat (no slash command needed).
One short example per workflow:

### 1. New test — "Create Case"
> **Ask:** "Automate creating a new TAS case from this user story + snapshot."
- Skill: **new-automation** → plans, captures locators via `@playwright/cli`, builds Page + Module + Spec, runs it.
```bash
npx cross-env TEST_ENV=uat playwright test src/tests/create-case.spec.ts --project=desktop-chrome --headed
```

### 2. Modify test — "Update Case Status"
> **Ask:** "Add a Submit-path assertion to the update-case status flow."
- Skill: **modify-test** → impact analysis, edits in dependency order (Page → Module → Spec), re-verifies with zero regressions.
```bash
npx playwright test src/tests/update-case-status-save-submit.spec.ts --project=desktop-chrome
```

### 3. Visual test — add a snapshot
> **Ask:** "Add a Sauce Visual snapshot to the FTR case-view spec."
- Skill: **visual-testing** → appends a gated `test.step` with `sauceVisualCheck` + value-only masks.
```bash
$env:TEST_ENV="uat"; $env:VISUAL="1"; npm run test:sauce -- --select-suite ftr-case-view-verification-uat
```

### 4. Batch automation — many specs
> **Ask:** "Automate scenarios 1–5 from testcases.md."
- Skill: **new-automation** (batch mode) → groups related scenarios by screen to maximise reuse, one spec per feature area, one `test()` per scenario, in waves.

### 5. Debug & self-healing — a failing/flaky spec
> **Ask:** "ftr-create-submit is failing — triage it." / "Harden this flaky locator."
- Skills: **debug-failure** (reads `ai-debug-report/DEBUG_REPORT.md`, categorises the RCA, fixes) and **self-healing** (adds/audits `SmartLocator` fallback chains, reads `SELF_HEALING_REPORT.md`).
```bash
npm run test:report      # open last HTML report; DEBUG_REPORT.md + SELF_HEALING_REPORT.md live in ai-debug-report/
```

---

## 🔁 CI / GitHub Actions

CI runs through GitHub Actions — [.github/workflows/playwright.yml](.github/workflows/playwright.yml) runs the Playwright suite locally on the runner or on Sauce Labs.

- Trigger: **workflow_dispatch** with inputs `environment` (qa/uat/dev), `run_on_sauce`, `test_grep`, `browser`; also on push / PR to `main`.
- Run target: `npx playwright test` (uses the config reporters — produces the HTML report, JSON, and `ai-debug-report/`, all collected as GitHub Artifacts).
- **Secrets:** stored as **GitHub repository secrets** (Settings → Secrets and variables → Actions): `BASE_URL`, `APP_USERNAME`, `APP_PASSWORD`, `SAUCE_USERNAME`, `SAUCE_ACCESS_KEY`. Never committed to the repo.
- `package-lock.json` must be committed.

---

## 🚫 Anti-Hallucination Rules

1. Do not invent features, APIs, error codes, UI elements, or behavior; do not assume default behavior.
2. Mine existing repo knowledge (`capabilities.json` → pages → modules → specs → run artifacts) before declaring anything missing.
3. If information is missing, say **"Insufficient information to determine."** Label any inference **"Inference (low confidence)."**
4. Every assertion must trace to provided input; output must be deterministic.
5. **Plan gate:** provide an implementation plan and wait for explicit approval before changing code.
