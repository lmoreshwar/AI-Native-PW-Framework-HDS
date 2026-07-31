import { Page, Locator } from '@playwright/test';
import { CaseSearchPage } from '../pages/CaseSearchPage';
import { TASPage } from '../pages/TASPage';
import { Logger } from '../utils/Logger';
import { Actions } from '../utils/Actions';
import { WaitHelper } from '../utils/WaitHelper';
import { WorkflowActions } from '../utils/WorkflowActions';
import { DatePickerHelper } from '../utils/DatePickerHelper';

export interface GeneralInformationData {
    vin: string;
    repairOrder: string;
    odometer: string;
    directContact: string;
    customerType: string;
}

export interface AssignDealerData {
    dealerOptionText: string;
    dealerSearchText: string;
}

export interface CaseDetailsData {
    customerConcern: string;
    serviceGroup: string;
    serviceCategory: string;
    section: string;
    subComponent: string;
    condition: string;
    preCallWorksheet: string;
}

export interface DiagnosticInformationData {
    description: string;
    dtcCodes: string[];
}

export interface DiagnosticInformationResult {
    description: string;
    addedDTCs: string[];
    primaryDTC: string;
}

/**
 * A Sauce Visual ignore region in document coordinates (NOT a Playwright Locator).
 * Mirrors the shape `sauceVisualCheck`'s `ignoreRegions` accepts.
 */
export interface VisualIgnoreRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * TASModule — Layer 2: Business Logic
 * 
 * Orchestrates TAS navigation, VIN entry, and Create Case workflow.
 * Uses Logger.step() for detailed flow tracking.
 */
export class TASModule {
    private tasPage: TASPage;
    private logger: Logger;
    private actions: Actions;
    private waitHelper: WaitHelper;
    private workflowActions: WorkflowActions;
    /** Viewport size saved by prepareFullPageCapture() so restoreAfterFullPageCapture() can undo it. */
    private viewportBeforeFullPageCapture: { width: number; height: number } | null = null;

    constructor(private page: Page) {
        this.tasPage = new TASPage(page);
        this.logger = Logger.create('TASModule');
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
        this.workflowActions = new WorkflowActions(page);
    }

    /**
     * Run a boolean visibility/state check with uniform logging and error handling.
     * Centralizes the verify* try/catch boilerplate so each check stays a one-liner.
     */
    private async safeCheck(label: string, check: () => Promise<boolean>): Promise<boolean> {
        try {
            const result = await check();
            this.logger.info(`${label}: ${result}`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to verify ${label}`, error);
            return false;
        }
    }

    /**
     * Open the hamburger menu
     */
    async openHamburgerMenu(): Promise<void> {
        this.logger.step(1, 'Opening hamburger menu');
        const sideMenuVisible = await this.tasPage.isTASSideMenuVisible();
        if (!sideMenuVisible) {
            const hamburger = await this.tasPage.getHamburgerMenu();
            await this.actions.click(hamburger);
            // Heavy nav-triggered load on slow UAT — use the framework default budget, not a 10s outlier.
            await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 45000, stableWindowMs: 700 });
        } else {
            this.logger.info('Sidebar menu already expanded, skipping hamburger click');
        }
    }

    /**
     * Click on TAS menu item to navigate to TAS page
     */
    async navigateToTAS(): Promise<void> {
        this.logger.step(2, 'Clicking TAS menu item');
        const alreadyInTAS = await this.tasPage.isTASContextVisible();
        if (!alreadyInTAS) {
            try {
                const tasMenuItem = await this.tasPage.getTASMenuItem();
                await this.actions.click(tasMenuItem);
            } catch {
                this.logger.warn('TAS menu item not directly visible (collapsed/icon-only menu). Navigating via /tas fallback');
                await this.page.goto('/tas');
            }
        } else {
            this.logger.info('TAS context already visible, skipping TAS menu click');
        }

        this.logger.step(3, 'Waiting for TAS page to load');
        try {
            await this.tasPage.waitForPageLoad();
        } catch {
            this.logger.warn('Primary TAS ready anchor was not found in time, applying URL/load-state fallback');
            await this.waitHelper.waitForUrlMatch(/\/tas(\/|\?|$)/i, { timeout: 15000 }).catch(() => null);
            await this.waitHelper.waitForPageLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
        }
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        const tasTabsVisible = await this.page
            .getByRole('tab', { name: /tas\s*home|create\s+a\s*(tas\s*)?case|case management|pre-?call/i })
            .first()
            .isVisible({ timeout: 25000 })
            .catch(() => false);
        if (!tasTabsVisible) {
            this.logger.warn('TAS tabs not yet visible, retrying navigation via direct URL');
            await this.page.goto('/tas', { waitUntil: 'networkidle' });
            await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 25000, stableWindowMs: 1200 });
        }
    }

    /**
     * Click the "Pre-Call Worksheets" tab in the TAS shell top navigation and
     * wait for the Pre-Call Worksheet page to load.
     * Evidence: UAT screenshot of /tas/case-setup/pre-call-worksheets.
     */
    async openPreCallWorksheets(): Promise<void> {
        this.logger.step(1, 'Clicking the Pre-Call Worksheets tab');
        const preCallTab = await this.tasPage.getPreCallWorksheetsTab();
        await this.actions.click(preCallTab);

        this.logger.step(2, 'Waiting for the Pre-Call Worksheet page to load');
        await this.waitHelper
            .waitForUrlMatch(/\/tas\/case-setup\/pre-?call-worksheets/i, { timeout: 20000 })
            .catch(() => this.logger.warn('Pre-Call Worksheet URL not confirmed — verifying via page heading instead'));
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        const heading = await this.tasPage.getPreCallWorksheetHeading();
        await this.waitHelper
            .waitForVisible(heading, { timeout: 15000 })
            .catch(() => this.logger.warn('Pre-Call Worksheet heading not confirmed within timeout'));
    }

    /**
     * Verify the Pre-Call Worksheet page loaded successfully.
     * Confirms both the page heading is visible AND the URL matches the
     * Pre-Call Worksheets route.
     */
    async verifyPreCallWorksheetLoaded(): Promise<boolean> {
        this.logger.step(3, 'Verifying the Pre-Call Worksheet page loaded successfully');
        return this.safeCheck('Pre-Call Worksheet page loaded', async () => {
            const heading = await this.tasPage.getPreCallWorksheetHeading();
            const headingVisible = await heading.isVisible({ timeout: 10000 }).catch(() => false);
            const urlMatches = /\/tas\/case-setup\/pre-?call-worksheets/i.test(this.page.url());

            this.logger.info(`Pre-Call Worksheet heading visible: ${headingVisible}`);
            this.logger.info(`Pre-Call Worksheet URL matches: ${urlMatches} (${this.page.url()})`);

            return headingVisible && urlMatches;
        });
    }

    /**
     * Verify Create a TAS Case tab is visible and clickable
     */
    async verifyCreateCaseTabVisible(): Promise<boolean> {
        this.logger.step(4, 'Verifying Create a TAS Case tab is visible');
        return this.safeCheck('Create a TAS Case tab visible', () =>
            this.page
                .getByRole('tab', { name: /create\s+a\s+tas\s+case/i })
                .first()
                .isVisible({ timeout: 5000 })
                .catch(() => false),
        );
    }

    /**
     * Verify Create a Case button is DISABLED (before VIN entry)
     */
    async verifyCreateCaseDisabled(): Promise<boolean> {
        this.logger.step(5, 'Checking Create a Case button is DISABLED');
        return this.safeCheck('Create a Case button disabled', async () => {
            const createCaseBtn = await this.tasPage.getCreateCaseButton();
            return createCaseBtn.isDisabled({ timeout: 5000 }).catch(() => false);
        });
    }

    /**
     * Enter VIN on TAS Home and press Enter to trigger the car/search icon lookup.
     * Waits for the blue ribbon to confirm vehicle info loaded.
     * Gracefully skips if VIN is already set (blue ribbon already showing).
     */
    async enterVIN(vin: string): Promise<void> {
        this.logger.step(6, `Entering VIN on TAS Home: ${vin}`);

        // Check if VIN blue ribbon already shows this VIN (already loaded)
        const alreadyLoaded = await this.page
            .getByText(vin, { exact: false })
            .first()
            .isVisible({ timeout: 1500 })
            .catch(() => false);

        if (alreadyLoaded) {
            this.logger.info(`VIN ${vin} already shown in blue ribbon — skipping header VIN entry`);
            return;
        }

        // Try to find the "Set your VIN" textbox in the header
        const vinInput = await this.tasPage.getVinInput().catch(() => null);
        const vinVisible = vinInput
            ? await vinInput.isVisible({ timeout: 3000 }).catch(() => false)
            : false;

        if (!vinVisible) {
            this.logger.warn('VIN input not found/visible on TAS Home — VIN may already be loaded');
            return;
        }

        await this.actions.fill(vinInput!, vin);
        this.logger.step(7, 'Pressing Enter to trigger VIN search (car/search icon)');
        await this.actions.pressOn(vinInput!, 'Enter');

        this.logger.step(7.1, 'Waiting for VIN info (blue ribbon) to load');
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        // Verify the blue ribbon appeared with the vehicle info
        await this.waitHelper
            .waitForVisible(this.page.getByText(vin, { exact: false }).first(), { timeout: 15000 })
            .catch(() => this.logger.warn('Blue ribbon VIN text not confirmed — proceeding anyway'));
    }

    /**
     * Verify Create a Case button is ENABLED (after VIN entry)
     */
    async verifyCreateCaseEnabled(): Promise<boolean> {
        this.logger.step(8, 'Checking Create a Case button is ENABLED');
        return this.safeCheck('Create a Case button enabled', async () => {
            const createCaseBtn = await this.tasPage.getCreateCaseButton();
            return createCaseBtn.isEnabled({ timeout: 5000 }).catch(() => false);
        });
    }

    /**
     * Click Create a Case button to navigate to General Information page
     */
    async clickCreateCase(): Promise<void> {
        this.logger.step(9, 'Clicking Create a Case button');

        const createCaseBtn = await this.tasPage.getCreateCaseButton();
        await this.actions.click(createCaseBtn);

        this.logger.step(10, 'Waiting for General Information page to load');
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });
    }

    /**
     * Verify General Information page is displayed.
     * Checks for the Assign button which is unique to step 1 General Information.
     */
    async verifyGeneralInfoPageDisplayed(): Promise<boolean> {
        this.logger.step(11, 'Verifying General Information page (step 1) is displayed');
        return this.safeCheck('General Information page visible', async () => {
            // The Assign button is uniquely present on General Information step 1
            const assignBtn = this.page.getByRole('button', { name: 'Assign' });
            const isVisible = await assignBtn.isVisible({ timeout: 15000 }).catch(() => false);

            // Fallback: check the wizard step tab is selected
            const stepTabSelected = isVisible
                ? true
                : await this.page
                      .getByRole('tab', { name: /1\s+general information|general information/i })
                      .first()
                      .getAttribute('aria-selected')
                      .then((v) => v === 'true')
                      .catch(() => false);

            return isVisible || stepTabSelected;
        });
    }

    async openCreateCaseTab(): Promise<void> {
        this.logger.step(12, 'Clicking Create a TAS Case tab');
        const createCaseTab = await this.tasPage.getCreateCaseTab();
        await this.actions.click(createCaseTab);

        this.logger.step(12.1, 'Waiting for /tas/case-setup to load');
        await this.waitHelper.waitForUrlMatch(/\/tas\/case-setup/i, { timeout: 20000 }).catch(() => null);
        // case-setup loads heavy vehicle + dealer data; use the framework default budget, not a 20s outlier.
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 45000, stableWindowMs: 1200 });
    }

    async completeAssignDealerFlow(assignData: AssignDealerData): Promise<void> {
        this.logger.step(13, 'Opening Assign dialog');
        const assignButton = await this.tasPage.getAssignButton();
        await this.actions.click(assignButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1000 });

        this.logger.step(14, `Searching dealer: ${assignData.dealerSearchText}`);
        const dealerCombobox = await this.tasPage.getDealerCombobox();
        await this.actions.click(dealerCombobox);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 8000, stableWindowMs: 500 });

        const dealerInput = await this.tasPage.getDealerSearchInput();
        await this.actions.fill(dealerInput, assignData.dealerSearchText);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 8000, stableWindowMs: 600 });

        const dealerOption = await this.tasPage.getDealerOptionByText(assignData.dealerOptionText);
        await this.actions.click(dealerOption);

        this.logger.step(15, 'Selecting first technician');
        const technicianSelectButton = await this.tasPage.getFirstTechnicianSelectButton();
        await this.actions.click(technicianSelectButton);

        this.logger.step(16, 'Saving assignment and returning');
        const saveAndReturnButton = await this.tasPage.getSaveAndReturnButton();
        await this.actions.click(saveAndReturnButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 25000, stableWindowMs: 1200 });
    }

    async completeGeneralInformation(data: GeneralInformationData): Promise<void> {
        // NOTE: VIN is already pre-populated from TAS Home VIN entry; do not re-fill.
        this.logger.step(17, `Completing General Information fields (VIN ${data.vin} already pre-filled)`);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 10000, stableWindowMs: 700 });

        // Click the calendar icon to open the date picker, then pick any available day.
        // NOTE: Use page.evaluate() to click inside the calendar grid because the fixture's
        this.logger.step(17.1, 'Opening calendar and selecting a date');
        const calendarButton = await this.tasPage.getRepairOrderDateButton();
        await DatePickerHelper.selectCurrentOrFirstAvailableDate(this.page, calendarButton, 'Repair Order Date', this.logger, {
            timeout: 15000,
        });
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 5000, stableWindowMs: 400 });

        const repairOrderInput = await this.tasPage.getRepairOrderInput();
        await this.actions.fill(repairOrderInput, data.repairOrder);

        const odometerInput = await this.tasPage.getOdometerInput();
        await this.actions.fill(odometerInput, data.odometer);

        const directContactInput = await this.tasPage.getDirectContactInput();
        await this.actions.fill(directContactInput, data.directContact);

        await this.selectComboboxOption(await this.tasPage.getCustomerTypeCombobox(), data.customerType);
    }

    async continueFromGeneralInformation(): Promise<void> {
        this.logger.step(18, 'Continuing from General Information');
        const saveAndContinueButton = await this.tasPage.getSaveAndContinueButton();
        await this.actions.click(saveAndContinueButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 25000, stableWindowMs: 1200 });
    }

    async completeCaseDetails(data: CaseDetailsData): Promise<void> {
        await this.fillCaseDetails(data);
        await this.continueFromCaseDetails();
    }

    /**
     * Fill every Case Details field WITHOUT advancing the wizard. Split out from
     * `completeCaseDetails` so a visual snapshot of the filled screen can be taken
     * before navigating away. All values come from static test data (no dynamic values).
     */
    async fillCaseDetails(data: CaseDetailsData): Promise<void> {
        this.logger.step(19, 'Filling Case Details');
        const customerConcernInput = await this.tasPage.getCustomerConcernInput();
        await this.actions.fill(customerConcernInput, data.customerConcern);

        await this.selectComboboxOption(await this.tasPage.getServiceGroupCombobox(), data.serviceGroup);
        await this.selectComboboxOption(await this.tasPage.getServiceCategoryCombobox(), data.serviceCategory);
        await this.selectComboboxOption(await this.tasPage.getSectionCombobox(), data.section);
        await this.selectComboboxOption(await this.tasPage.getSubComponentCombobox(), data.subComponent);
        await this.selectComboboxOption(await this.tasPage.getConditionCombobox(), data.condition);
        await this.selectComboboxOption(await this.tasPage.getPreCallWorksheetCombobox(), data.preCallWorksheet);
    }

    /** Advance from the Case Details step to Diagnostic Information. */
    async continueFromCaseDetails(): Promise<void> {
        this.logger.step(19.1, 'Continuing from Case Details');
        const saveAndContinueButton = await this.tasPage.getSaveAndContinueButton();
        await this.actions.click(saveAndContinueButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 25000, stableWindowMs: 1200 });
    }

    async completeDiagnosticInformation(data: DiagnosticInformationData): Promise<DiagnosticInformationResult> {
        const result = await this.fillDiagnosticInformation(data);
        await this.continueToReviewFromDiagnostic();
        return result;
    }

    /**
     * Fill Diagnostic Information (description + Get DTC + select/move a DTC to Primary)
     * WITHOUT advancing to Review. Split out from `completeDiagnosticInformation` so a
     * visual snapshot of the filled screen can be taken before navigating away.
     */
    async fillDiagnosticInformation(data: DiagnosticInformationData): Promise<DiagnosticInformationResult> {
        this.logger.step(20, 'Completing Diagnostic Information');

        // 1) Fill description
        const diagnosticDescriptionInput = await this.tasPage.getDiagnosticDescriptionInput();
        await this.actions.fill(diagnosticDescriptionInput, data.description);

        // 2) Wait until the DTC Information section is fully loaded, then the
        //    Get DTC button appears — only then click it (for the first item).
        this.logger.step(20.1, 'Waiting for DTC Information section to load');
        const dtcInfoHeading = await this.tasPage.getDTCInformationHeading();
        await this.waitHelper.waitForVisible(dtcInfoHeading, { timeout: 20000 });
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 10000, stableWindowMs: 700 });

        this.logger.step(20.2, 'Clicking Get DTC button to fetch available DTCs');
        const getDTCButton = await this.tasPage.getGetDTCButton();
        await this.waitHelper.waitForVisible(getDTCButton, { timeout: 15000 });
        await this.actions.click(getDTCButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 10000, stableWindowMs: 700 });

        // 3) Wait for DTC Found list to populate with checkboxes
        const dtcFoundItems = this.tasPage.getDTCFoundItems();
        await this.waitHelper.waitForCondition(
            async () => (await dtcFoundItems.count()) > 0,
            { timeout: 25000, interval: 500, message: 'DTC Found list to populate with checkboxes' },
        );
        const foundCount = await dtcFoundItems.count();
        this.logger.info(`DTC Found list populated with ${foundCount} DTC(s)`);

        // 4) Select a DTC checkbox. If only one appeared, that one is used;
        //    if multiple appeared, pick one at random. (No hardcoded DTC value.)
        const randomIndex = foundCount === 1 ? 0 : Math.floor(Math.random() * foundCount);
        const chosenRow = dtcFoundItems.nth(randomIndex);
        await this.waitHelper.waitForVisible(chosenRow, { timeout: 5000 });

        // Capture the chosen checkbox's DTC code from its adjacent label (no pattern
        // assumptions) — used only for logging + later review-page verification.
        const chosenDTCText = await chosenRow.evaluate((el) => {
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
                const text = labelledBy
                    .split(/\s+/)
                    .map((id) => document.getElementById(id)?.textContent || '')
                    .join(' ')
                    .trim();
                if (text) return text;
            }
            // Nearest sibling label text (one code per row)
            let sib = el.nextElementSibling as HTMLElement | null;
            while (sib) {
                const t = sib.textContent?.trim();
                if (t) return t;
                sib = sib.nextElementSibling as HTMLElement | null;
            }
            return el.parentElement?.textContent?.trim() || '';
        });
        const primaryDTC = chosenDTCText.trim().split(/\s+/)[0] ?? chosenDTCText.trim();
        this.logger.info(`Selected DTC checkbox #${randomIndex + 1} of ${foundCount}${primaryDTC ? ` (code: ${primaryDTC})` : ''}`);

        // 5) Click the selected DTC checkbox (force to cover custom-styled checkboxes)
        await this.actions.click(chosenRow, { force: true });

        // 6) Click the right arrow to move the checked DTC from Found → Primary DTC
        this.logger.step(20.3, 'Moving selected DTC to Primary DTC section');
        const moveButton = await this.tasPage.getMoveDTCToPrimaryButton();
        await this.actions.click(moveButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 8000, stableWindowMs: 500 });

        // 7) DTC is selected and moved — the screen is now fully filled and ready to snapshot.
        return {
            description: data.description,
            addedDTCs: [primaryDTC], // The selected/moved DTC, verified later on Review
            primaryDTC,
        };
    }

    /** Advance from the filled Diagnostic Information step to the Review (preview) page. */
    async continueToReviewFromDiagnostic(): Promise<void> {
        this.logger.step(20.4, 'Saving and continuing to Review page');
        const saveAndContinueButton = await this.tasPage.getSaveAndContinueButton();
        await this.actions.click(saveAndContinueButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 25000, stableWindowMs: 1200 });
    }

    /**
     * Verifies the Review (preview) page shows the diagnostic information we just submitted.
     * Confirms the Diagnostic Information section is present and the selected DTC code
     * (captured during selection) appears in the review page's rendered text.
     */
    async verifyDiagnosticInformationOnReview(result: DiagnosticInformationResult): Promise<void> {
        this.logger.step(20.5, 'Verifying Diagnostic Information on Review (preview) page');

        const heading = await this.tasPage.getReviewDiagnosticInformationHeading();
        await this.waitHelper.waitForVisible(heading, { timeout: 15000 });

        if (result.primaryDTC) {
            // Poll the review page's rendered text for the captured DTC code — robust
            // against how the value is wrapped/styled in the review layout.
            await this.waitHelper.waitForCondition(
                async () => {
                    const text = (await this.page.locator('body').innerText()).toUpperCase();
                    return text.includes(result.primaryDTC.toUpperCase());
                },
                { timeout: 15000, interval: 500, message: `Review page to show DTC "${result.primaryDTC}"` },
            );
            this.logger.info(`Review page verified — selected DTC "${result.primaryDTC}" is present`);
        } else {
            this.logger.info('Review page verified — Diagnostic Information section is present');
        }
    }

    async submitCaseAndGetCaseId(): Promise<string> {
        this.logger.step(21, 'Submitting case from Review');
        const submitButton = await this.tasPage.getSubmitButton();
        await this.actions.click(submitButton);
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1500 });

        const submittedSuccessMessage = await this.tasPage.getSubmittedSuccessMessage();
        await submittedSuccessMessage.isVisible({ timeout: 15000 });

        const submittedCaseLink = await this.tasPage.getSubmittedCaseLink();
        const caseIdFromText = (await submittedCaseLink.textContent())?.trim() ?? '';

        if (caseIdFromText) {
            this.logger.info(`Submitted case ID: ${caseIdFromText}`);
            return caseIdFromText;
        }

        const href = await submittedCaseLink.getAttribute('href');
        const caseIdFromHref = href ? new URL(href, this.page.url()).searchParams.get('caseId') : null;
        if (!caseIdFromHref) {
            throw new Error('Unable to extract submitted case ID from success page');
        }

        this.logger.info(`Submitted case ID (from link): ${caseIdFromHref}`);
        return caseIdFromHref;
    }

    async openSubmittedCaseAndVerify(caseId: string): Promise<void> {
        this.logger.step(22, `Opening submitted case ${caseId}`);
        const submittedCaseLink = await this.tasPage.getSubmittedCaseLink();

        // The app always opens the case link in a new tab (target="_blank"),
        // so use clickAndWaitForNewTab — same pattern as UserHomeModule case search.
        const casePage = await this.workflowActions.clickAndWaitForNewTab(
            submittedCaseLink,
            { timeout: 30000 },
        );
        const caseViewPage = new CaseSearchPage(casePage);
        await caseViewPage.waitForPageLoad(caseId);
        this.logger.info(`Case ${caseId} verified on case view page`);
    }

    private async selectComboboxOption(combobox: Awaited<ReturnType<TASPage['getCustomerTypeCombobox']>>, optionText: string): Promise<void> {
        await this.actions.click(combobox);
        const option = await this.tasPage.getDropdownOptionByText(optionText);
        await this.actions.click(option);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Sauce Visual support (additive, opt-in) — region computation lives here in
    // the Module; locators come from the Page; the spec only calls sauceVisualCheck.
    // ─────────────────────────────────────────────────────────────────────

    /** Read the Repair Order Date currently entered on General Information (a run-to-run
     *  dynamic value) so the Review snapshot can mask it by its rendered text. */
    async getEnteredRepairOrderDate(): Promise<string> {
        const dateInput = await this.tasPage.getRepairOrderDateInput();
        return (await dateInput.inputValue().catch(() => '')).trim();
    }

    /** Mask the run-to-run dynamic VALUES on the General Information step: the VIN vehicle
     *  ribbon (live vehicle/warranty/mileage data fetched per run), plus the Repair Order # and
     *  Repair Order Date inputs. Static fields (Odometer, Direct Contact, Customer Type) and all
     *  labels stay in the comparison. */
    async getGeneralInformationVisualIgnoreRegions(vin: string): Promise<VisualIgnoreRegion[]> {
        await this.page.evaluate(() => window.scrollTo(0, 0));
        const regions: VisualIgnoreRegion[] = [];
        const push = (region: VisualIgnoreRegion | null): void => {
            if (region) {
                regions.push(region);
            }
        };
        push(await this.getVehicleRibbonRegion(vin));
        push(await this.wholeRegion(await this.tasPage.getRepairOrderInput()));
        push(await this.wholeRegion(await this.tasPage.getRepairOrderDateInput()));
        return regions;
    }

    /** Mask the dynamic regions on the Diagnostic Information step: the VIN vehicle ribbon plus
     *  the live "DTC Found" list and the moved "Primary DTC" entry (vary by VIN/run). The
     *  Description field and the surrounding layout stay compared. */
    async getDiagnosticVisualIgnoreRegions(vin: string): Promise<VisualIgnoreRegion[]> {
        await this.page.evaluate(() => window.scrollTo(0, 0));
        const regions: VisualIgnoreRegion[] = [];
        const push = (region: VisualIgnoreRegion | null): void => {
            if (region) {
                regions.push(region);
            }
        };
        push(await this.getVehicleRibbonRegion(vin));
        push(await this.wholeRegion(this.tasPage.getPrimaryDtcPanelForVisual()));
        push(await this.wholeRegion(this.tasPage.getDtcFoundPanelForVisual()));
        return regions;
    }

    /**
     * Compute a null-safe ignore region for the VIN vehicle ribbon (the "blue ribbon" banner of
     * live vehicle data shown at the top of the wizard). The ribbon's exact container varies, so
     * rather than a brittle selector we locate the element that renders the VIN text and walk up
     * to its nearest near-full-width band ancestor — masking the whole ribbon row while leaving
     * the rest of the page compared. Returns null if the ribbon is not present.
     */
    private async getVehicleRibbonRegion(vin: string): Promise<VisualIgnoreRegion | null> {
        const box = await this.page
            .evaluate((vinValue) => {
                const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
                const holder = all.find(
                    (el) => (el.textContent || '').includes(vinValue) && el.children.length === 0,
                );
                if (!holder) {
                    return null;
                }
                const pageWidth = document.documentElement.clientWidth;
                let band: HTMLElement = holder;
                let cursor: HTMLElement | null = holder;
                while (cursor && cursor !== document.body) {
                    const rect = cursor.getBoundingClientRect();
                    if (rect.width >= pageWidth * 0.8 && rect.height > 0 && rect.height < 320) {
                        band = cursor;
                        break;
                    }
                    cursor = cursor.parentElement;
                }
                const r = band.getBoundingClientRect();
                return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
            }, vin)
            .catch(() => null);
        return box && box.width > 0 && box.height > 0 ? this.toRegion(box) : null;
    }

    /** Mask the supplied run-to-run dynamic VALUES (Repair Order #, Repair Order Date and the
     *  selected DTC code) wherever they render on the Review page, located by their known text
     *  so only the values are hidden and the labels/layout stay compared. */
    async getReviewVisualIgnoreRegions(dynamicValues: string[]): Promise<VisualIgnoreRegion[]> {
        await this.page.evaluate(() => window.scrollTo(0, 0));
        const regions: VisualIgnoreRegion[] = [];
        for (const value of dynamicValues) {
            if (!value) {
                continue;
            }
            const region = await this.wholeRegion(this.tasPage.getValueText(value));
            if (region) {
                regions.push(region);
            }
        }
        return regions;
    }

    /**
     * Prepare a page for a true full-page screenshot when it renders inside a fixed-height
     * inner scroll container (so native fullPage would clip it). Releases real scroll
     * containers and grows the viewport to the measured content height so the ENTIRE screen is
     * captured and ignore-region bounding boxes line up with the full-page screenshot.
     *
     * This is the STANDARD pre-step for every Sauce Visual snapshot in this flow. It is
     * reversible: it saves the current viewport and restoreAfterFullPageCapture() puts it back,
     * so it is safe to call mid-wizard before a snapshot and restore before the next step.
     */
    async prepareFullPageCapture(): Promise<void> {
        this.viewportBeforeFullPageCapture = this.page.viewportSize() ?? { width: 1440, height: 900 };
        const current = this.viewportBeforeFullPageCapture;

        // Wait for the screen (incl. async inner-scroller content) to settle before measuring.
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 5000, stableWindowMs: 500 }).catch(() => null);

        // Measure the true content height from real, visible scroll/clip containers. Using
        // scrollHeight captures content even when a container clips it with overflow:hidden (e.g.
        // Angular div.scrollable-content). The clientHeight > 200 guard ignores collapsed/animating
        // zero-height panels (accordions, inactive stepper steps) so we never count hidden content.
        const measureContentHeight = (): Promise<number> =>
            this.page.evaluate(() => {
                const heights = [document.documentElement.scrollHeight, document.body.scrollHeight];
                for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
                    const style = window.getComputedStyle(el);
                    const clipsOrScrolls = /(auto|scroll|hidden|clip)/.test(style.overflowY);
                    if (clipsOrScrolls && el.clientHeight > 200 && el.scrollHeight > el.clientHeight + 50) {
                        const rect = el.getBoundingClientRect();
                        heights.push(rect.top + window.scrollY + el.scrollHeight);
                    }
                }
                return Math.ceil(Math.max(...heights));
            });

        // Poll until the measured height stops growing (bounded) — inner-scroller content can render
        // after the step action returns. No fixed sleeps: each wait is two animation frames.
        const nextFrame = (): Promise<void> =>
            this.page.evaluate(
                () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
            );
        let contentHeight = await measureContentHeight();
        for (let i = 0; i < 10; i++) {
            await nextFrame();
            const next = await measureContentHeight();
            if (next <= contentHeight) {
                break;
            }
            contentHeight = next;
        }

        // Grow the viewport FIRST so framework-managed containers (e.g. Angular div.scrollable-content,
        // which re-clamps its own height on resize) lay out tall enough to show all content.
        const targetHeight = Math.min(Math.max(contentHeight + 200, current.height), 20000);
        await this.page.setViewportSize({ width: current.width, height: targetHeight });
        await nextFrame();

        // THEN release any remaining real scroll/clip container. Doing this AFTER the resize means the
        // framework's resize re-clamp has already run, so our inline override is not undone. The
        // clientHeight > 200 guard keeps collapsed/animating panels untouched.
        await this.page.evaluate(() => {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
                const style = window.getComputedStyle(el);
                const clipsOrScrolls = /(auto|scroll|hidden|clip)/.test(style.overflowY);
                if (clipsOrScrolls && el.clientHeight > 200 && el.scrollHeight > el.clientHeight + 50) {
                    el.style.setProperty('overflow', 'visible', 'important');
                    el.style.setProperty('height', 'auto', 'important');
                    el.style.setProperty('max-height', 'none', 'important');
                }
            }
            document.documentElement.style.setProperty('height', 'auto', 'important');
            document.body.style.setProperty('height', 'auto', 'important');
        });

        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 5000, stableWindowMs: 500 }).catch(() => null);
    }

    /**
     * Undo prepareFullPageCapture(): restore the original viewport so subsequent wizard steps
     * interact with the normal layout. Safe to call even if prepare was never run (no-op). The
     * released inner-scroller inline styles do not need explicit reset — the SPA re-renders the
     * next step — but the viewport must be put back.
     */
    async restoreAfterFullPageCapture(): Promise<void> {
        if (!this.viewportBeforeFullPageCapture) {
            return;
        }
        await this.page.setViewportSize(this.viewportBeforeFullPageCapture);
        await this.page.evaluate(() => window.scrollTo(0, 0));
        this.viewportBeforeFullPageCapture = null;
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 5000, stableWindowMs: 500 }).catch(() => null);
    }

    private toRegion(box: { x: number; y: number; width: number; height: number }): VisualIgnoreRegion {
        return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
        };
    }

    /** Mask the full bounding box of a value-only locator. Off-screen / zero-size / missing
     *  locators are skipped so a missing field never breaks the run. */
    private async wholeRegion(locator: Locator): Promise<VisualIgnoreRegion | null> {
        const box = await locator.boundingBox().catch(() => null);
        return box && box.width > 0 && box.height > 0 ? this.toRegion(box) : null;
    }
}
