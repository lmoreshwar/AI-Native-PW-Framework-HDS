import { Page, Locator } from '@playwright/test';
import { TIMEOUTS } from './constants';

export interface WaitOptions {
    timeout?: number;
    interval?: number;
    message?: string;
}

export interface RetryOptions {
    retries?: number;
    delay?: number;
}

export class WaitHelper {
    private page: Page;
    private defaultTimeout: number = TIMEOUTS.MEDIUM;
    private readonly loaderSelector =
        '[role="progressbar"], [aria-busy="true"], [aria-label*="loading" i], [data-testid*="loading" i], [class*="spinner" i], [class*="loading" i]';

    constructor(page: Page) {
        this.page = page;
    }

    async waitForPageLoadState(
        state: 'load' | 'domcontentloaded' | 'networkidle',
        options?: { timeout?: number; page?: Page },
    ): Promise<void> {
        const page = options?.page || this.page;
        await page.waitForLoadState(state, { timeout: options?.timeout || this.defaultTimeout });
    }

    async waitForUrlMatch(
        url: string | RegExp | ((url: URL) => boolean),
        options?: { timeout?: number; page?: Page },
    ): Promise<void> {
        const page = options?.page || this.page;
        await page.waitForURL(url, { timeout: options?.timeout || this.defaultTimeout });
    }

    async waitForVisible(locator: Locator, options?: WaitOptions): Promise<void> {
        await locator.waitFor({ state: 'visible', timeout: options?.timeout || this.defaultTimeout });
    }

    async waitForHidden(locator: Locator, options?: WaitOptions): Promise<void> {
        await locator.waitFor({ state: 'hidden', timeout: options?.timeout || this.defaultTimeout });
    }

    /**
     * Wait for the page loading icon/spinner to disappear.
     * Reusable across ALL pages — call after any action that triggers a load,
     * then perform the next action.
     *
     * Handles a loader that appears MORE THAN ONCE (e.g. two sequential backend
     * calls each showing their own spinner): it waits for the loader to clear,
     * then watches a grace window for a reappearance and waits again if it comes
     * back, so it never returns during the gap between two spinners.
     */
    async waitForLoader(options?: { timeout?: number; stableWindowMs?: number; appearGraceMs?: number }): Promise<void> {
        const timeout = options?.timeout ?? this.defaultTimeout;
        const stableWindowMs = options?.stableWindowMs ?? 1000;
        const appearGraceMs = options?.appearGraceMs ?? 1500;
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
            await this.loaderAppearsWithin(appearGraceMs);
            await this.waitForLoaderToClear(stableWindowMs, deadline);
            if (!(await this.loaderAppearsWithin(appearGraceMs))) {
                return;
            }
        }
        throw new Error(`Loading icon did not disappear within ${timeout}ms`);
    }

    /**
     * Lean loader wait for fast cascading UI (e.g. dependent dropdowns).
     *
     * Briefly watches for a spinner to appear after the triggering action; if none
     * shows within the (small) grace window it returns IMMEDIATELY, and if one does
     * appear it waits only until it is hidden. Unlike {@link waitForLoader} there is
     * no trailing stable window and no second appear-grace, so the caller proceeds
     * the instant no loader is present instead of burning fixed dead time per step.
     */
    async waitForActiveLoaderToClear(options?: { timeout?: number; appearGraceMs?: number }): Promise<void> {
        const timeout = options?.timeout ?? TIMEOUTS.SHORT;
        const appearGraceMs = options?.appearGraceMs ?? 300;

        if (!(await this.loaderAppearsWithin(appearGraceMs))) {
            return;
        }

        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            if (!(await this.isLoaderVisible())) {
                return;
            }
            await this.page.waitForTimeout(100);
        }
    }

    /** Wait until the loader has been hidden continuously for a stable window. */
    private async waitForLoaderToClear(stableWindowMs: number, deadline: number): Promise<void> {
        let clearSince: number | null = null;
        while (Date.now() < deadline) {
            if (await this.isLoaderVisible()) {
                clearSince = null;
            } else {
                clearSince ??= Date.now();
                if (Date.now() - clearSince >= stableWindowMs) {
                    return;
                }
            }
            await this.page.waitForTimeout(200);
        }
        throw new Error('Loading icon did not disappear in time');
    }

    /** True if the loader becomes visible within the grace window (else false). */
    private async loaderAppearsWithin(graceMs: number): Promise<boolean> {
        const until = Date.now() + graceMs;
        while (Date.now() < until) {
            if (await this.isLoaderVisible()) {
                return true;
            }
            await this.page.waitForTimeout(100);
        }
        return false;
    }

    /** True when any known loading indicator is currently visible. */
    private async isLoaderVisible(): Promise<boolean> {
        const loaders = this.page.locator(this.loaderSelector);
        const count = await loaders.count();
        for (let i = 0; i < count; i++) {
            if (await loaders.nth(i).isVisible().catch(() => false)) {
                return true;
            }
        }
        return await this.page.getByText(/^loading\.\.\.$/i).first().isVisible().catch(() => false);
    }

    async waitForPageReady(options?: { timeout?: number; page?: Page; includeNetworkIdle?: boolean }): Promise<void> {
        const page = options?.page || this.page;
        const timeout = options?.timeout || this.defaultTimeout;

        await page.waitForLoadState('domcontentloaded', { timeout });

        if (options?.includeNetworkIdle !== false) {
            await page.waitForLoadState('networkidle', { timeout }).catch(() => null);
        }
    }

    async waitForCondition(condition: () => Promise<boolean>, options?: WaitOptions): Promise<void> {
        const timeout = options?.timeout || this.defaultTimeout;
        const interval = options?.interval || 500;
        const message = options?.message || 'Condition not met';

        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return;
            }
            await this.page.waitForTimeout(interval);
        }
        throw new Error(`Timeout: ${message} after ${timeout}ms`);
    }

    async waitForTextContains(locator: Locator, text: string, options?: WaitOptions): Promise<void> {
        await this.waitForCondition(
            async () => {
                const content = await locator.textContent();
                return content?.includes(text) || false;
            },
            { ...options, message: options?.message || `Text to contain "${text}"` },
        );
    }

    async waitForTextEquals(locator: Locator, text: string, options?: WaitOptions): Promise<void> {
        await this.waitForCondition(
            async () => {
                const content = await locator.textContent();
                return content?.trim() === text;
            },
            { ...options, message: options?.message || `Text to equal "${text}"` },
        );
    }

    async waitForElementCount(locator: Locator, count: number, options?: WaitOptions): Promise<void> {
        await this.waitForCondition(
            async () => {
                const actualCount = await locator.count();
                return actualCount === count;
            },
            { ...options, message: options?.message || `Element count to be ${count}` },
        );
    }

    async waitForUrlContains(urlPart: string, options?: WaitOptions): Promise<void> {
        await this.waitForCondition(
            async () => {
                return this.page.url().includes(urlPart);
            },
            { ...options, message: options?.message || `URL to contain "${urlPart}"` },
        );
    }

    async waitForNetworkIdle(options?: { timeout?: number }): Promise<void> {
        await this.page.waitForLoadState('networkidle', { timeout: options?.timeout || this.defaultTimeout });
    }

    async retry<T>(action: () => Promise<T>, options?: RetryOptions): Promise<T> {
        const retries = options?.retries || 3;
        const delay = options?.delay || 1000;

        let lastError: Error | undefined;
        for (let i = 0; i < retries; i++) {
            try {
                return await action();
            } catch (error) {
                lastError = error as Error;
                if (i < retries - 1) {
                    await this.page.waitForTimeout(delay);
                }
            }
        }
        throw lastError;
    }

    async waitForElementStable(locator: Locator, options?: WaitOptions): Promise<void> {
        const timeout = options?.timeout || this.defaultTimeout;
        const interval = options?.interval || 100;

        let lastBox = await locator.boundingBox();
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            await this.page.waitForTimeout(interval);
            const currentBox = await locator.boundingBox();

            if (
                lastBox &&
                currentBox &&
                lastBox.x === currentBox.x &&
                lastBox.y === currentBox.y &&
                lastBox.width === currentBox.width &&
                lastBox.height === currentBox.height
            ) {
                return;
            }
            lastBox = currentBox;
        }
        throw new Error(`Timeout: Element not stable after ${timeout}ms`);
    }
}
