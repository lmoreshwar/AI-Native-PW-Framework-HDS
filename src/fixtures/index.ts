import { test as base, type Page, type TestInfo } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';
import { UserHomePage } from '../pages/UserHomePage';
import { UserHomeModule } from '../modules/UserHomeModule';
import { FTRPage } from '../pages/FTRPage';
import { FTRModule } from '../modules/FTRModule';
import { PqrPage } from '../pages/PqrPage';
import { PqrModule } from '../modules/PqrModule';
import { Actions } from '../utils/Actions';
import { WorkflowActions } from '../utils/WorkflowActions';

// ===================================================================
// Fixtures — Add new Page & Module fixtures here as you build them
// ===================================================================

export type TestFixtures = {
    userHomePage: UserHomePage;
    userHomeModule: UserHomeModule;
    ftrPage: FTRPage;
    ftrModule: FTRModule;
    pqrPage: PqrPage;
    pqrModule: PqrModule;
    actions: Actions;
    workflowActions: WorkflowActions;
};

export const test = base.extend<TestFixtures>({
    // Global popup/modal handlers
    page: async ({ page }, use, testInfo) => {
        const actions = new Actions(page);
        let failurePauseExecuted = false;

        SmartLocator.startSession({
            testTitle: testInfo.titlePath.join(' > '),
            projectName: testInfo.project.name,
            startedAt: new Date().toISOString(),
        });

        // Auto-dismiss cookie/consent banners
        await page.addLocatorHandler(
            page.getByRole('button', { name: /Accept|Allow|Agree/i }).first(),
            async () => {
                const button = page.getByRole('button', { name: /Accept|Allow|Agree/i }).first();
                if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await actions.click(button);
                }
            },
            // Consent banners appear once early; cap invocations so this handler can never
            // intercept (and slow down) every later action in the test.
            { noWaitAfter: true, times: 3 },
        );

        // Auto-dismiss close/dismiss dialogs
        await page.addLocatorHandler(
            page.getByRole('button', { name: /Close|Dismiss|No thanks/i }).first(),
            async () => {
                const button = page.getByRole('button', { name: /Close|Dismiss|No thanks/i }).first();
                // Skip buttons that cannot be clicked reliably:
                //  - Angular Material datepicker close (visually hidden, blocked by backdrop)
                //  - off-viewport overlay close buttons (e.g. a failed-to-load "App Guide"
                //    dialog whose "Close App Guide" button renders outside the viewport and
                //    would otherwise stall this handler for the full action timeout)
                const skipReason = await button
                    .evaluate((el) => {
                        const label = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.textContent ?? ''}`;
                        // Never auto-close an app confirmation dialog (e.g. the DTC "Delete row?"
                        // popup). Its own Delete/Cancel buttons must be driven by the test, not by
                        // this generic dismiss handler.
                        const dialog = el.closest('[role="dialog"], [role="alertdialog"], .modal, .cdk-dialog-container, .mat-mdc-dialog-container');
                        const dialogText = dialog?.textContent ?? '';
                        if (/delete row|cannot be undone/i.test(dialogText)) return 'protected-dialog';
                        if (/close app guide/i.test(label)) return 'app-guide';
                        if (el.classList.contains('mat-datepicker-close-button')) return 'datepicker';
                        const rect = el.getBoundingClientRect();
                        const outside =
                            rect.bottom <= 0 ||
                            rect.right <= 0 ||
                            rect.top >= window.innerHeight ||
                            rect.left >= window.innerWidth;
                        return outside ? 'off-viewport' : '';
                    })
                    .catch(() => '');
                if (skipReason) return;
                if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await actions.click(button).catch(() => null);
                }
            },
            // Cap invocations: the onboarding/App Guide overlay only appears early. Without a cap
            // this handler intercepts every later action (it fired 32× during the DTC delete flow).
            { noWaitAfter: true, times: 5 },
        );

        try {
            await use(page);
        } catch (error) {
            // Opt-in failure pause (QA-debug aid): when PAUSE_ON_FAILURE is set AND the run is
            // headed, freeze the live browser via the Playwright Inspector instead of tearing it
            // down. This keeps the session + page state alive so a human can inspect the failing
            // screen and supply a missing locator, then resume with ▶. The test timeout is paused
            // while the Inspector is open. Default runs (flag unset) are completely unaffected.
            failurePauseExecuted = await pauseOnFailureIfEnabled(page, testInfo, error);
            throw error;
        } finally {
            // Some Playwright failure paths (for example locator-handler errors/timeouts) can
            // skip the direct catch path. Backstop with status-based pause so PAUSE_ON_FAILURE
            // works consistently for any failed test outcome.
            const testFailed = testInfo.status && testInfo.status !== testInfo.expectedStatus;
            if (testFailed && !failurePauseExecuted) {
                await pauseOnFailureIfEnabled(page, testInfo, `Test failed with status: ${testInfo.status}`);
            }

            const payload = SmartLocator.toPayload();
            const markdown = SmartLocator.toMarkdownSummary();

            if (payload.events.length > 0 || payload.attempts.length > 0) {
                await testInfo.attach('self-healing-events', {
                    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
                    contentType: 'application/json',
                });
                await testInfo.attach('self-healing-summary', {
                    body: Buffer.from(markdown, 'utf-8'),
                    contentType: 'text/markdown',
                });
            }

            SmartLocator.endSession();
        }
    },

    userHomePage: async ({ page }, use) => {
        await use(new UserHomePage(page));
    },

    userHomeModule: async ({ page }, use) => {
        await use(new UserHomeModule(page));
    },

    ftrPage: async ({ page }, use) => {
        await use(new FTRPage(page));
    },

    ftrModule: async ({ page }, use) => {
        await use(new FTRModule(page));
    },

    pqrPage: async ({ page }, use) => {
        await use(new PqrPage(page));
    },

    pqrModule: async ({ page }, use) => {
        await use(new PqrModule(page));
    },

    actions: async ({ page }, use) => {
        await use(new Actions(page));
    },

    workflowActions: async ({ page }, use) => {
        await use(new WorkflowActions(page));
    },
});

export { expect } from '@playwright/test';

/**
 * Opt-in "pause instead of close on failure" debug aid.
 *
 * Enabled only when the PAUSE_ON_FAILURE env flag is truthy AND the run is headed
 * (the Playwright Inspector requires a visible browser). When active, it logs the
 * failure and calls page.pause(), which keeps the browser + page state alive and
 * halts the test timeout until a human resumes from the Inspector (▶). With the
 * flag unset — every normal/CI/Sauce run — this is a no-op and behavior is unchanged.
 */
async function pauseOnFailureIfEnabled(page: Page, testInfo: TestInfo, error: unknown): Promise<boolean> {
    const flag = (process.env.PAUSE_ON_FAILURE ?? '').toLowerCase();
    const enabled = flag === '1' || flag === 'true' || flag === 'yes';
    if (!enabled) return false;

    // The Inspector needs a visible browser. PAUSE_ON_FAILURE is an explicit opt-in (never set
    // in CI/Sauce), so we only bail when headless mode is POSITIVELY detected; an unset/false
    // headless config is treated as headed (the worker's argv does not carry the --headed flag).
    if (testInfo.project.use.headless === true) return false;

    if (page.isClosed()) return false;

    const reason = error instanceof Error ? error.message : String(error);
    // Stop the test clock so the frozen session can stay alive indefinitely (no timeout kill).
    testInfo.setTimeout(0);

    console.warn('\n⏸️  PAUSE_ON_FAILURE active — keeping the browser open instead of closing it.');
    console.warn(`   Test:   ${testInfo.titlePath.join(' > ')}`);
    console.warn(`   Reason: ${reason}`);
    console.warn('   Inspect the live page now. When done, CLOSE the browser window to release the run.');
    console.warn('   (Under --debug/PWDEBUG the Playwright Inspector also offers a ▶ Resume button.)\n');

    // Opens the Inspector + Resume ▶ when launched under --debug/PWDEBUG; a plain --headed run
    // treats this as a no-op and returns immediately.
    await page.pause().catch(() => null);

    // Fallback for plain --headed runs: hold the browser open until the user manually closes it,
    // so the failing state stays inspectable. waitForEvent('close', timeout 0) never auto-expires.
    if (!page.isClosed()) {
        await page.waitForEvent('close', { timeout: 0 }).catch(() => null);
    }

    return true;
}
