import { Page } from '@playwright/test';
import { CaseSearchPage } from '../pages/CaseSearchPage';
import { Logger } from '../utils/Logger';
import { Actions } from '../utils/Actions';
import { WaitHelper } from '../utils/WaitHelper';

/**
 * CaseViewModule — Layer 2: Business Logic
 *
 * Orchestrates interactions on the case-view page that opens in a new tab,
 * specifically expanding the left-rail "Details" section and reading the
 * case "Creator" value.
 *
 * Constructed in the spec with the new-tab page (same pattern as CaseSearchPage
 * in case-search.spec.ts).
 */
export class CaseViewModule {
    private caseSearchPage: CaseSearchPage;
    private logger: Logger;
    private actions: Actions;
    private waitHelper: WaitHelper;

    constructor(private page: Page) {
        this.caseSearchPage = new CaseSearchPage(page);
        this.logger = Logger.create('CaseViewModule');
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
    }

    /**
     * Wait until the case-view page for the given case id is fully loaded.
     */
    async waitForReady(caseId: string): Promise<void> {
        this.logger.step(1, `Waiting for case-view page to be ready for ${caseId}`);
        await this.caseSearchPage.waitForPageLoad(caseId);
    }

    /**
     * Expand the left-rail "Details" section so the Creator value is visible.
     */
    async expandDetails(): Promise<void> {
        this.logger.step(2, 'Expanding the case "Details" section');

        const detailsExpander = await this.caseSearchPage.getCaseDetailsExpander();
        await this.waitHelper.waitForVisible(detailsExpander, { timeout: 15000 });
        await this.actions.click(detailsExpander);

        await this.caseSearchPage.waitForLoadingToStabilize({ timeoutMs: 15000, stableWindowMs: 800 });

        const creatorRow = await this.caseSearchPage.getCreatorRow();
        await this.waitHelper.waitForVisible(creatorRow, { timeout: 15000 });
    }

    /**
     * Read the case Creator name from the expanded Details section.
     *
     * No assumptions are made about the name format — the "Creator" label text
     * is stripped and whatever remains is returned as the creator value.
     */
    async getCreatorName(): Promise<string> {
        this.logger.step(3, 'Reading the case Creator value');

        const creatorRow = await this.caseSearchPage.getCreatorRow();
        await this.waitHelper.waitForVisible(creatorRow, { timeout: 15000 });

        const rawText = (await creatorRow.textContent().catch(() => null))?.replace(/\s+/g, ' ').trim() ?? '';
        const creator = rawText.replace(/^.*?creator\s*:?\s*/i, '').trim();

        this.logger.info(`Resolved Creator value: "${creator}" (raw: "${rawText}")`);
        return creator;
    }

    /**
     * Read the case Status value from the Case Information region.
     *
     * No assumptions are made about the status text — the "Status" label is
     * stripped and whatever remains is returned as the status value.
     */
    async getStatusValue(): Promise<string> {
        this.logger.step(4, 'Reading the case Status value');

        const statusRow = await this.caseSearchPage.getStatusValue();
        await this.waitHelper.waitForVisible(statusRow, { timeout: 15000 });

        const rawText = (await statusRow.textContent().catch(() => null))?.replace(/\s+/g, ' ').trim() ?? '';
        const status = rawText.replace(/^.*?status\s*:?\s*/i, '').trim();

        this.logger.info(`Resolved Status value: "${status}" (raw: "${rawText}")`);
        return status;
    }

    /**
     * Ensure the case starts in the unwatched state so that clicking "Watch Case"
     * produces the "added to Watchlist" confirmation.
     *
     * Watch state persists across runs: reopening a watched case shows "Unwatch
     * Case". If so, click it to revert, leaving "Watch Case" available again.
     */
    async resetToUnwatchedState(): Promise<void> {
        this.logger.step(5, 'Ensuring the case starts in the unwatched state');

        if (await this.isCaseWatched()) {
            this.logger.info('Case is already watched — clicking "Unwatch Case" to reset state');
            const unwatchButton = await this.caseSearchPage.getUnwatchCaseButton();
            await this.actions.click(unwatchButton);

            const watchCaseButton = await this.caseSearchPage.getWatchCaseButton();
            await this.waitHelper.waitForVisible(watchCaseButton, { timeout: 15000 });
        } else {
            this.logger.info('Case is already in the unwatched state');
        }
    }

    /**
     * Click "Watch Case" and verify the case was added to the watch list.
     *
     * The confirmation toast is transient, so it is captured IMMEDIATELY after the
     * click (before any other wait). The toggled "Unwatch Case" control is the
     * persistent state-change proof. Returns true only when BOTH are observed.
     */
    async watchCaseAndVerify(): Promise<boolean> {
        this.logger.step(6, 'Clicking the "Watch Case" action');

        const watchCaseButton = await this.caseSearchPage.getWatchCaseButton();
        await this.waitHelper.waitForVisible(watchCaseButton, { timeout: 15000 });
        await this.actions.click(watchCaseButton);

        // Capture the transient confirmation toast first — it auto-dismisses quickly.
        const messageVisible = await this.isWatchListMessageVisible();
        this.logger.info(`Watch list confirmation message visible: ${messageVisible}`);

        // Confirm the action toggled to "Unwatch Case" (persistent proof).
        const unwatchButton = await this.caseSearchPage.getUnwatchCaseButton();
        const unwatchVisible = await this.waitHelper
            .waitForVisible(unwatchButton, { timeout: 15000 })
            .then(() => true)
            .catch(() => false);
        this.logger.info(`"Unwatch Case" control visible: ${unwatchVisible}`);

        return messageVisible && unwatchVisible;
    }

    /**
     * Change the Case Actions Status value and click Save & Submit.
     *
     * After submit, the case-view tab may close and focus returns to the opener
     * tab, or it may navigate away from the current case-view URL.
     *
     * @returns true when post-submit behavior indicates we left the current case-view tab
     */
    async updateStatusAndSaveSubmit(targetStatus: string): Promise<boolean> {
        this.logger.step(8, `Updating Case Actions Status to: ${targetStatus}`);

        const statusCombobox = await this.caseSearchPage.getCaseActionsStatusCombobox();
        await this.waitHelper.waitForVisible(statusCombobox, { timeout: 15000 });
        await this.actions.click(statusCombobox);

        const statusOption = await this.caseSearchPage.getCaseActionsStatusOption(targetStatus);
        await this.waitHelper.waitForVisible(statusOption, { timeout: 15000 });
        await this.actions.click(statusOption);

        this.logger.step(9, 'Clicking Save & Submit');
        const saveAndSubmitButton = await this.caseSearchPage.getSaveAndSubmitButton();
        await this.waitHelper.waitForVisible(saveAndSubmitButton, { timeout: 15000 });

        const expectedCaseViewRegex = /\/tas\/case-view/i;

        await this.actions.click(saveAndSubmitButton);

        const postSubmitOutcome = await Promise.race([
            this.page.waitForEvent('close', { timeout: 20000 }).then(() => 'closed' as const),
            this.waitHelper
                .waitForUrlMatch((url) => !expectedCaseViewRegex.test(url.pathname), { timeout: 20000 })
                .then(() => 'navigated-away' as const)
                .catch(() => 'unchanged' as const),
        ]).catch(() => 'unchanged' as const);

        // Re-check final state after click.
        const isClosed = this.page.isClosed();
        const stillInCaseView = !isClosed && expectedCaseViewRegex.test(new URL(this.page.url()).pathname);

        this.logger.info(`Post-submit outcome: ${postSubmitOutcome}`);
        this.logger.info(`Case-view page closed: ${isClosed}`);
        this.logger.info(`Still in case-view URL: ${stillInCaseView}`);

        return isClosed || !stillInCaseView;
    }

    /**
     * Resolve and report whether the watch-list confirmation toast is visible,
     * tolerating the case where it has already auto-dismissed.
     */
    private async isWatchListMessageVisible(): Promise<boolean> {
        try {
            const message = await this.caseSearchPage.getWatchListConfirmationMessage();
            return await message.isVisible({ timeout: 8000 }).catch(() => false);
        } catch {
            return false;
        }
    }

    /**
     * Detect whether the case is currently watched (the "Unwatch Case" control is
     * showing). Tolerates the absence of the control by reporting not-watched.
     */
    private async isCaseWatched(): Promise<boolean> {
        try {
            const unwatchButton = await this.caseSearchPage.getUnwatchCaseButton();
            return await unwatchButton.isVisible({ timeout: 3000 }).catch(() => false);
        } catch {
            // The "Unwatch Case" control is absent — the case is not watched.
            return false;
        }
    }
}
