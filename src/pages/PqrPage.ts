import { Page, type Locator } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';
import { TIMEOUTS } from '../utils';

export class PqrPage {
    constructor(private page: Page) {}

    private toLabelRegex(label: string): RegExp {
        return new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    async getLandingHeading() {
        return SmartLocator.resolve('Create Port Quality Report Heading', [
            { name: 'heading', locator: this.page.getByRole('heading', { name: /create port quality report/i }).first() },
        ]);
    }

    /**
     * Raw landing-heading wait that tolerates the slow SSO settle without SmartLocator's
     * 5s fast-fail — the URL matches before SSO finishes, so the heading is the real
     * "app is ready" signal. Returns true once visible, false if it never appears.
     */
    async waitForLandingHeadingReady(timeout: number = TIMEOUTS.LONG): Promise<boolean> {
        return this.page
            .getByRole('heading', { name: /create port quality report/i })
            .first()
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false);
    }

    getCqsQuestionText(): Locator {
        return this.page.getByText(/cqs/i).first();
    }

    async getSingleVinOption() {
        return SmartLocator.resolve('Single VIN Option', [
            {
                name: 'radio',
                locator: this.page
                    .getByRole('radiogroup', { name: /would you like to report one vin or multiple vins/i })
                    .getByRole('radio', { name: /^single vin$/i })
                    .first(),
            },
        ]);
    }

    async getMultipleVinOption() {
        return SmartLocator.resolve('Multiple VIN(s) Option', [
            {
                name: 'radio',
                locator: this.page
                    .getByRole('radiogroup', { name: /would you like to report one vin or multiple vins/i })
                    .getByRole('radio', { name: /multiple vin/i })
                    .first(),
            },
        ]);
    }

    /** Input field for entering VINs in Multi-VIN mode (labelled "VIN(s)"). */
    getMultiVinInput(): Locator {
        return this.page.getByRole('textbox', { name: /^vin\(s\)$/i }).first();
    }

    async getAddVinButton() {
        return SmartLocator.resolve('Add VIN Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^add vin$/i }).first() },
        ]);
    }

    /** A row in the Multi-VIN data grid that contains the given VIN value. */
    getVinRowByValue(vin: string): Locator {
        return this.page.getByRole('row').filter({ hasText: vin }).first();
    }

    /** Inline error rendered after Validate is clicked with a VIN the backend rejects. */
    getInvalidVinError(): Locator {
        return this.page.getByText(/invalid vin/i).first();
    }

    async getVinInput() {
        return SmartLocator.resolve('PQR VIN Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /^vin$/i }).first() },
            // reason: when aria hydration lags, placeholder remains stable
            { name: 'placeholder', locator: this.page.getByPlaceholder(/enter vin/i).first() },
        ]);
    }

    async getValidateButton() {
        return SmartLocator.resolve('PQR Validate Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^validate$/i }).first() },
        ]);
    }

    async getVehicleInformationHeading() {
        return SmartLocator.resolve('PQR Vehicle Information Heading', [
            { name: 'heading', locator: this.page.getByRole('heading', { name: /vehicle information/i }).first() },
        ]);
    }

    /**
     * Raw Vehicle-Information-heading wait that tolerates the post-Validate backend VIN
     * lookup without SmartLocator's 5s fast-fail — the section renders asynchronously
     * after Validate, so the heading is the real "vehicle details are ready" signal.
     * Returns true once visible, false if it never appears.
     */
    async waitForVehicleInformationReady(timeout: number = TIMEOUTS.LONG): Promise<boolean> {
        return this.page
            .getByRole('heading', { name: /vehicle information/i })
            .first()
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false);
    }

    async getCreateDraftPqrButton() {
        return SmartLocator.resolve('Create Draft PQR Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /create draft pqr/i }).first() },
        ]);
    }

    async getRepairDateInput() {
        return SmartLocator.resolve('Repair Date Input', [
            { name: 'textbox', locator: this.page.getByRole('textbox', { name: /repair date/i }).first() },
        ]);
    }

    async getTextboxByLabel(label: string) {
        return SmartLocator.resolve(`Textbox: ${label}`, [
            { name: 'role', locator: this.page.getByRole('textbox', { name: this.toLabelRegex(label) }).first() },
            { name: 'label', locator: this.page.getByLabel(this.toLabelRegex(label)).first() },
        ]);
    }

    async getRadioInGroup(groupLabel: string, option: string) {
        return SmartLocator.resolve(`Radio in ${groupLabel}: ${option}`, [
            {
                name: 'radio',
                locator: this.page
                    .getByRole('radiogroup', { name: this.toLabelRegex(groupLabel) })
                    .getByRole('radio', { name: this.toLabelRegex(option) })
                    .first(),
            },
        ]);
    }

    async getComboboxByLabel(label: string) {
        return SmartLocator.resolve(`Combobox: ${label}`, [
            { name: 'role', locator: this.page.getByRole('combobox', { name: this.toLabelRegex(label) }).first() },
        ]);
    }

    getVisibleDropdownOptions(): Locator {
        return this.page.locator('[role="option"]:visible').filter({ hasText: /.+/ });
    }

    async getDtcInput() {
        return SmartLocator.resolve('DTC Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /dtc\(s\)/i }).first() },
        ]);
    }

    async getAddDtcButton() {
        return SmartLocator.resolve('Add DTC Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /add dtc/i }).first() },
        ]);
    }

    getDtcRowByCode(code: string): Locator {
        return this.page.getByRole('row').filter({ hasText: this.toLabelRegex(code) }).first();
    }

    getSetPrimaryInRow(row: Locator): Locator {
        return row.getByText(/set primary/i).first();
    }

    getPrimaryLabelInRow(row: Locator): Locator {
        return row.getByText(/primary/i).first();
    }

    async getPartNumberInput() {
        return SmartLocator.resolve('Part Number Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /^part number$/i }).first() },
        ]);
    }

    async getPartSerialDateInput() {
        return SmartLocator.resolve('Part Serial Date Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /serial\/date/i }).first() },
        ]);
    }

    async getPartQuantityInput() {
        return SmartLocator.resolve('Part Quantity Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /^quantity$/i }).first() },
        ]);
    }

    async getAddPartButton() {
        return SmartLocator.resolve('Add Part Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /add part/i }).first() },
        ]);
    }

    getPartRowByNumber(partNumber: string): Locator {
        return this.page.getByRole('row').filter({ hasText: this.toLabelRegex(partNumber) }).first();
    }

    async getRepairDetailTextarea(label: string) {
        return SmartLocator.resolve(`Repair Detail: ${label}`, [
            { name: 'role', locator: this.page.getByRole('textbox', { name: this.toLabelRegex(label) }).first() },
        ]);
    }

    async getSubmitButton() {
        return SmartLocator.resolve('Submit Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^submit$/i }).first() },
        ]);
    }

    /** "Click To Browse" trigger in the Attachments widget that opens the file chooser. */
    async getBrowseAttachmentButton() {
        return SmartLocator.resolve('Attachment Browse Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /click to browse/i }).first() },
        ]);
    }

    /** Hidden `<input type="file">` inside the Attachments upload section (fallback path). */
    getAttachmentFileInput(): Locator {
        return this.page.locator('.file-upload-section input[type="file"]').first();
    }

    /**
     * Row in the Attachments list (`naq-pm-attachment-list`) that shows an uploaded file by
     * name. Scoped to the list so it never matches the file name elsewhere on the page.
     */
    getAttachmentByName(fileName: string): Locator {
        return this.page.locator('naq-pm-attachment-list').getByText(fileName, { exact: false }).first();
    }

    /** Required/invalid-field messages shown after a blocked submit (value-agnostic). */
    getValidationErrorMessages(): Locator {
        return this.page.getByText(/is required|required field|please (?:select|enter|choose|provide|fill)/i);
    }

    /**
     * Inline error shown under the Part and DTC tables when Submit is clicked without a
     * Primary row set — the app renders "Field is required to have a primary row." under
     * each table. One match per table (value-agnostic wording).
     */
    getMissingPrimaryErrors(): Locator {
        return this.page.getByText(/required to have a primary row/i);
    }

    getCaseManagementCenterHeading(): Locator {
        return this.page.getByText(/case management center/i).first();
    }

    getSubmissionSuccessText(): Locator {
        return this.page.getByText(/thank you for submitting|successfully submitted/i).first();
    }

    getAnyPqrNumberText(): Locator {
        return this.page.getByText(/(?:DRFT)?PQR\d+/i).first();
    }

    async waitForMainFormVisible(timeout: number = TIMEOUTS.LONG) {
        // Anchor on a RAW locator (not SmartLocator, which probe-fails fast) so the full
        // timeout is honoured while the create-case micro-frontend finishes mounting.
        const repairDate = this.page.getByRole('textbox', { name: /repair date/i }).first();
        await repairDate.waitFor({ state: 'visible', timeout });
    }

    /** True once the create-case main form (Repair Date field) is present. Non-throwing. */
    async isMainFormVisible(timeout: number = TIMEOUTS.MEDIUM): Promise<boolean> {
        const repairDate = this.page.getByRole('textbox', { name: /repair date/i }).first();
        return repairDate
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false);
    }
}
