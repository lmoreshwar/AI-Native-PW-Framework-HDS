import { Page } from '@playwright/test';
import { UserHomePage } from '../pages/UserHomePage';
import { Logger } from '../utils/Logger';
import { Actions } from '../utils/Actions';
import { WaitHelper } from '../utils/WaitHelper';
import { WorkflowActions } from '../utils/WorkflowActions';

/**
 * UserHomeModule — Layer 2: Business Logic
 *
 * Orchestrates TAS case search from the existing `/user-home` page.
 */
export class UserHomeModule {
    private userHomePage: UserHomePage;
    private logger: Logger;
    private actions: Actions;
    private waitHelper: WaitHelper;
    private workflowActions: WorkflowActions;

    constructor(private page: Page) {
        this.userHomePage = new UserHomePage(page);
        this.logger = Logger.create('UserHomeModule');
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
        this.workflowActions = new WorkflowActions(page);
    }

    /**
     * Switch to the Case Search radio tab when needed.
     */
    async openCaseSearch(): Promise<void> {
        this.logger.step(1, 'Opening Case Search on user home page');

        await this.userHomePage.waitForPageLoad();

        const caseSearchRadio = await this.userHomePage.getCaseSearchRadio();
        const isChecked = await caseSearchRadio.isChecked().catch(() => false);

        if (!isChecked) {
            await this.actions.click(caseSearchRadio);
        }

        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        const caseIdInput = await this.userHomePage.getCaseIdInput();
    await this.waitHelper.waitForVisible(caseIdInput, { timeout: 10000 });
    }

    /**
     * Search for a TAS case ID from the Case Search panel.
     */
    async searchCaseById(caseId: string): Promise<void> {
        await this.openCaseSearch();

        this.logger.step(2, `Searching for TAS case ID: ${caseId}`);
        const caseIdInput = await this.userHomePage.getCaseIdInput();
        const searchButton = await this.userHomePage.getSearchButton();
        await this.workflowActions.searchWithOptionalSubmit(caseIdInput, caseId, searchButton, { timeout: 12000 });

        this.logger.step(3, `Waiting for search results for case ID: ${caseId}`);
        const caseLink = await this.userHomePage.getCaseLink(caseId);
        await this.waitHelper.waitForVisible(caseLink, { timeout: 20000 });
    }

    /**
     * Verify the requested case is displayed in the results grid.
     */
    async verifyCaseInResults(caseId: string): Promise<boolean> {
        this.logger.step(4, `Verifying case ${caseId} is displayed in search results`);

        try {
            const resultRow = await this.userHomePage.getResultRow(caseId);
            const caseLink = await this.userHomePage.getCaseLink(caseId);

            const rowVisible = await resultRow.isVisible({ timeout: 5000 }).catch(() => false);
            const linkVisible = await caseLink.isVisible({ timeout: 5000 }).catch(() => false);

            this.logger.info(`Case result row visible: ${rowVisible}`);
            this.logger.info(`Case result link visible: ${linkVisible}`);

            return rowVisible && linkVisible;
        } catch (error) {
            this.logger.error(`Failed to verify case ${caseId} in search results`, error);
            return false;
        }
    }

    /**
     * Switch the user home cases grid to the "My Created" tab and wait for it to load.
     */
    async openMyCreatedTab(): Promise<void> {
        this.logger.step(1, 'Opening "My Created" tab on user home page');

        await this.userHomePage.waitForPageLoad();

        const myCreatedTab = await this.userHomePage.getMyCreatedTab();
        await this.waitHelper.waitForVisible(myCreatedTab, { timeout: 15000 });
        await this.actions.click(myCreatedTab);

        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        this.logger.step(2, 'Waiting for at least one created case to appear in the grid');
        const firstCaseLink = await this.userHomePage.getFirstCaseLink();
        await this.waitHelper.waitForVisible(firstCaseLink, { timeout: 20000 });
    }

    /**
     * Filter the "My Created" cases grid by the Status column value and wait for
     * the filtered results to settle.
     *
     * @param status - Status text to type into the Status column filter (e.g. "Pending T2 Review")
     */
    async filterByCaseStatus(status: string): Promise<void> {
        this.logger.step(3, `Filtering My Created cases by Status: ${status}`);

        const statusFilter = await this.userHomePage.getStatusFilterInput();
        await this.waitHelper.waitForVisible(statusFilter, { timeout: 15000 });
        await this.workflowActions.searchWithOptionalSubmit(statusFilter, status, undefined, { timeout: 15000 });

        this.logger.step(4, 'Waiting for filtered case results to appear');
        const firstCaseLink = await this.userHomePage.getFirstCaseLink();
        await this.waitHelper.waitForVisible(firstCaseLink, { timeout: 20000 });
    }

    /**
     * Open the FIRST case in the current grid (e.g. "My Created") in a new tab.
     *
     * Captures whatever case id is first in the list — no hardcoded case id and
     * no assumptions about the case-number format beyond the TAS "TA####" prefix.
     */
    async openFirstCreatedCase(): Promise<{ caseViewPage: Page; caseId: string }> {
        this.logger.step(3, 'Resolving the first created case link');
        const firstCaseLink = await this.userHomePage.getFirstCaseLink();
        await this.waitHelper.waitForVisible(firstCaseLink, { timeout: 20000 });

        const caseId = await this.extractCaseIdFromLink(firstCaseLink);
        this.logger.info(`First created case id resolved as: ${caseId}`);

        this.logger.step(4, `Opening first created case ${caseId} in a new tab`);
        const caseViewPage = await this.workflowActions.clickAndWaitForNewTab(firstCaseLink, { timeout: 20000 });
        const caseViewWaitHelper = new WaitHelper(caseViewPage);

        await caseViewWaitHelper.waitForPageLoadState('domcontentloaded', { timeout: 15000 });
        await caseViewWaitHelper.waitForUrlMatch(
            (url) =>
                url.pathname.includes('/tas/case-view') &&
                url.searchParams.get('caseId')?.toUpperCase() === caseId.toUpperCase(),
            { timeout: 15000 },
        );

        await caseViewPage.bringToFront();
        return { caseViewPage, caseId };
    }

    /**
     * Extract the TAS case id from a case link using its visible text first,
     * then falling back to the href query string. Throws if neither yields a value.
     */
    private async extractCaseIdFromLink(link: import('@playwright/test').Locator): Promise<string> {
        const text = (await link.textContent().catch(() => null))?.trim() ?? '';
        const textMatch = text.match(/TA\d+/i);
        if (textMatch) {
            return textMatch[0].toUpperCase();
        }

        const href = (await link.getAttribute('href').catch(() => null)) ?? '';
        const hrefMatch = href.match(/caseId=(TA\d+)/i) ?? href.match(/TA\d+/i);
        if (hrefMatch) {
            return (hrefMatch[1] ?? hrefMatch[0]).toUpperCase();
        }

        throw new Error('Unable to resolve case id from the first created case link (text and href both empty).');
    }

    /**
     * Open the "My Created" tab and filter the grid by the Case # column to the
     * given case id, waiting until that case's link is present in the results.
     *
     * Works for any case-number prefix (TAS "TA…" or FTR "FTR…") — it filters on
     * the exact id and never assumes a number format.
     */
    async searchMyCreatedByCaseId(caseId: string): Promise<void> {
        this.logger.step(1, 'Opening "My Created" tab on user home page');
        await this.userHomePage.waitForPageLoad();

        const myCreatedTab = await this.userHomePage.getMyCreatedTab();
        await this.waitHelper.waitForVisible(myCreatedTab, { timeout: 15000 });
        await this.actions.click(myCreatedTab);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        this.logger.step(2, `Filtering My Created cases by Case #: ${caseId}`);
        const caseFilter = await this.userHomePage.getCaseIdFilterInput();
        await this.waitHelper.waitForVisible(caseFilter, { timeout: 15000 });
        await this.workflowActions.searchWithOptionalSubmit(caseFilter, caseId, undefined, { timeout: 15000 });

        this.logger.step(3, `Waiting for case ${caseId} to appear in the filtered results`);
        await this.waitForCaseInFilteredResults(caseId);
    }

    /**
     * Wait for a just-created case to become searchable in the filtered grid.
     *
     * A freshly submitted FTR can take time to be indexed, so this re-queries the
     * grid via the Refresh button and re-applies the Case # filter between checks
     * until the case link appears.
     */
    private async waitForCaseInFilteredResults(caseId: string): Promise<void> {
        const maxAttempts = 6;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const caseLink = await this.userHomePage.getCaseLink(caseId).catch(() => null);
            if (caseLink && (await caseLink.isVisible({ timeout: 10000 }).catch(() => false))) {
                this.logger.info(`Case ${caseId} appeared in results (attempt ${attempt}/${maxAttempts})`);
                return;
            }

            if (attempt < maxAttempts) {
                this.logger.info(`Case ${caseId} not searchable yet — refreshing the grid (attempt ${attempt}/${maxAttempts})`);
                const refreshButton = await this.userHomePage.getMyCreatedRefreshButton();
                await this.actions.click(refreshButton);
                await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

                const caseFilter = await this.userHomePage.getCaseIdFilterInput();
                await this.workflowActions.searchWithOptionalSubmit(caseFilter, caseId, undefined, { timeout: 15000 });
            }
        }

        const caseLink = await this.userHomePage.getCaseLink(caseId);
        await this.waitHelper.waitForVisible(caseLink, { timeout: 20000 });
    }

    /**
     * Click the case link and wait for the FTR `generic-view-case` page to open in
     * a new tab. Returns the new-tab page for the caller to drive verification.
     */
    async openGenericCaseInNewTab(caseId: string): Promise<Page> {
        this.logger.step(4, `Opening case ${caseId} in a new tab`);

        const caseLink = await this.userHomePage.getCaseLink(caseId);
        const caseViewPage = await this.workflowActions.clickAndWaitForNewTab(caseLink, { timeout: 20000 });
        const caseViewWaitHelper = new WaitHelper(caseViewPage);

        await caseViewWaitHelper.waitForPageLoadState('domcontentloaded', { timeout: 15000 });
        await caseViewWaitHelper.waitForUrlMatch(
            (url) =>
                url.pathname.includes('/generic-view-case') &&
                url.searchParams.get('caseId')?.toUpperCase() === caseId.toUpperCase(),
            { timeout: 20000 },
        );

        await caseViewPage.bringToFront();
        return caseViewPage;
    }

    /**
     * Click the case link and wait for the case-view page to open in a new tab.
     */
    async clickCaseLink(caseId: string): Promise<Page> {
        this.logger.step(5, `Clicking case result link for ${caseId}`);

        const caseLink = await this.userHomePage.getCaseLink(caseId);

        const caseViewPage = await this.workflowActions.clickAndWaitForNewTab(caseLink, { timeout: 20000 });
        const caseViewWaitHelper = new WaitHelper(caseViewPage);

        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        await caseViewWaitHelper.waitForPageLoadState('domcontentloaded', { timeout: 15000 });
        await caseViewWaitHelper.waitForUrlMatch(
            (url) =>
                url.pathname.includes('/tas/case-view') &&
                url.searchParams.get('caseId')?.toUpperCase() === caseId.toUpperCase(),
            { timeout: 15000 },
        );

        await caseViewPage.bringToFront();
        return caseViewPage;
    }
}