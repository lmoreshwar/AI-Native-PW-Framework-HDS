# 🤖 AGENT.md — GitHub Copilot Rulebook for Playwright AI Automation Framework

> **Framework**: Playwright AI Automation Framework · **AI Runtime**: GitHub Copilot + playwright-cli · **Cloud**: Sauce Labs · **Target App**: loaded from `.env` (qa/uat/dev)

This is the always-on rulebook. It states the binding rules and links to on-demand guides for
reference material, tutorials, and command sets. Read a linked guide only when a task needs it.

## 🧠 Self-Training Protocol (do this at the END of every substantive change)

Whenever a new capability, convention, or fix is introduced (framework util, wrapper, naming rule,
app fact, verified workaround), persist it so the agent "learns" it for next time — WITHOUT being asked:
1. **Repo memory** — `/memories/repo/conventions.md`: add a concise, VERIFIED fact (this is loaded
   automatically, so keep it short). This is the highest-leverage step.
2. **AGENT.md** — only if it changes a framework-wide BINDING rule (architecture, locator standard,
   naming, run/registry behavior). Keep it to the rule, link details to README.
3. **Skill(s)** in `.github/skills/` — update the workflow playbook(s) by intent. A reusable
   capability usually needs ALL relevant skills updated (new-automation = how to author it,
   modify-test = how to reuse it, debug-failure = how it fails + the fix).
4. **README.md / docs** — human-facing reference, if the change is user-visible.
Rule of thumb: memory = facts the agent recalls; AGENT.md = rules it must obey; skills = how-to by
task; README = human docs. When in doubt, at minimum write the repo-memory fact.

## 📚 Reference material (all consolidated in README.md)

All human-facing reference material lives in one place: [`README.md`](./README.md). Read the relevant section when a task needs it.

| Need | Section |
|---|---|
| Full `playwright-cli` command set | [README → @playwright/cli Locator Workflow](./README.md#-playwrightcli-locator-workflow) |
| Wrapper API (Actions / WaitHelper / WorkflowActions) | [README → Wrapper APIs](./README.md#-wrapper-apis) |
| Locator strategy detail | [README → Locator Standard](./README.md#-locator-standard) |
| Reuse index detail | [README → Reuse Index (Capabilities)](./README.md#-reuse-index-capabilities) |
| Test execution commands & tags | [README → Command Cheat Sheet](./README.md#-command-cheat-sheet) |
| Debug & UI mode explained | [README → Debug & UI Mode Explained](./README.md#-debug--ui-mode-explained) |
| Sauce Labs execution | [README → Sauce Labs Execution](./README.md#-sauce-labs-execution) |
| Anti-hallucination + CLI enforcement | [README → Anti-Hallucination Rules](./README.md#-anti-hallucination-rules) |
| Workflow commands (new / modify / debug / self-healing) | Auto-loading skills in [`.github/skills/`](./.github/skills/) |

---

## 🔐 Environment & Secrets

```bash
npm install
npx playwright install
TEST_ENV=qa npm test     # uses .env.qa   (also uat / dev)
```

Read values in code:
```typescript
import { env, credentials } from '../config';
credentials('app')   // { username, password } from APP_USERNAME / APP_PASSWORD
credentials('ftr')   // FTR_APP_USERNAME / FTR_APP_PASSWORD
credentials('dpr')   // DPR_APP_USERNAME / DPR_APP_PASSWORD
env('ANY_KEY')       // any other .env value
```

> **SECURITY RULE — credentials live in `.env` ONLY.** Usernames/passwords must NEVER appear in
> `testData.json`, specs, pages, modules, or any committed source. They belong in the gitignored
> `.env.<env>` files, read at runtime via `credentials()` / `env()`. Only `.env.example`
> (placeholders) is committed. When the user gives a credential, put it in `.env.<env>` — never commit it.

---

## 🏗️ 3-Layer Architecture (STRICT)

```
TESTS (src/tests/*.spec.ts)      → intent + assertions + @Tags. Keep thin.
  ↓ calls
MODULES (src/modules/*Module.ts) → orchestrate page actions + Logger.step(). NO assertions.
  ↓ calls
PAGES (src/pages/*Page.ts)       → locators + locator helpers ONLY. NO business logic, NO assertions.
```

**Locator priority:** `getByRole()` > `getByLabel()` > `getByPlaceholder()` > `getByText()` > `getByTestId()` > CSS

**File naming:** `[Feature]Page.ts` · `[Feature]Module.ts` · `[feature].spec.ts`

**Spec organization (MANDATORY — group by page/module):** test cases for the SAME page/module + same
entry flow live in ONE spec file, each as its own `test()` in a shared `test.describe`. A new single case
that fits an existing page's spec is ADDED there — do not spawn a new file. KEEP SEPARATE only when: a
different module (never mix FTR/PQR/TAS in one spec), a long cross-screen end-to-end journey, or different
fixtures/roles/global-setup. Rule of thumb: "same page + same entry flow, differs only by a variation
(valid/invalid, primary/no-primary, save/submit)" → one spec, many tests; "different module or full journey"
→ own spec. If a spec grows to ~8–10 slow tests, split by sub-area.

---

## 🎯 Locator Standard (MANDATORY) — detail in [README → Locator Standard](./README.md#-locator-standard)

> Write ONE good locator. Add a fallback only when you can name a concrete reason it will break.
- **Tier 1 (DEFAULT, ~80%)**: a single strategy, no fallback. Use whenever a stable role+name, label, or testid exists.
- **Tier 2**: primary + at most ONE fallback, which MUST have a `// reason:` comment.
- **Tier 3 (EXCEPTION, ≤3 strategies)**: only for icon-only controls or the pre-approved known-flaky list; state why.
- **Hard limits**: max 3 strategies; no two fallbacks of the same handle type; no "just in case" fallbacks;
  collections (≥2 elements) use PLAIN Playwright locators (not `SmartLocator`); no format/regex assumptions on
  domain data (DTC codes, case IDs). A locator with 4–6 strategies is a code smell — refactor it down.

### 🛑 Evidence-First Locator Workflow (the standard for every requirement)
Never guess a locator from memory or "typical" behavior. For ANY new or changed locator:
1. Read the requirement and any provided snapshot(s)/screenshot(s).
2. Launch the screen with `@playwright/cli` (`playwright-cli open <url>` → navigate/authenticate).
3. Capture `playwright-cli snapshot`, read the real refs.
4. Save those refs as semantic locators in the Page Object — the single source of truth.
5. Use ONLY those saved Page Object locators in the Module and Spec.

If a locator is genuinely new and no evidence exists, capture it via `@playwright/cli` (if reachable)
or ask for a snapshot, then continue. Evidence priority: fresh CLI snapshot → existing
`.playwright-cli/*.yml` → `test-results/**/error-context.md` / trace ARIA → labeled user screenshot.
This gate applies to locators only — not to test data, assertions, renames, or timing logic.
Full command set: [README → @playwright/cli Locator Workflow](./README.md#-playwrightcli-locator-workflow).

### ⚡ Reuse-First Fast Path (do this before anything else)
- Open `.ai-memory/capabilities.json` FIRST — the authoritative map of every Page, locator,
  Module workflow, fixture, util, and spec. If the asset is listed, it EXISTS → reuse it; do not
  re-scan the repo or re-capture a known locator.
- Open a specific source file only to get an exact signature/return type — and only that file.
- Fall through to full-file reads only if the index lacks the capability.
- Full procedure: [README → Reuse Index (Capabilities)](./README.md#-reuse-index-capabilities).
  After creating/modifying any Page/Module/Spec, run `npm run index` to keep the map authoritative.

### 🔁 Spec ↔ Sauce Registry Sync (per-test jobs — AUTO-GENERATED)
On Sauce, **every `test()` runs as its own job on its own VM** so the dashboard job count equals the
real test count and each job shows the test name. The `saucectl.yml` `suites:` block is **auto-generated**
by `scripts/run-sauce.js` on every `npm run test:sauce*` (and `node scripts/run-sauce.js --sync-only`):
- **One suite = one `test()` = one Sauce job.** A spec with MULTIPLE `test()`s produces MULTIPLE
  per-test jobs (each counted separately). A single-test file produces one job. `test.skip` /
  `test.fixme` are excluded (no empty jobs).
- **Job name** = `"<spec-basename> - <test title> - <TEST_ENV>"`, ASCII-sanitized and capped at 100
  chars (Sauce rejects Unicode job names). Each suite targets its spec via `testMatch` + selects the
  single test via a regex-escaped `grep` on the title.
- **Do NOT hand-edit the `suites:` block** — it is overwritten on the next run. To change what runs,
  add/rename/delete the `test()` in `src/tests/*.spec.ts` (the generator picks it up).
- Still required on spec add/rename/delete: run **`npm run index`** (refresh `.ai-memory/capabilities.json`),
  and update **`README.md`** / **`docs/presentation.md`** if they reference the file.
- Preview with `npm run test:sauce:uat -- --dry-run` (lists the exact generated suite names). Run ONE
  test with `--select-suite "<generated-suite-name>"` (the name now includes the test title, e.g.
  `"pqr - Invalid VIN is rejected and PQR routing is prevented @P1 @Regression - uat"`).
- **After** the cloud run, `scripts/run-sauce.js` invokes `scripts/aggregate-debug-report.mjs`, which
  reads the per-job artifacts under `test-results/sauce/<job>/` and writes ONE lightweight, failures-only
  combined `ai-debug-report/DEBUG_REPORT.md` (+ machine-readable `sauce-results.json`) covering every job.

---

## ✂️ Code Simplicity (MANDATORY — short, wrapper-driven, readable)

- **Use the wrappers, always.** Every click/fill/type/check/select/press → `Actions`. Every wait →
  `WaitHelper` / `WorkflowActions`. No raw `page.click()`, no inline `page.waitForTimeout()`, no
  hand-rolled retry loops in modules. (API: [README → Wrapper APIs](./README.md#-wrapper-apis).)
  Raw Playwright is allowed only for advanced cases (calendars, overlays, `evaluate()`, canvas) — kept
  at the lowest layer, never in specs, with a one-line reason comment.
- **One action = one line.** A module step should read like the manual steps the user gave you.
- **Keep methods short** (~5–15 lines, single responsibility). Split or simplify long, defensive methods.
- **One wait, then act.** A single wrapper wait for readiness (e.g. loader hidden) — no stacked speculative waits.
- **Never wait on network-idle in these apps.** These apps poll the backend continuously, so
  `networkidle` (`WaitHelper.waitForNetworkIdle` / `waitForLoadState('networkidle')`) never settles and
  silently burns its full timeout. Wait on the UI instead: loader hidden (`waitForActiveLoaderToClear`),
  target element visible, or URL match. `domcontentloaded` on `goto` is fine.
- **No speculative fallbacks.** No extra clicks, force-clicks, or "just in case" branches unless a captured run proves them needed.
- **Don't dismiss overlays that don't block.** Overlay-close calls (e.g. `closeAppGuideIfOpen`) belong ONLY
  where a captured run proves the overlay actually intercepts the next action. Do not scatter them before
  every step: when the target is already visible and clickable, the extra `waitForHidden` just makes the run
  sit idle (slow execution) for no benefit. Add such a guard at the single proven blocking point, or handle
  the overlay globally, and nowhere else.
- **Promote repeated/complex logic to a shared helper (MANDATORY).** Date pickers, loader waits,
  overlay dismissal, dropdown selection, login chains → extract into `Actions` / `WaitHelper` /
  `WorkflowActions` / a dedicated helper the first time. Never copy-paste a complex block into a second module.
- **Parameterize variants — never per-value twin methods.** A step that differs only by a choice
  (Yes/No, Save/Submit, tab name) takes a typed parameter with a default, and drives its locator from
  that parameter. One method covers every branch, e.g. `selectExistingTasCaseAndCreateDraft(choice: YesNo = 'No')`.

### 📎 File Uploads / Attachments (MANDATORY pattern)
When a test case says "upload an attachment / select a file / click Browse and choose a file":
- **Files live in ONE folder:** `src/testdata/attachments/`. The user drops the file there; reference it by
  name via `attachmentPath('<file-name>')` (from `../utils`) — never hardcode an absolute path.
- **Use the shared mechanic:** `Actions.uploadViaFileChooser(triggerLocator, attachmentPath(name))` clicks the
  visible "Browse"/upload control and handles the OS file chooser. Use this for hidden `<input type=file>`
  behind a button (a direct `setInputFiles` is silently ignored by these MFEs). `Actions.uploadFiles` (direct
  `setInputFiles`) is only for a directly-addressable input.
- **3-layer split:** the Browse-button + uploaded-file-row locators live in the Page (e.g. PQR:
  `getBrowseAttachmentButton()`, `getAttachmentByName()`); the upload+verify workflow lives in the Module
  (e.g. `PqrModule.uploadAttachment(fileName)` returns `true` once the file is listed); the Spec asserts on it.
- **Verify by outcome:** confirm the uploaded file name appears in the attachment list — that render is the
  real upload-complete signal (not just that the input received a path).

---

## 🧹 Clean Code & Merge Gate (MANDATORY)

> **Definition of done:** `npm run lint` → 0 problems AND `npx tsc --noEmit` → 0 errors. No new SonarQube-class smells.

- **NEVER hardcode timeouts or magic numbers.** No raw ms literals (`30000`, `page.waitForTimeout(2000)`,
  `{ timeout: 15000 }`, `test.setTimeout(420000)`) anywhere. Use the single source of truth `TIMEOUTS` in
  `src/utils/constants.ts` (`SHORT`, `MEDIUM`, `LONG`, `EXPECT`, `ACTION`, `NAVIGATION`, `TEST`, `TEST_LONG`)
  via `import { TIMEOUTS } from '../utils';`. If no value fits, add a named constant — never inline a number.
  Applies to NEW, MODIFY, and DEBUG work (never "fix" a flake with a literal wait).
- **No hardcoded test data or credentials.** Data from `testData.json`; secrets from `.env` via
  `credentials()` / `env()`. Never inline usernames, passwords, VINs, URLs, or environment values.
- **Keep tests declarative** (intent + assertions); orchestration lives in modules; locators in pages.
- **Remove duplication** (same logic 2+ times) — extract to a shared helper / module method.
- **ESM imports only** — never `require()`. Import JSON via `import data from '...json'`.
- **No unused** vars/params/imports. Bindingless `} catch {` when the error is unused.
- **No `any`.** Type every param/return; use `Page` from `@playwright/test`.
- **Escape regex in template strings** (`\\s` inside `` `...` ``); prefer regex literals `/.../` for static patterns.
- **No dead code** — don't export from a barrel unless imported; delete zero-usage helpers.
- **`prefer-const`, `eqeqeq`, `no-var`, `no-duplicate-imports`** are hard errors. Keep cognitive complexity low.

---

## 🚫 Anti-Patterns (NEVER do)

❌ Business logic in Pages · ❌ Assertions in Modules · ❌ Duplicate locators across pages
❌ CSS when a semantic locator exists · ❌ Hardcoded credentials/data/timeouts
❌ Raw Playwright actions in specs · ❌ Writing code before discovering elements via `playwright-cli snapshot`

---

## 🔑 Key Utilities & Structure

| Utility | Usage |
|---|---|
| `credentials('app'\|'ftr'\|'dpr')` | Login secrets from `.env` |
| `env('KEY')` | Any `.env` value |
| `TIMEOUTS.*` | Centralized timeouts (`src/utils/constants.ts`) |
| `Logger.step(n, 'text')` | Step logging in modules |
| `SmartLocator.resolve()` | Fallback locator chains (single elements only) |
| `AiDebugReporter` | Auto-categorize failures |

```
src/
├── config/index.ts    ← config + env()/credentials() helpers
├── fixtures/index.ts  ← fixture DI + popup handlers
├── pages/             ← Layer 1: locators ONLY
├── modules/           ← Layer 2: workflows + logging
├── tests/             ← Layer 3: test cases + tags
├── testdata/          ← JSON data + types (no secrets)
└── utils/             ← Actions, WaitHelper, WorkflowActions, Logger, SmartLocator, constants
```

---

## 🚫 Anti-Hallucination & Plan Gate (MANDATORY)

Detail: [README → Anti-Hallucination Rules](./README.md#-anti-hallucination-rules)

1. Do not invent features, APIs, error codes, UI elements, or behavior; do not assume default behavior.
2. Mine existing repo knowledge (capabilities index → pages → modules → specs → memory → artifacts) before declaring anything missing.
3. If information is missing, say "Insufficient information to determine." Label any inference "Inference (low confidence)."
4. Every assertion must trace to provided input; output must be deterministic.
5. **Implementation Plan Gate:** provide an implementation plan and wait for explicit user approval before changing code.

**Workflow skills** (auto-load by intent; each enforces anti-hallucination + CLI evidence + plan approval):

| Workflow | Skill |
|---|---|
| New test automation | [`new-automation`](./.github/skills/new-automation/SKILL.md) |
| Modify existing test | [`modify-test`](./.github/skills/modify-test/SKILL.md) |
| Debug / fix failures | [`debug-failure`](./.github/skills/debug-failure/SKILL.md) |
| Self-healing (SmartLocator) | [`self-healing`](./.github/skills/self-healing/SKILL.md) |
| Visual testing (Sauce Visual, additive) | [`visual-testing`](./.github/skills/visual-testing/SKILL.md) |
