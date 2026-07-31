import { Page } from '@playwright/test';
import { ActionTarget, Actions } from './Actions';
import { WaitHelper } from './WaitHelper';

export class WorkflowActions {
    private actions: Actions;
    private waitHelper: WaitHelper;

    constructor(private page: Page) {
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
    }

    /**
     * Wait until loading indicators are absent for a stable window.
     * Delegates to the shared WaitHelper.waitForLoader so loader-waiting lives
     * in ONE place. Kept for backward compatibility with existing callers.
     */
    async waitForLoadingToStabilize(options?: { timeoutMs?: number; stableWindowMs?: number }) {
        await this.waitHelper.waitForLoader({
            timeout: options?.timeoutMs ?? 45000,
            stableWindowMs: options?.stableWindowMs ?? 2000,
        });
    }

    /**
     * Common step: open hamburger/menu and click target menu item.
     */
    async clickMenuPath(menuTrigger: ActionTarget, menuItem: ActionTarget, options?: { timeout?: number }) {
        const timeout = options?.timeout ?? 10000;
        await this.actions.click(menuTrigger, { timeout });
        await this.waitForLoadingToStabilize({ timeoutMs: timeout * 2, stableWindowMs: 800 });
        await this.actions.click(menuItem, { timeout });
    }

    /**
     * Common step: fill search input and submit by button click or Enter key.
     */
    async searchWithOptionalSubmit(
        inputTarget: ActionTarget,
        value: string,
        submitTarget?: ActionTarget,
        options?: { timeout?: number },
    ) {
        const timeout = options?.timeout ?? 10000;
        await this.actions.fill(inputTarget, value, { timeout, clearFirst: true });

        if (submitTarget) {
            await this.actions.click(submitTarget, { timeout });
        } else {
            await this.actions.pressOn(inputTarget, 'Enter', { timeout });
        }

        await this.waitForLoadingToStabilize({ timeoutMs: timeout * 2, stableWindowMs: 1200 });
    }

    /**
     * Common step: click element and wait for newly opened tab.
     */
    async clickAndWaitForNewTab(clickTarget: ActionTarget, options?: { timeout?: number }) {
        const timeout = options?.timeout ?? 15000;
        const [newPage] = await Promise.all([
            this.page.context().waitForEvent('page', { timeout }),
            this.actions.click(clickTarget, { timeout }),
        ]);

        await this.waitHelper.waitForPageLoadState('domcontentloaded', { page: newPage, timeout });
        return newPage;
    }
}