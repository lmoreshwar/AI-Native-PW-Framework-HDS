import { Page, type Locator } from '@playwright/test';
import { FTRPage } from '../pages/FTRPage';
import { LoginPage } from '../pages/LoginPage';
import { Logger } from '../utils/Logger';
import { Actions } from '../utils/Actions';
import { WaitHelper } from '../utils/WaitHelper';
import { WorkflowActions } from '../utils/WorkflowActions';
import type { YesNo } from '../utils/types';

export interface ExpectedVehicle {
    division: string;
    model: string;
    modelYear: string;
    vin: string;
}

export interface FtrRepairInformationData {
    title: string;
    radioSelections: Array<{ groupLabel: string; option: string }>;
    randomDropdownLabels: string[];
}

/**
 * The dynamic values actually entered while filling Repair Information. Returned so a
 * downstream verification (e.g. the case-view check) can assert the persisted values
 * without re-deriving the randomized inputs.
 */
export interface FtrEnteredRepairInfo {
    repairOrder: string;
    odometer: string;
    title: string;
    radioSelections: Array<{ groupLabel: string; option: string }>;
    dropdownSelections: Array<{ label: string; value: string }>;
}

export interface FtrDtcFlowResult {
    rowAddedVisible: boolean;
    setPrimaryClicked: boolean;
    actionPrimaryVisible: boolean;
    deleteAvailable: boolean;
    dialogHeaderVisible: boolean;
    dialogMessageVisible: boolean;
    dialogDeleteOptionVisible: boolean;
    dialogCancelOptionVisible: boolean;
    rowVisibleAfterCancel: boolean;
    rowRemovedAfterDelete: boolean;
}

export interface FtrPartNumberData {
    partNumber: string;
    serialDate: string;
    quantity: string;
}

export interface FtrPartNumberFlowResult {
    rowAddedVisible: boolean;
    partNumberVisible: boolean;
    setPrimaryVisible: boolean;
}

export interface FtrRepairDetailsData {
    conditionDescription: string;
    diagnosticSteps: string;
    repairProcess: string;
    observation?: string;
}

export interface FtrSubmitResult {
    successVisible: boolean;
    reportNumber: string;
    isDraft: boolean;
}

/**
 * FTRModule — Layer 2: Business Logic for the FTR application.
 *
 * Orchestrates the FTR SSO sign-in and the Create-Field-Technical-Report
 * VIN validation flow. Reuses the existing LoginPage sign-in locators and the
 * Actions / WaitHelper / WorkflowActions wrappers. No assertions in this layer.
 */
export class FTRModule {
    private ftrPage: FTRPage;
    private loginPage: LoginPage;
    private logger: Logger;
    private actions: Actions;
    private waitHelper: WaitHelper;
    private workflowActions: WorkflowActions;

    constructor(private page: Page) {
        this.ftrPage = new FTRPage(page);
        this.loginPage = new LoginPage(page);
        this.logger = Logger.create('FTRModule');
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
        this.workflowActions = new WorkflowActions(page);
    }

    /**
     * Navigate to the FTR landing URL, complete SSO sign-in, and land on the
     * Create Field Technical Report screen. Handles the SSO redirect chain and a
     * possible post-login bounce-back to the app root by re-navigating to the
     * FTR URL when the landing heading is not yet present.
     */
    async loginToFtr(landingUrl: string, username: string, password: string): Promise<void> {
        this.logger.testStart('FTR Login Workflow');

        this.logger.step(1, `Navigating to FTR landing URL: ${landingUrl}`);
        await this.page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.waitHelper.waitForNetworkIdle({ timeout: 30000 }).catch(() => null);

        let loginState = await this.waitForLandingOrLoginForm(45000);
        if (loginState === 'none') {
            this.logger.warn('Neither landing nor login form appeared — retrying landing URL once');
            await this.page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await this.waitHelper.waitForNetworkIdle({ timeout: 30000 }).catch(() => null);
            loginState = await this.waitForLandingOrLoginForm(45000);
        }

        if (loginState === 'landing') {
            this.logger.info('SSO form skipped — already on FTR landing page');
        } else if (loginState === 'login') {
            const usernameInputForWait = await this.loginPage.getUsernameInput();
            await this.waitHelper.waitForVisible(usernameInputForWait, { timeout: 30000 });

            this.logger.step(2, `Filling FTR username: ${username}`);
            const usernameInput = await this.loginPage.getUsernameInput();
            await this.actions.fill(usernameInput, username, { timeout: 30000 });

            this.logger.step(3, 'Filling FTR password');
            const passwordInput = await this.loginPage.getPasswordInput();
            await this.actions.fill(passwordInput, password, { timeout: 30000 });

            this.logger.step(4, 'Clicking the sign-in button');
            const loginButton = await this.loginPage.getLoginButton();
            await this.actions.click(loginButton, { timeout: 30000 });
        } else {
            throw new Error('Unable to detect either FTR landing page or SSO login form after navigation.');
        }

        this.logger.step(5, 'Waiting for the SSO redirect chain to land on the FTR page');
        await this.waitHelper
            .waitForUrlMatch(/generic-page-25-12/i, { timeout: 60000 })
            .catch(() => null);
        await this.waitHelper.waitForNetworkIdle({ timeout: 45000 }).catch(() => null);
        await this.workflowActions
            .waitForLoadingToStabilize({ timeoutMs: 45000, stableWindowMs: 1500 })
            .catch(() => null);

        this.logger.step(6, 'Ensuring the Create Field Technical Report landing page is shown');
        await this.ensureOnFtrLanding(landingUrl);

        this.logger.testEnd('FTR Login Workflow');
    }

    /**
     * Verify the Create Field Technical Report landing page is displayed and the
     * page has finished loading.
     */
    async verifyLandingDisplayed(): Promise<boolean> {
        this.logger.step(1, 'Verifying FTR landing page is displayed');
        try {
            const heading = await this.ftrPage.getCreateFtrHeading({ timeout: 30000 });
            await this.waitHelper.waitForVisible(heading, { timeout: 30000 });
            await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1000 }).catch(() => null);
            return heading.isVisible();
        } catch (error) {
            this.logger.error('FTR landing page not displayed', error);
            return false;
        }
    }

    /**
     * Enter the VIN in the landing page input and click Validate, then wait for
     * the Vehicle Information section to render.
     */
    async enterVinAndValidate(vin: string): Promise<void> {
        this.logger.step(1, `Entering VIN: ${vin}`);
        const vinInput = await this.ftrPage.getVinInput();
        await this.actions.fill(vinInput, vin, { timeout: 30000, clearFirst: true });

        this.logger.step(2, 'Clicking Validate');
        const validateButton = await this.ftrPage.getValidateButton();
        await this.actions.click(validateButton, { timeout: 30000 });

        this.logger.step(3, 'Waiting for the loading icon to disappear, then for Vehicle Information');
        await this.waitHelper.waitForLoader({ timeout: 45000 });
        const vehicleInfoHeading = await this.ftrPage.getVehicleInformationHeading({ timeout: 30000 });
        await this.waitHelper.waitForVisible(vehicleInfoHeading, { timeout: 30000 });
    }

    /**
     * Verify each expected vehicle detail (Division / Model / Model Year / VIN)
     * is visible in the Vehicle Information section.
     */
    async verifyVehicleInformation(expected: ExpectedVehicle): Promise<boolean> {
        const fields: Array<[string, string]> = [
            ['Division', expected.division],
            ['Model', expected.model],
            ['Model Year', expected.modelYear],
            ['VIN', expected.vin],
        ];

        let allVisible = true;
        for (const [label, value] of fields) {
            const visible = await this.isVehicleDetailVisible(label, value);
            if (!visible) {
                allVisible = false;
            }
        }
        return allVisible;
    }

    /**
     * Answer the "existing TAS case" prompt and open a draft FTR. The Yes/No answer is a
     * parameter (default 'No') so a single method covers both branches — no duplicate
     * selectYes.../selectNo... methods.
     */
    async selectExistingTasCaseAndCreateDraft(choice: YesNo = 'No'): Promise<void> {
        this.logger.step(4, 'Waiting for the post-Validate loading icon to disappear');
        await this.waitHelper.waitForLoader({ timeout: 45000 });

        this.logger.step(5, 'Closing the App Guide dialog if it is open');
        await this.closeAppGuideIfOpen();

        this.logger.step(6, `Selecting ${choice} for the existing TAS case prompt`);
        const tasCaseOption = await this.ftrPage.getExistingTasCaseOption(choice);
        await this.actions.click(tasCaseOption, { timeout: 20000 });

        this.logger.step(7, 'Clicking Create Draft FTR');
        const createDraftButton = await this.ftrPage.getCreateDraftFtrButton();
        await this.actions.click(createDraftButton, { timeout: 20000 });

        this.logger.step(8, 'Waiting for navigation to the Repair Information page');
        await this.waitHelper.waitForUrlContains('generic-create-case', { timeout: 45000 });
        await this.waitHelper.waitForLoader({ timeout: 45000 });
        const repairHeading = await this.ftrPage.getRepairInformationHeading({ timeout: 30000 });
        await this.waitHelper.waitForVisible(repairHeading, { timeout: 30000 });
    }

    /** Close the App Guide overlay if it is open (best-effort — it can render off-screen). */
    private async closeAppGuideIfOpen(): Promise<void> {
        const dialog = this.page.getByRole('dialog', { name: /app guide/i });
        if (!(await dialog.isVisible({ timeout: 2000 }).catch(() => false))) {
            return;
        }
        // reason: the App Guide widget renders off-screen, so a normal click fails the
        // viewport check; dispatchEvent clicks it without requiring it to be in view.
        const closeButton = this.page.getByRole('button', { name: /close app guide/i }).first();
        await closeButton.dispatchEvent('click').catch(() => null);
        await this.waitHelper.waitForHidden(dialog, { timeout: 5000 }).catch(() => null);
    }

    async fillRepairInformation(data: FtrRepairInformationData): Promise<FtrEnteredRepairInfo> {
        this.logger.step(8, 'Closing the App Guide dialog if it is open');
        await this.closeAppGuideIfOpen();

        this.logger.step(9, 'Selecting the current Repair Date');
        await this.selectRepairDateToday();

        this.logger.step(10, 'Entering a random Repair Order #');
        const repairOrder = this.randomRepairOrder();
        const repairOrderInput = await this.ftrPage.getTextboxByLabel('Repair Order #', { timeout: 20000 });
        await this.actions.fill(repairOrderInput, repairOrder, { timeout: 20000, clearFirst: true });

        this.logger.step(11, 'Entering a random Odometer value');
        const odometer = this.randomOdometer();
        const odometerInput = await this.ftrPage.getTextboxByLabel('Odometer', { timeout: 20000 });
        await this.actions.fill(odometerInput, odometer, { timeout: 20000, clearFirst: true });

        this.logger.step(12, 'Selecting the required radio options');
        for (const selection of data.radioSelections) {
            await this.selectRadioInGroup(selection.groupLabel, selection.option);
        }

        this.logger.step(13, 'Entering the Title');
        const titleInput = await this.ftrPage.getTextboxByLabel('Title', { timeout: 20000 });
        await this.actions.fill(titleInput, data.title, { timeout: 20000, clearFirst: true });

        this.logger.step(14, 'Selecting a random value in each dropdown');
        const dropdownSelections: Array<{ label: string; value: string }> = [];
        for (const label of data.randomDropdownLabels) {
            const value = await this.selectRandomDropdownOption(label);
            dropdownSelections.push({ label, value });
        }

        return { repairOrder, odometer, title: data.title, radioSelections: data.radioSelections, dropdownSelections };
    }

    /** Click Save as Draft and wait for the save to settle. The app navigates to the home dashboard. */
    async saveDraft(): Promise<void> {
        this.logger.step(1, 'Saving as Draft');
        const saveAsDraftButton = await this.ftrPage.getSaveAsDraftButton();
        await this.actions.click(saveAsDraftButton, { timeout: 30000 });
        await this.waitHelper.waitForLoader({ timeout: 30000 });
    }

    /**
     * Add a DTC and set it as Primary, KEEPING it on the case. Used by the submit
     * flow (unlike runDtcInformationFlow, which deletes the DTC as part of its CRUD
     * verification). Reuses the existing private addDtc / setDtcAsPrimary helpers.
     */
    async addPrimaryDtc(dtcCode: string): Promise<boolean> {
        this.logger.step(1, 'Waiting for the DTC Information section');
        await this.waitForDtcSection();

        this.logger.step(2, `Adding DTC "${dtcCode}" and setting it as Primary`);
        await this.addDtc(dtcCode);
        return this.setDtcAsPrimary(dtcCode);
    }

    /**
     * Satisfy the Part Number Information requirements that submission enforces but
     * the draft flow leaves blank: answer the "ship the part(s) within 30 days"
     * question and mark the added part row as the Primary row.
     */
    async finalizePartNumberForSubmission(partNumber: string, shipChoice: YesNo = 'Yes'): Promise<void> {
        this.logger.step(1, `Answering the parts-shipping question: ${shipChoice}`);
        await this.selectRadioInGroup(
            'Would you be able to ship the part(s) upon request within the next 30 calendar days?',
            shipChoice,
        );

        this.logger.step(2, 'Setting the part number row as Primary');
        const setPrimary = this.ftrPage.getPartNumberSetPrimaryButton(partNumber);
        await this.actions.click(setPrimary, { timeout: 20000 });
        await this.waitHelper.waitForLoader({ timeout: 15000 }).catch(() => null);
    }

    /**
     * Fill the required Repair Details textareas (Condition Description, Diagnostic
     * Steps, Repair Process). Observation is optional and filled only when provided.
     */
    async fillRepairDetails(data: FtrRepairDetailsData): Promise<void> {
        this.logger.step(1, 'Waiting for the Repair Details section');
        const heading = await this.ftrPage.getRepairDetailsHeading({ timeout: 30000 });
        await this.actions.scrollIntoView(heading, { timeout: 10000 }).catch(() => null);
        await this.waitHelper.waitForVisible(heading, { timeout: 30000 });

        this.logger.step(2, 'Filling Condition Description');
        await this.fillRepairDetailField('Condition Description', data.conditionDescription);

        this.logger.step(3, 'Filling Diagnostic Steps');
        await this.fillRepairDetailField('Diagnostic Steps', data.diagnosticSteps);

        if (data.observation) {
            this.logger.step(4, 'Filling Observation');
            await this.fillRepairDetailField('Observation', data.observation);
        }

        this.logger.step(5, 'Filling Repair Process');
        await this.fillRepairDetailField('Repair Process', data.repairProcess);
    }

    private async fillRepairDetailField(label: string, value: string): Promise<void> {
        const textarea = await this.ftrPage.getRepairDetailTextarea(label, { timeout: 20000 });
        await this.actions.scrollIntoView(textarea, { timeout: 10000 }).catch(() => null);
        await this.actions.fill(textarea, value, { timeout: 20000, clearFirst: true });
    }

    /**
     * Click Submit, wait for the submission to settle, and read the generated Field
     * Technical Report number from the confirmation banner. Returns checkpoint data
     * so the spec owns the assertions.
     */
    async submitFtr(): Promise<FtrSubmitResult> {
        this.logger.step(1, 'Clicking Submit');
        const submitButton = await this.ftrPage.getSubmitButton();
        await this.actions.scrollIntoView(submitButton, { timeout: 10000 }).catch(() => null);
        await this.actions.click(submitButton, { timeout: 30000 });

        this.logger.step(2, 'Waiting for the submission confirmation banner');
        await this.waitHelper.waitForLoader({ timeout: 45000 }).catch(() => null);
        const successHeading = this.ftrPage.getSubmissionSuccessHeading();
        await this.waitHelper.waitForVisible(successHeading, { timeout: 45000 });

        this.logger.step(3, 'Reading the generated report number');
        const successVisible = await successHeading.isVisible();
        const reportNumber = await this.extractReportNumber(successHeading);
        const isDraft = /^drft/i.test(reportNumber);

        this.logger.info(`FTR submitted. Report number: ${reportNumber}`);
        return { successVisible, reportNumber, isDraft };
    }

    /** Extract the FTR record number (e.g. "FTR261770006") from the confirmation banner text. */
    private async extractReportNumber(successHeading: Locator): Promise<string> {
        const text = (await successHeading.innerText()).trim();
        const match = /#?\s*(?:DRFT)?FTR\d+/i.exec(text);
        return match ? match[0].replace(/^#\s*/, '') : '';
    }

    /** Build random Repair Details values so each run submits unique content. */
    buildRandomRepairDetails(): FtrRepairDetailsData {
        const token = Date.now().toString().slice(-6);
        return {
            conditionDescription: `Condition observed during customer drive - MIL on with intermittent warning (ref ${token}).`,
            diagnosticSteps: `1. Verified concern. 2. Scanned for DTCs. 3. Reviewed measurement data. 4. Cited repair manual steps (ref ${token}).`,
            repairProcess: `Replaced the affected component, cleared codes, and confirmed normal operation on road test (ref ${token}).`,
        };
    }

    /**
     * DTC Information flow on the draft edit page (same page as Repair Information,
     * BEFORE Save as Draft): add a DTC, verify the row / "Primary DTC" action /
     * Delete control, exercise the Delete confirmation dialog (Cancel then confirm
     * Delete), and confirm the DTC is removed. Returns checkpoint booleans so the
     * spec owns the assertions.
     */
    async runDtcInformationFlow(dtcCode: string): Promise<FtrDtcFlowResult> {
        this.logger.step(1, 'Waiting for the DTC Information section');
        await this.waitForDtcSection();

        this.logger.step(2, `Entering DTC code "${dtcCode}" and clicking Add`);
        await this.addDtc(dtcCode);

        this.logger.step(3, 'Verifying the DTC row and clicking Set Primary');
        const rowAddedVisible = await this.isDtcRowPresent(dtcCode);
        const setPrimaryClicked = await this.setDtcAsPrimary(dtcCode);

        this.logger.step(4, 'Verifying Primary DTC action text and Delete control');
        const actionPrimaryVisible = await this.isVisibleSafe(this.ftrPage.getDtcPrimaryActionLabel(dtcCode));
        const deleteAvailable = await this.isVisibleSafe(this.ftrPage.getDtcDeleteButton(dtcCode));

        this.logger.step(5, 'Opening the Delete confirmation dialog');
        await this.openDeleteDialog(dtcCode);
        const dialogHeaderVisible = await this.isVisibleSafe(this.ftrPage.getDeleteRowDialogHeading());
        const dialogMessageVisible = await this.isVisibleSafe(this.ftrPage.getDeleteRowDialogMessage());
        const dialogDeleteOptionVisible = await this.isVisibleSafe(this.ftrPage.getDeleteRowDialogDeleteButton());
        const dialogCancelOptionVisible = await this.isVisibleSafe(this.ftrPage.getDeleteRowDialogCancelButton());

        this.logger.step(6, 'Clicking Cancel and confirming the DTC remains');
        await this.cancelDeleteDialog();
        const rowVisibleAfterCancel = await this.isDtcRowPresent(dtcCode);

        this.logger.step(7, 'Deleting the DTC and confirming removal');
        await this.openDeleteDialog(dtcCode);
        await this.confirmDeleteDialog();
        const rowRemovedAfterDelete = await this.isDtcRowRemoved(dtcCode);

        return {
            rowAddedVisible,
            setPrimaryClicked,
            actionPrimaryVisible,
            deleteAvailable,
            dialogHeaderVisible,
            dialogMessageVisible,
            dialogDeleteOptionVisible,
            dialogCancelOptionVisible,
            rowVisibleAfterCancel,
            rowRemovedAfterDelete,
        };
    }

    /**
     * Part Number Information flow on the draft edit page (same page as Repair
     * Information / DTC, BEFORE Save as Draft): enter the part number, blur to
     * trigger validation (loader hides once the green tick shows), enter serial
     * and quantity, click Add, and confirm the row / part number / Set Primary
     * button appear in the table. Returns checkpoint booleans so the spec owns
     * the assertions.
     */
    async runPartNumberInformationFlow(data: FtrPartNumberData): Promise<FtrPartNumberFlowResult> {
        this.logger.step(1, 'Waiting for the Part Number Information section');
        await this.waitForPartNumberSection();

        this.logger.step(2, `Entering part number "${data.partNumber}" and validating`);
        await this.enterPartNumber(data.partNumber);

        this.logger.step(3, `Entering serial "${data.serialDate}" and quantity "${data.quantity}", then clicking Add`);
        await this.addPartNumberRow(data);

        this.logger.step(4, 'Verifying the part number row and Set Primary button');
        const rowAddedVisible = await this.isPartNumberRowPresent(data.partNumber);
        const partNumberVisible = await this.isVisibleSafe(this.ftrPage.getPartNumberRowsByValue(data.partNumber).first());
        const setPrimaryVisible = await this.isVisibleSafe(this.ftrPage.getPartNumberSetPrimaryButton(data.partNumber));

        return { rowAddedVisible, partNumberVisible, setPrimaryVisible };
    }

    private async waitForPartNumberSection(): Promise<void> {
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1000 }).catch(() => null);
        const input = await this.ftrPage.getPartNumberInput({ timeout: 30000 });
        await this.actions.scrollIntoView(input, { timeout: 10000 }).catch(() => null);
        await this.waitHelper.waitForVisible(input, { timeout: 30000 });
    }

    private async enterPartNumber(partNumber: string): Promise<void> {
        const input = await this.ftrPage.getPartNumberInput({ timeout: 20000 });
        await this.actions.fill(input, partNumber, { timeout: 20000, clearFirst: true });
        await this.actions.blur(input, { timeout: 10000 });
        await this.waitHelper.waitForLoader({ timeout: 30000 });
    }

    private async addPartNumberRow(data: FtrPartNumberData): Promise<void> {
        const serialInput = await this.ftrPage.getPartSerialDateInput({ timeout: 20000 });
        await this.actions.fill(serialInput, data.serialDate, { timeout: 20000, clearFirst: true });
        const quantityInput = await this.ftrPage.getPartQuantityInput({ timeout: 20000 });
        await this.actions.fill(quantityInput, data.quantity, { timeout: 20000, clearFirst: true });
        const addButton = await this.ftrPage.getPartNumberAddButton({ timeout: 20000 });
        await this.actions.click(addButton, { timeout: 20000 });
        await this.waitHelper.waitForLoader({ timeout: 30000 });
    }

    /** A part number row is present once at least one grid row contains the value. */
    private async isPartNumberRowPresent(partNumber: string): Promise<boolean> {
        const rows = this.ftrPage.getPartNumberRowsByValue(partNumber);
        await this.waitHelper.waitForVisible(rows.first(), { timeout: 15000 }).catch(() => null);
        return (await rows.count()) > 0;
    }

    private async waitForDtcSection(): Promise<void> {
        // DTC Information lives on the draft edit page alongside Repair Information; let any
        // in-flight loading settle, then scroll the DTC input into view and wait for it.
        await this.workflowActions.waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1000 }).catch(() => null);
        const input = await this.ftrPage.getDtcCodeInput({ timeout: 30000 });
        await this.actions.scrollIntoView(input, { timeout: 10000 }).catch(() => null);
        await this.waitHelper.waitForVisible(input, { timeout: 30000 });
    }

    private async addDtc(dtcCode: string): Promise<void> {
        const input = await this.ftrPage.getDtcCodeInput({ timeout: 20000 });
        await this.actions.fill(input, dtcCode, { timeout: 20000, clearFirst: true });
        const addButton = await this.ftrPage.getDtcAddButton({ timeout: 20000 });
        await this.actions.click(addButton, { timeout: 20000 });
        await this.waitHelper.waitForLoader({ timeout: 30000 });
    }

    private async setDtcAsPrimary(dtcCode: string): Promise<boolean> {
        try {
            const setPrimaryButton = this.ftrPage.getDtcSetPrimaryButton(dtcCode);
            await setPrimaryButton.waitFor({ state: 'visible', timeout: 15000 });
            await setPrimaryButton.click({ timeout: 15000 });
            await this.waitHelper.waitForLoader({ timeout: 10000 }).catch(() => null);
            const primaryLabel = this.ftrPage.getDtcPrimaryActionLabel(dtcCode);
            await primaryLabel.waitFor({ state: 'visible', timeout: 15000 });
            return true;
        } catch {
            return false;
        }
    }

    private async openDeleteDialog(dtcCode: string): Promise<void> {
        const deleteButton = this.ftrPage.getDtcDeleteButton(dtcCode);
        await deleteButton.waitFor({ state: 'visible', timeout: 15000 });
        await deleteButton.click({ timeout: 15000 });
        // Wait for Delete row? popup by checking for the Delete button inside it
        const confirmBtn = this.ftrPage.getDeleteRowDialogDeleteButton();
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
    }

    private async cancelDeleteDialog(): Promise<void> {
        const cancelButton = this.ftrPage.getDeleteRowDialogCancelButton();
        await cancelButton.click({ timeout: 15000 });
        await this.waitHelper.waitForLoader({ timeout: 10000 }).catch(() => null);
    }

    private async confirmDeleteDialog(): Promise<void> {
        const deleteButton = this.ftrPage.getDeleteRowDialogDeleteButton();
        await deleteButton.click({ timeout: 15000 });
        await this.waitHelper.waitForLoader({ timeout: 15000 }).catch(() => null);
    }

    /** A DTC row is present once at least one grid row contains the code. */
    private async isDtcRowPresent(dtcCode: string): Promise<boolean> {
        const rows = this.ftrPage.getDtcRowsByCode(dtcCode);
        await this.waitHelper.waitForVisible(rows.first(), { timeout: 15000 }).catch(() => null);
        return (await rows.count()) > 0;
    }

    /** A DTC row is removed once no grid row contains the code. */
    private async isDtcRowRemoved(dtcCode: string): Promise<boolean> {
        const rows = this.ftrPage.getDtcRowsByCode(dtcCode);
        await this.waitHelper.waitForHidden(rows.first(), { timeout: 15000 }).catch(() => null);
        return (await rows.count()) === 0;
    }

    /** Non-throwing visibility check for a plain locator. */
    private async isVisibleSafe(locator: Locator): Promise<boolean> {
        try {
            await this.waitHelper.waitForVisible(locator, { timeout: 10000 });
            return locator.isVisible();
        } catch {
            return false;
        }
    }

    /** Non-throwing visibility check for a SmartLocator-resolved element. */
    private async isResolvedVisible(resolve: () => Promise<Locator>): Promise<boolean> {
        try {
            const locator = await resolve();
            await this.waitHelper.waitForVisible(locator, { timeout: 10000 });
            return locator.isVisible();
        } catch {
            return false;
        }
    }

    /**
     * Set the Repair Date to today. The field is a native `<input type="date">`, so the
     * value is filled directly as YYYY-MM-DD (the input's `max` is today) instead of
     * opening Chromium's native date picker, which Playwright cannot interact with.
     */
    private async selectRepairDateToday(): Promise<void> {
        const input = await this.ftrPage.getRepairDateInput({ timeout: 20000 });
        // Reusable date helper: fills today and auto-clamps to the field's min/max bounds.
        await this.actions.fillNativeDate(input, 'today', { timeout: 20000 });
    }

    /** Resolve and check a single vehicle detail value, logging the outcome. */
    private async isVehicleDetailVisible(label: string, value: string): Promise<boolean> {
        try {
            const detail = await this.ftrPage.getVehicleDetailValue(value, { timeout: 15000 });
            await this.waitHelper.waitForVisible(detail, { timeout: 15000 });
            const visible = await detail.isVisible();
            this.logger.info(`${label} = "${value}" visible: ${visible}`);
            return visible;
        } catch (error) {
            this.logger.error(`${label} value "${value}" not visible`, error);
            return false;
        }
    }

    private async selectRadioInGroup(groupLabel: string, optionText: string): Promise<void> {
        const radio = await this.ftrPage
            .getRadioInGroup(groupLabel, optionText, { timeout: 10000 })
            .catch(() => this.ftrPage.getRadioByName(optionText, { timeout: 10000 }));
        await this.actions.click(radio, { timeout: 15000, force: true });
    }

    private async selectRandomDropdownOption(label: string): Promise<string> {
        // Cascading dropdowns: a downstream list only populates after the previous
        // selection registers, so each pick is VERIFIED (and retried) before moving on.
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await this.closeAppGuideIfOpen();
            const combobox = await this.ftrPage.getComboboxByLabel(label, { timeout: 20000 });
            await this.actions.scrollIntoView(combobox, { timeout: 10000 });
            await this.actions.click(combobox, { timeout: 20000 });

            const selectedText = await this.pickRandomOpenOption(label);
            if (selectedText && (await this.isDropdownSelected(combobox, selectedText))) {
                this.logger.info(`Selected option for ${label}: ${selectedText} (attempt ${attempt})`);
                // The cascade spinner only appears SOMETIMES. Wait for it ONLY if it actually
                // shows (then proceed the instant it clears); otherwise continue immediately.
                // The next dropdown is still gated because its options are awaited on the next
                // iteration and the pick is verified, so we keep reliability without the fixed
                // per-dropdown dead time that waitForLoader's double grace + stable window adds.
                await this.waitHelper.waitForActiveLoaderToClear({ timeout: 15000 }).catch(() => null);
                return selectedText;
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
        const options = await this.ftrPage.getVisibleDropdownOptions();
        await this.waitHelper.waitForVisible(options.first(), { timeout: 15000 }).catch(() => null);

        const selectable = options.filter({ hasNotText: /^\s*select\s*$/i });
        const count = await selectable.count();
        if (count === 0) {
            this.logger.warn(`No selectable options appeared for "${label}"`);
            return null;
        }

        const option = selectable.first();
        await this.actions.scrollIntoView(option, { timeout: 10000 }).catch(() => null);
        const text = (await option.innerText()).trim();
        await option.evaluate((el) => (el as HTMLElement).click());
        return text;
    }

    /** A dropdown is "selected" once the combobox shows the chosen text (no longer "Select"). */
    private async isDropdownSelected(combobox: Locator, selectedText: string): Promise<boolean> {
        try {
            await this.waitHelper.waitForTextContains(combobox, selectedText, { timeout: 5000, interval: 250 });
            return true;
        } catch {
            return false;
        }
    }

    /** Close any open option panel so a failed attempt can be retried cleanly. */
    private async closeOpenDropdown(): Promise<void> {
        await this.actions.press('Escape').catch(() => null);
        const options = await this.ftrPage.getVisibleDropdownOptions();
        await this.waitHelper.waitForHidden(options.first(), { timeout: 5000 }).catch(() => null);
    }

    private randomRepairOrder(): string {
        return `RO${Date.now().toString().slice(-6)}`;
    }

    private randomOdometer(): string {
        return String(Math.floor(10000 + Math.random() * 90000));
    }

    /**
     * Guarantee we end on the FTR landing page. After SSO some flows bounce back
     * to the app root; if the landing heading is not present, re-navigate to the
     * FTR URL and wait again.
     */
    private async ensureOnFtrLanding(landingUrl: string): Promise<void> {
        const present = await this.isFtrHeadingVisible(30000);
        if (present) {
            return;
        }

        this.logger.warn('FTR landing heading not present after login — re-navigating to FTR URL');
        await this.page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await this.waitHelper.waitForNetworkIdle({ timeout: 30000 }).catch(() => null);
        await this.workflowActions
            .waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1500 })
            .catch(() => null);
        const headingRetry = await this.ftrPage.getCreateFtrHeading({ timeout: 30000 });
        await this.waitHelper.waitForVisible(headingRetry, { timeout: 30000 });
    }

    /** Non-throwing check for the FTR landing heading. */
    private async isFtrHeadingVisible(timeout: number): Promise<boolean> {
        try {
            const heading = await this.ftrPage.getCreateFtrHeading({ timeout });
            return heading.isVisible();
        } catch {
            return false;
        }
    }

    /** Wait until either the FTR landing heading or SSO username form becomes visible. */
    private async waitForLandingOrLoginForm(timeoutMs: number): Promise<'landing' | 'login' | 'none'> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const landingVisible = await this.page
                .getByRole('heading', { name: /create field technical report/i })
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
