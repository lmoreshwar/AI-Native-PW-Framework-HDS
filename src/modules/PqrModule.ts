import { Page, type Locator } from '@playwright/test';
import { PqrPage } from '../pages/PqrPage';
import { LoginPage } from '../pages/LoginPage';
import { Actions } from '../utils/Actions';
import { Logger } from '../utils/Logger';
import { TIMEOUTS } from '../utils/constants';
import { WaitHelper } from '../utils/WaitHelper';
import { attachmentPath } from '../utils/paths';
import type { YesNo } from '../utils/types';

export interface ExpectedVehicle {
    division: string;
    model: string;
    modelYear: string;
    vin: string;
}

export interface PqrRepairInformationData {
    title: string;
    odometer: string;
    sourceLocationLabel: string;
    pqrType: string;
    randomDropdownLabels: string[];
}

export interface PqrPartNumberData {
    partNumber: string;
    serialDate: string;
    quantity: string;
}

export interface PqrRepairDetailsData {
    conditionDescription: string;
    diagnosticSteps: string;
    observation: string;
    repairProcess: string;
}

export interface PqrSubmitResult {
    successVisible: boolean;
    caseNumber: string;
}

export interface PqrBlockedSubmitResult {
    blocked: boolean;
    errorCount: number;
    errorMessages: string[];
}

export class PqrModule {
    private pqrPage: PqrPage;
    private loginPage: LoginPage;
    private actions: Actions;
    private waitHelper: WaitHelper;
    private logger: Logger;
    /** Last PQR Type selected — re-asserted before submit (it is a required field). */
    private lastPqrType = '';

    constructor(private page: Page) {
        this.pqrPage = new PqrPage(page);
        this.loginPage = new LoginPage(page);
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
        this.logger = Logger.create('PqrModule');
    }

    /**
     * Navigate to the PQR landing URL, complete SSO sign-in if the login form is shown,
     * and land on the Create Port Quality Report screen. Mirrors the FTR sign-in flow:
     * the landing URL is opened directly (no menu walk), the SSO redirect chain is
     * awaited, the loading icon is waited out, and a post-login bounce-back is recovered
     * by re-navigating to the landing URL. Reuses the shared LoginPage — only the
     * credentials differ per application.
     */
    async loginToPqr(landingUrl: string, username: string, password: string): Promise<void> {
        this.logger.testStart('PQR Login Workflow');

        this.logger.step(1, `Navigating to PQR landing URL: ${landingUrl}`);
        await this.page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION });
        // This app polls the backend continuously, so it never reaches network-idle —
        // ride out only an active loading spinner, then let the landing/login poll decide.
        await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.MEDIUM }).catch(() => null);

        let loginState = await this.waitForLandingOrLoginForm(TIMEOUTS.MEDIUM);
        if (loginState === 'none') {
            this.logger.warn('Neither landing nor login form appeared — retrying landing URL once');
            await this.page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION });
            await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.MEDIUM }).catch(() => null);
            loginState = await this.waitForLandingOrLoginForm(TIMEOUTS.MEDIUM);
        }

        if (loginState === 'landing') {
            this.logger.info('SSO form skipped — already on PQR landing page');
        } else if (loginState === 'login') {
            const usernameInputForWait = await this.loginPage.getUsernameInput();
            await this.waitHelper.waitForVisible(usernameInputForWait, { timeout: TIMEOUTS.MEDIUM });

            this.logger.step(2, `Filling PQR username: ${username}`);
            const usernameInput = await this.loginPage.getUsernameInput();
            await this.actions.fill(usernameInput, username, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });

            this.logger.step(3, 'Filling PQR password');
            const passwordInput = await this.loginPage.getPasswordInput();
            await this.actions.fill(passwordInput, password, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });

            this.logger.step(4, 'Clicking the sign-in button');
            const loginButton = await this.loginPage.getLoginButton();
            await this.actions.click(loginButton, { timeout: TIMEOUTS.MEDIUM });
        } else {
            throw new Error('Unable to detect either PQR landing page or SSO login form after navigation.');
        }

        this.logger.step(5, 'Waiting for the SSO redirect chain to land on the PQR page');
        await this.waitHelper.waitForUrlMatch(/generic-page-25-12/i, { timeout: TIMEOUTS.LONG }).catch(() => null);
        // No network-idle wait: constant backend polling means the page is never idle.
        // The URL matches BEFORE SSO finishes, so wait on the actual landing heading
        // (raw locator, tolerates the slow settle) as the real readiness signal.
        await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.MEDIUM }).catch(() => null);
        await this.pqrPage.waitForLandingHeadingReady(TIMEOUTS.LONG);

        this.logger.step(6, 'Ensuring the Create Port Quality Report landing page is shown');
        await this.ensureOnPqrLanding(landingUrl);

        this.logger.testEnd('PQR Login Workflow');
    }

    async verifyLandingDisplayed(): Promise<boolean> {
        try {
            // The heading being visible IS the readiness signal. Only briefly ride out an
            // active spinner — no heavy stabilize wait that idles for seconds when the page
            // is already ready (this was the landing-page delay before VIN entry).
            const heading = await this.pqrPage.getLandingHeading();
            await this.waitHelper.waitForVisible(heading, { timeout: TIMEOUTS.LONG });
            await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.SHORT }).catch(() => null);
            return heading.isVisible();
        } catch {
            return false;
        }
    }

    async isCqsWidgetHidden(): Promise<boolean> {
        return !(await this.pqrPage.getCqsQuestionText().isVisible().catch(() => false));
    }

    async selectSingleVin(): Promise<void> {
        const singleVin = await this.pqrPage.getSingleVinOption();
        // "Single VIN" is the default choice — clicking an already-checked radio only
        // burns actionability time while the app re-renders. Skip it when already set.
        if (await this.isCheckedNow(singleVin)) {
            this.logger.info('Single VIN is already selected — skipping redundant click.');
            return;
        }
        await this.actions.click(singleVin, { timeout: TIMEOUTS.MEDIUM });
    }

    async selectMultipleVin(): Promise<void> {
        await this.actions.click(await this.pqrPage.getMultipleVinOption(), { timeout: TIMEOUTS.MEDIUM });
    }

    /**
     * Type a VIN into the Multi-VIN input and click "Add VIN". The first click commits
     * the typed value to the field; the second appends the row to the grid (UAT behaviour).
     * Returns true once the row is present in the grid.
     */
    async addVin(vin: string): Promise<boolean> {
        const input = this.pqrPage.getMultiVinInput();
        await this.actions.fill(input, vin, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });
        // First click commits the typed value; second appends the grid row.
        await this.actions.click(await this.pqrPage.getAddVinButton(), { timeout: TIMEOUTS.MEDIUM });
        await this.actions.click(await this.pqrPage.getAddVinButton(), { timeout: TIMEOUTS.MEDIUM });
        const row = this.pqrPage.getVinRowByValue(vin);
        await this.waitHelper.waitForVisible(row, { timeout: TIMEOUTS.MEDIUM });
        return row.isVisible().catch(() => false);
    }

    /**
     * Click "Set Primary" for the given VIN row. Returns true once the primary label is
     * visible on that row (Vehicle Information populates after the click).
     */
    async setPrimaryVin(vin: string): Promise<boolean> {
        const row = this.pqrPage.getVinRowByValue(vin);
        await this.actions.click(this.pqrPage.getSetPrimaryInRow(row), { timeout: TIMEOUTS.MEDIUM });
        await this.pqrPage.waitForVehicleInformationReady(TIMEOUTS.LONG);
        return this.pqrPage.getPrimaryLabelInRow(row).isVisible().catch(() => false);
    }

    async enterVinAndValidate(vin: string): Promise<void> {
        this.logger.info(`Entering VIN: ${vin}`);
        const started = Date.now();
        await this.actions.fill(await this.pqrPage.getVinInput(), vin, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });
        this.logger.info(`VIN entered in ${Date.now() - started} ms — clicking Validate`);
        await this.actions.click(await this.pqrPage.getValidateButton(), { timeout: TIMEOUTS.MEDIUM });
        // The Vehicle Information heading is the real outcome; ride out only the active
        // validate spinner (returns immediately once it clears) then wait for the heading.
        // Use the raw ready-wait (not SmartLocator.resolve, whose 5s fast-fail fires before
        // the async VIN lookup renders the section) so the LONG timeout actually applies.
        await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.LONG }).catch(() => null);
        const vehicleReady = await this.pqrPage.waitForVehicleInformationReady(TIMEOUTS.LONG);
        if (!vehicleReady) {
            throw new Error('Vehicle Information did not appear after VIN validation.');
        }
    }

    /**
     * Enter an invalid VIN and click Validate. Returns whether the inline error is shown
     * and the Vehicle Information section remained empty — the expected outcome for a
     * VIN the backend does not recognise.
     */
    async validateVinExpectingError(vin: string): Promise<{ errorVisible: boolean; vehicleInfoEmpty: boolean }> {
        this.logger.info(`Validating invalid VIN: ${vin}`);
        await this.actions.fill(await this.pqrPage.getVinInput(), vin, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });
        await this.actions.click(await this.pqrPage.getValidateButton(), { timeout: TIMEOUTS.MEDIUM });
        await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.LONG }).catch(() => null);
        // The inline "Invalid VIN" error renders asynchronously after the backend VIN lookup
        // returns — wait for it before reading visibility so a point-in-time check can't miss it.
        const invalidVinError = this.pqrPage.getInvalidVinError();
        await this.waitHelper.waitForVisible(invalidVinError, { timeout: TIMEOUTS.MEDIUM }).catch(() => null);
        const errorVisible = await invalidVinError.isVisible().catch(() => false);
        const vehicleInfoEmpty = !(await this.pqrPage.waitForVehicleInformationReady(TIMEOUTS.SHORT));
        return { errorVisible, vehicleInfoEmpty };
    }

    async verifyVehicleInformation(expected: ExpectedVehicle): Promise<boolean> {
        const values = [expected.division, expected.model, expected.modelYear, expected.vin];
        for (const value of values) {
            const visible = await this.page.getByText(value, { exact: true }).first().isVisible().catch(() => false);
            if (!visible) {
                return false;
            }
        }
        return true;
    }

    /**
     * Returns true if the "Create Draft PQR" button is both visible and enabled. The
     * button is conditionally rendered/enabled only after a valid primary VIN is set.
     */
    async isCreateDraftPqrAvailable(): Promise<boolean> {
        const btn = this.page.getByRole('button', { name: /create draft pqr/i }).first();
        const visible = await btn.isVisible().catch(() => false);
        if (!visible) return false;
        return btn.isEnabled().catch(() => false);
    }

    async createDraftPqr(): Promise<void> {
        const createButton = await this.pqrPage.getCreateDraftPqrButton();
        await this.actions.scrollIntoView(createButton, { timeout: TIMEOUTS.MEDIUM }).catch(() => null);
        await this.actions.click(createButton, { timeout: TIMEOUTS.MEDIUM });

        // The button can be visible a beat before its click handler is wired, so the first
        // click is sometimes swallowed. If navigation has not begun shortly, click again.
        const navigated = await this.waitHelper
            .waitForUrlContains('generic-create-case', { timeout: TIMEOUTS.MEDIUM })
            .then(() => true)
            .catch(() => false);
        if (!navigated) {
            this.logger.warn('Create Draft PQR click did not navigate; clicking once more.');
            await this.actions.click(await this.pqrPage.getCreateDraftPqrButton(), { timeout: TIMEOUTS.MEDIUM, force: true });
            await this.waitHelper.waitForUrlContains('generic-create-case', { timeout: TIMEOUTS.LONG });
        }
        await this.waitForCreateMainScreenReady();
    }

    /**
     * The PQR Create Main screen renders several MFEs and shows MULTIPLE sequential
     * loading icons before the Repair Information form appears. On a cold run the
     * case-create micro-frontend intermittently fails to mount (blank body + perpetual
     * spinner). Wait out every loader (long grace between spinners) and anchor on the
     * Repair Date field; reload and re-wait as many times as the deadline allows so the
     * first attempt self-recovers instead of relying on an external suite retry.
     */
    private async waitForCreateMainScreenReady(): Promise<void> {
        const deadline = Date.now() + TIMEOUTS.TEST;
        let reloadCount = 0;

        while (Date.now() < deadline) {
            // isMainFormVisible waits (up to MEDIUM) for the Repair Date anchor — the real
            // mount signal. We do NOT wait on the generic loader here: this screen keeps a
            // persistent spinner in the DOM, so a loader-clear wait would only burn time.
            if (await this.pqrPage.isMainFormVisible(TIMEOUTS.MEDIUM)) {
                this.logger.info(`PQR Create Main screen form is ready (after ${reloadCount} reload(s)).`);
                return;
            }

            if (Date.now() >= deadline - TIMEOUTS.LONG) {
                break;
            }

            reloadCount += 1;
            this.logger.info(`Create-case form not mounted yet; reloading to recover the MFE (reload #${reloadCount}).`);
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION });
        }

        // Final anchored wait so a genuine failure surfaces a clear error.
        await this.pqrPage.waitForMainFormVisible(TIMEOUTS.LONG);
    }

    async fillRepairInformation(data: PqrRepairInformationData): Promise<void> {
        await this.fillRepairDate();

        const odometer = await this.pqrPage.getTextboxByLabel('Odometer');
        await this.actions.fill(odometer, data.odometer, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });

        await this.selectRadio('Unit Of Distance', 'Miles');
        await this.selectRadio('PQR Type', data.pqrType);
        this.lastPqrType = data.pqrType;

        const title = await this.pqrPage.getTextboxByLabel('Title');
        await this.actions.fill(title, data.title, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });

        await this.selectRandomDropdownOption(data.sourceLocationLabel);
        for (const label of data.randomDropdownLabels) {
            await this.selectRandomDropdownOption(label);
        }
    }

    /**
     * Add a DTC row to the grid WITHOUT marking it primary. Returns true once the row is
     * present. Shared by the happy-path `addPrimaryDtc` and the missing-primary negative flow.
     */
    async addDtc(dtcCode: string): Promise<boolean> {
        const dtcInput = await this.pqrPage.getDtcInput();
        // After the dropdown cascade the screen re-flashes its loading icon and the page
        // scrolls; wait for the field to stop moving so the value isn't typed mid-reflow.
        await this.waitForFieldSettled(dtcInput);
        await this.actions.fill(dtcInput, dtcCode, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });
        await this.actions.click(await this.pqrPage.getAddDtcButton(), { timeout: TIMEOUTS.MEDIUM });
        // The added-row appearing below is the real outcome signal (a generic loader
        // wait would burn its full timeout against the screen's persistent spinner).
        const row = this.pqrPage.getDtcRowByCode(dtcCode);
        await this.waitHelper.waitForVisible(row, { timeout: TIMEOUTS.MEDIUM });
        return row.isVisible().catch(() => false);
    }

    async addPrimaryDtc(dtcCode: string): Promise<boolean> {
        await this.addDtc(dtcCode);
        const row = this.pqrPage.getDtcRowByCode(dtcCode);

        const setPrimary = this.pqrPage.getSetPrimaryInRow(row);
        if (await setPrimary.isVisible().catch(() => false)) {
            await this.actions.click(setPrimary, { timeout: TIMEOUTS.MEDIUM });
        }

        const primary = this.pqrPage.getPrimaryLabelInRow(row);
        return primary.isVisible().catch(() => false);
    }

    /**
     * Add a Part row to the grid WITHOUT marking it primary. Returns true once the row is
     * present. Shared by the happy-path `addPrimaryPart` and the missing-primary negative flow.
     */
    async addPart(data: PqrPartNumberData, shipChoice: YesNo = 'Yes'): Promise<boolean> {
        await this.selectRadio('Would you be able to ship the part(s) upon request within the next 30 calendar days?', shipChoice);

        const partNumberInput = await this.pqrPage.getPartNumberInput();
        // After the dropdown cascade the screen re-flashes its loading icon and the page
        // scrolls; wait for the field to stop moving so the value isn't typed mid-reflow.
        await this.waitForFieldSettled(partNumberInput);
        await this.actions.fill(partNumberInput, data.partNumber, {
            timeout: TIMEOUTS.MEDIUM,
            clearFirst: true,
        });
        await this.actions.fill(await this.pqrPage.getPartSerialDateInput(), data.serialDate, {
            timeout: TIMEOUTS.MEDIUM,
            clearFirst: true,
        });
        await this.actions.fill(await this.pqrPage.getPartQuantityInput(), data.quantity, {
            timeout: TIMEOUTS.MEDIUM,
            clearFirst: true,
        });

        await this.actions.click(await this.pqrPage.getAddPartButton(), { timeout: TIMEOUTS.MEDIUM });
        // The added-row appearing below is the real outcome signal (a generic loader
        // wait would burn its full timeout against the screen's persistent spinner).
        const row = this.pqrPage.getPartRowByNumber(data.partNumber);
        await this.waitHelper.waitForVisible(row, { timeout: TIMEOUTS.MEDIUM });
        return row.isVisible().catch(() => false);
    }

    async addPrimaryPart(data: PqrPartNumberData, shipChoice: YesNo = 'Yes'): Promise<boolean> {
        await this.addPart(data, shipChoice);
        const row = this.pqrPage.getPartRowByNumber(data.partNumber);

        const setPrimary = this.pqrPage.getSetPrimaryInRow(row);
        if (await setPrimary.isVisible().catch(() => false)) {
            await this.actions.click(setPrimary, { timeout: TIMEOUTS.MEDIUM });
        }

        return this.pqrPage.getPrimaryLabelInRow(row).isVisible().catch(() => false);
    }

    /**
     * Click Submit expecting the submission to be BLOCKED because neither the Part nor the
     * DTC was set as primary. Returns whether the app stayed on the create screen (no
     * success banner / case number) and the distinct primary-required error messages
     * rendered under the Part and DTC tables.
     */
    async submitExpectingMissingPrimaryErrors(): Promise<PqrBlockedSubmitResult> {
        // PQR Type is a required field that can lose its selection during the cascades —
        // re-assert it so the ONLY thing blocking submit is the missing primary selection.
        await this.ensurePqrTypeStillSelected();

        await this.actions.scrollIntoView(await this.pqrPage.getSubmitButton(), { timeout: TIMEOUTS.MEDIUM });
        await this.actions.click(await this.pqrPage.getSubmitButton(), { timeout: TIMEOUTS.MEDIUM });

        // A blocked submit renders inline errors under the grids and does NOT navigate to
        // the success state — wait for the first primary-required error to appear.
        const errors = this.pqrPage.getMissingPrimaryErrors();
        await this.waitHelper.waitForVisible(errors.first(), { timeout: TIMEOUTS.LONG }).catch(() => null);

        const errorCount = await errors.count().catch(() => 0);
        const errorMessages = await this.collectMissingPrimaryErrors();
        const reachedSuccess =
            this.page.url().includes('/user-home') ||
            (await this.pqrPage.getSubmissionSuccessText().isVisible().catch(() => false)) ||
            (await this.pqrPage.getCaseManagementCenterHeading().isVisible().catch(() => false));

        return { blocked: !reachedSuccess, errorCount, errorMessages };
    }

    /** Collect distinct primary-required messages shown under the Part/DTC tables. */
    private async collectMissingPrimaryErrors(): Promise<string[]> {
        const errors = this.pqrPage.getMissingPrimaryErrors();
        const count = await errors.count().catch(() => 0);
        const messages: string[] = [];
        for (let i = 0; i < Math.min(count, 10); i++) {
            const text = (await errors.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
            if (text) {
                messages.push(text);
            }
        }
        return [...new Set(messages)];
    }

    async fillRepairDetails(data: PqrRepairDetailsData): Promise<void> {
        await this.fillRepairDetail('Condition Description', data.conditionDescription);
        await this.fillRepairDetail('Diagnostic Steps', data.diagnosticSteps);
        await this.fillRepairDetail('Observation', data.observation);
        await this.fillRepairDetail('Repair Process', data.repairProcess);
    }

    /**
     * Upload a file to the PQR Attachments widget and verify it appears in the list.
     * The file must exist under `src/testdata/attachments/` and is referenced by name.
     * Clicks "Click To Browse", supplies the file through the OS file chooser, then waits
     * for the uploaded file to be listed. Returns true once the file name is shown.
     *
     * @param fileName file name incl. extension, e.g. `sample-attachment.txt`.
     */
    async uploadAttachment(fileName: string): Promise<boolean> {
        const filePath = attachmentPath(fileName);
        const browseButton = await this.pqrPage.getBrowseAttachmentButton();
        await this.actions.scrollIntoView(browseButton, { timeout: TIMEOUTS.MEDIUM }).catch(() => null);
        await this.actions.uploadViaFileChooser(browseButton, filePath, { timeout: TIMEOUTS.MEDIUM });

        // The file name appearing in the attachment list is the real upload-complete signal.
        const listed = this.pqrPage.getAttachmentByName(fileName);
        await this.waitHelper.waitForVisible(listed, { timeout: TIMEOUTS.LONG }).catch(() => null);
        return listed.isVisible().catch(() => false);
    }

    async submitPqr(): Promise<PqrSubmitResult> {
        // PQR Type is a required field that occasionally loses its selection during the
        // downstream cascades — re-assert it before submitting.
        await this.ensurePqrTypeStillSelected();

        await this.actions.scrollIntoView(await this.pqrPage.getSubmitButton(), { timeout: TIMEOUTS.MEDIUM });
        await this.actions.click(await this.pqrPage.getSubmitButton(), { timeout: TIMEOUTS.MEDIUM });

        if (!(await this.waitForSubmitOutcome(TIMEOUTS.LONG))) {
            const problems = await this.collectValidationProblems();
            if (problems.length) {
                this.logger.warn(`Submit blocked by required/invalid field(s): ${problems.join(' | ')}`);
            }
            // The usual culprit is the PQR Type radio — re-assert every required radio and
            // submit once more before giving up.
            await this.ensurePqrTypeStillSelected();
            await this.actions.scrollIntoView(await this.pqrPage.getSubmitButton(), { timeout: TIMEOUTS.MEDIUM });
            await this.actions.click(await this.pqrPage.getSubmitButton(), { timeout: TIMEOUTS.MEDIUM });
            await this.waitForSubmitOutcome(TIMEOUTS.LONG);
        }

        const successVisible =
            (await this.pqrPage.getSubmissionSuccessText().isVisible().catch(() => false)) ||
            (await this.pqrPage.getCaseManagementCenterHeading().isVisible().catch(() => false)) ||
            this.page.url().includes('/user-home');

        const bodyText = (await this.page.locator('body').innerText().catch(() => '')).trim();
        const match = /\bPQR\d+\b/i.exec(bodyText);
        const caseNumber = match ? match[0] : '';

        return { successVisible, caseNumber };
    }

    /** True once the submission success state (URL / banner / center heading) is reached. */
    private async waitForSubmitOutcome(timeout: number): Promise<boolean> {
        return this.waitHelper
            .waitForCondition(
                async () => {
                    const byUrl = this.page.url().includes('/user-home');
                    const bySuccess = await this.pqrPage.getSubmissionSuccessText().isVisible().catch(() => false);
                    const byCenter = await this.pqrPage.getCaseManagementCenterHeading().isVisible().catch(() => false);
                    return byUrl || bySuccess || byCenter;
                },
                { timeout },
            )
            .then(() => true)
            .catch(() => false);
    }

    /** Collect distinct required/invalid-field messages shown after a blocked submit. */
    private async collectValidationProblems(): Promise<string[]> {
        const errors = this.pqrPage.getValidationErrorMessages();
        const count = await errors.count().catch(() => 0);
        const messages: string[] = [];
        for (let i = 0; i < Math.min(count, 10); i++) {
            const text = (await errors.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
            if (text) {
                messages.push(text);
            }
        }
        return [...new Set(messages)];
    }

    /** Re-select the PQR Type radio if it lost its checked state (required field). */
    private async ensurePqrTypeStillSelected(): Promise<void> {
        if (!this.lastPqrType) {
            return;
        }
        const radio = await this.pqrPage.getRadioInGroup('PQR Type', this.lastPqrType).catch(() => null);
        if (radio && (await this.isRadioChecked(radio))) {
            return;
        }
        this.logger.warn(`PQR Type "${this.lastPqrType}" is not selected before submit — re-selecting.`);
        await this.selectRadio('PQR Type', this.lastPqrType);
    }

    private async fillRepairDate(): Promise<void> {
        const repairDate = await this.pqrPage.getRepairDateInput();
        // Repair Date is a native <input type="date"> — use ISO handling to avoid "Malformed value".
        await this.actions.fillNativeDate(repairDate, 'today', { timeout: TIMEOUTS.MEDIUM });
    }

    private async selectRadio(groupLabel: string, option: string): Promise<void> {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const radio = await this.pqrPage.getRadioInGroup(groupLabel, option);
            // The create-case screen re-flashes its loading icon and re-lays-out the form on
            // entry; settle the radio before clicking so the flicker doesn't eat the click
            // (same stability guard already used for the DTC/Part fields).
            await this.waitForFieldSettled(radio);
            await this.actions.scrollIntoView(radio, { timeout: TIMEOUTS.SHORT }).catch(() => null);
            await this.actions.click(radio, { timeout: TIMEOUTS.MEDIUM, force: true });
            if (await this.isRadioChecked(radio)) {
                return;
            }
            this.logger.warn(`Radio "${groupLabel}" = "${option}" did not register as checked (attempt ${attempt}/${maxAttempts}); retrying`);
        }
        throw new Error(`Failed to select the "${option}" radio in the "${groupLabel}" group after ${maxAttempts} attempts.`);
    }

    /** One-shot checked probe (no polling) for idempotent radio handling. */
    private async isCheckedNow(radio: Locator): Promise<boolean> {
        if ((await radio.isChecked().catch(() => false)) === true) {
            return true;
        }
        return (await radio.getAttribute('aria-checked').catch(() => null)) === 'true';
    }

    /** Poll a radio's checked state, tolerating custom widgets that use aria-checked. */
    private async isRadioChecked(radio: Locator): Promise<boolean> {
        const deadline = Date.now() + TIMEOUTS.SHORT;
        while (Date.now() < deadline) {
            if ((await radio.isChecked().catch(() => false)) === true) {
                return true;
            }
            if ((await radio.getAttribute('aria-checked').catch(() => null)) === 'true') {
                return true;
            }
            await this.page.waitForTimeout(150);
        }
        return false;
    }

    private async fillRepairDetail(label: string, value: string): Promise<void> {
        const field = await this.pqrPage.getRepairDetailTextarea(label);
        await this.actions.scrollIntoView(field, { timeout: TIMEOUTS.MEDIUM });
        await this.actions.fill(field, value, { timeout: TIMEOUTS.MEDIUM, clearFirst: true });
    }

    /**
     * Wait for a field to stop moving before typing into it. The create-case screen
     * re-flashes its loading icon after the dropdown cascade, which re-lays-out the form
     * and scrolls the page; typing mid-reflow can drop characters. Element stability is
     * used deliberately instead of a generic loader-invisibility wait — this screen keeps
     * a persistent spinner node in the DOM, so a loader wait would hang. Returns fast when
     * the field is already still.
     */
    private async waitForFieldSettled(field: Locator): Promise<void> {
        await this.waitHelper.waitForElementStable(field, { timeout: TIMEOUTS.MEDIUM }).catch(() => null);
    }

    private async selectRandomDropdownOption(label: string): Promise<void> {
        // Cascading dropdowns: a downstream list only populates after the previous
        // selection registers, so each pick is VERIFIED (and retried) before moving on.
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const combobox = await this.pqrPage.getComboboxByLabel(label);
            await this.actions.scrollIntoView(combobox, { timeout: TIMEOUTS.MEDIUM });
            await this.actions.click(combobox, { timeout: TIMEOUTS.MEDIUM });

            const selectedText = await this.pickRandomOpenOption(label);
            if (selectedText && (await this.isDropdownSelected(combobox, selectedText))) {
                this.logger.info(`Selected option for ${label}: ${selectedText} (attempt ${attempt})`);
                // No generic loader-clear wait here: the create-case screen keeps a
                // persistent spinner in the DOM, so that wait always burned its full
                // timeout. The combobox text is already verified above, and the next
                // dropdown's option-visibility wait covers the cascade reactively.
                return;
            }

            this.logger.warn(`Dropdown "${label}" did not register a selection (attempt ${attempt}/${maxAttempts}); retrying`);
            await this.closeOpenDropdown();
        }

        throw new Error(`Failed to select a value in the "${label}" dropdown after ${maxAttempts} attempts.`);
    }

    /**
     * Pick a random REAL option (skips the "Select" placeholder) from the open panel.
     * Returns the chosen option text, or null if no selectable option appeared.
     */
    private async pickRandomOpenOption(label: string): Promise<string | null> {
        const options = this.pqrPage.getVisibleDropdownOptions();
        await this.waitHelper.waitForVisible(options.first(), { timeout: TIMEOUTS.MEDIUM }).catch(() => null);

        const selectable = options.filter({ hasNotText: /^\s*select\s*$/i });
        const count = await selectable.count();
        if (count === 0) {
            this.logger.warn(`No selectable options appeared for "${label}"`);
            return null;
        }

        const option = selectable.first();
        await this.actions.scrollIntoView(option, { timeout: TIMEOUTS.SHORT }).catch(() => null);
        const text = (await option.innerText()).trim();
        await option.evaluate((el) => (el as HTMLElement).click());
        return text;
    }

    /** A dropdown is "selected" once the combobox shows the chosen text (no longer "Select"). */
    private async isDropdownSelected(combobox: Locator, selectedText: string): Promise<boolean> {
        try {
            await this.waitHelper.waitForTextContains(combobox, selectedText, { timeout: TIMEOUTS.SHORT, interval: 250 });
            return true;
        } catch {
            return false;
        }
    }

    /** Close any open option panel so a failed attempt can be retried cleanly. */
    private async closeOpenDropdown(): Promise<void> {
        await this.actions.press('Escape').catch(() => null);
        const options = this.pqrPage.getVisibleDropdownOptions();
        await this.waitHelper.waitForHidden(options.first(), { timeout: TIMEOUTS.SHORT }).catch(() => null);
    }

    /**
     * Guarantee we end on the PQR landing page. After SSO some flows bounce back to
     * the app root; if the landing heading is not present, re-navigate to the PQR
     * URL and wait again.
     */
    private async ensureOnPqrLanding(landingUrl: string): Promise<void> {
        if (await this.isPqrHeadingVisible(TIMEOUTS.MEDIUM)) {
            return;
        }

        this.logger.warn('PQR landing heading not present after login — re-navigating to PQR URL');
        await this.page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION });
        // No network-idle wait (app polls the backend continuously); wait on the landing
        // heading itself (raw locator, tolerates the slow SSO settle) as the readiness signal.
        await this.waitHelper.waitForActiveLoaderToClear({ timeout: TIMEOUTS.MEDIUM }).catch(() => null);
        await this.pqrPage.waitForLandingHeadingReady(TIMEOUTS.LONG);
    }

    /** Non-throwing check for the PQR landing heading (raw wait, no SmartLocator fast-fail). */
    private async isPqrHeadingVisible(timeout: number): Promise<boolean> {
        return this.pqrPage.waitForLandingHeadingReady(timeout);
    }

    /** Wait until either the PQR landing heading or the SSO username form becomes visible. */
    private async waitForLandingOrLoginForm(timeoutMs: number): Promise<'landing' | 'login' | 'none'> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const landingVisible = await this.page
                .getByRole('heading', { name: /create port quality report/i })
                .first()
                .isVisible()
                .catch(() => false);
            if (landingVisible) {
                return 'landing';
            }

            const loginVisible = await this.page
                .locator('input[name*="user" i], input[type="email"], input[type="text"]')
                .first()
                .isVisible()
                .catch(() => false);
            if (loginVisible) {
                return 'login';
            }

            await this.page.waitForTimeout(500);
        }
        return 'none';
    }
}
