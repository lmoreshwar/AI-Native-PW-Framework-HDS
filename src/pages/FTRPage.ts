import { Page, type Locator } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';
import type { YesNo } from '../utils/types';

/**
 * FTRPage — Layer 1: Locators Only (FTR "Create Field Technical Report" landing page)
 *
 * Sign-in form locators are intentionally NOT duplicated here — the existing
 * LoginPage (getUsernameInput/getPasswordInput/getLoginButton) is reused for the
 * FTR SSO sign-in. This page covers ONLY the FTR landing/VIN-validation screen.
 *
 * Evidence: UAT screenshots of /generic-page-25-12?pageId=EDERGP202531210
 * (banner "FTR Landing Page", heading "Create Field Technical Report",
 *  "VIN or TAS Case #" input, "Validate" button, "Vehicle Information" section).
 *
 * No business logic or assertions in this layer.
 */
export class FTRPage {
    constructor(private page: Page) {}

    private toLabelRegex(label: string): RegExp {
        return new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    private toXPathLiteral(value: string): string {
        if (!value.includes('"')) {
            return `"${value}"`;
        }
        if (!value.includes("'")) {
            return `'${value}'`;
        }
        const parts = value.split('"').map((part) => `"${part}"`);
        return `concat(${parts.join(', "\\"", ')})`;
    }

    /**
     * Landing page heading that confirms the Create Field Technical Report screen.
     *
     * @param options.timeout - resolve timeout (the FTR Angular app renders this
     *   heading only after the SSO redirect chain settles, which can take >5s)
     */
    async getCreateFtrHeading(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Create FTR Heading',
            [{ name: 'role', locator: this.page.getByRole('heading', { name: /create field technical report/i }) }],
            { timeout: options?.timeout ?? 5000 },
        );
    }

    /**
     * VIN / TAS Case input on the landing page.
     */
    async getVinInput() {
        return SmartLocator.resolve('FTR VIN Input', [
            // field name: "VIN or TAS Case #"
            { name: 'role-name', locator: this.page.getByRole('textbox', { name: /vin or tas case #/i }) },
            // reason: the field renders its accessible name only after hydration; placeholder is the stable fallback
            { name: 'placeholder', locator: this.page.getByPlaceholder(/enter the vin or tas case/i) },
        ]);
    }

    /**
     * Validate button that triggers VIN lookup.
     */
    async getValidateButton() {
        return SmartLocator.resolve('FTR Validate Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^validate$/i }) },
        ]);
    }

    /**
     * "Vehicle Information" section heading shown after a successful Validate.
     * Renders after an async "Matching TAS Cases Detected" block, so callers may
     * pass a longer timeout.
     */
    async getVehicleInformationHeading(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Vehicle Information Heading',
            [{ name: 'role', locator: this.page.getByRole('heading', { name: /vehicle information/i }) }],
            { timeout: options?.timeout ?? 5000 },
        );
    }

    /**
     * Read-only vehicle detail value (Division / Model / Model Year / VIN) shown
     * in the Vehicle Information section after Validate.
     *
     * The section renders the values inside ONE combined header string
     * (e.g. "2021 LEXUS ES 250 L4 BASE AWD 8AT-F <VIN>"), so an exact-text match
     * never resolves a single value — use a substring match against that header.
     *
     * @param value - the displayed value to locate (e.g. 'LEXUS', 'ES 250')
     */
    async getVehicleDetailValue(value: string, options?: { timeout?: number }) {
        return SmartLocator.resolve(
            `Vehicle Detail Value: ${value}`,
            [{ name: 'text', locator: this.page.getByText(value).first() }],
            { timeout: options?.timeout ?? 5000 },
        );
    }

    /**
     * Resolve a Yes/No option in the "existing TAS case" radio group. The choice is a
     * parameter so the same locator serves both branches (no per-answer duplicate methods).
     */
    async getExistingTasCaseOption(choice: YesNo) {
        const group = this.page.getByRole('radiogroup', {
            name: /utilize one of the existing tas cases/i,
        });
        const label = new RegExp(`^${choice}$`, 'i');
        return SmartLocator.resolve(`Existing TAS Case - ${choice} option`, [
            { name: 'option-label', locator: group.getByText(label).first() },
            // reason: the radio is an icon; the click handler sits on the option label container
            { name: 'radio', locator: group.getByRole('radio', { name: label }).first() },
        ]);
    }

    async getCreateDraftFtrButton() {
        return SmartLocator.resolve('Create Draft FTR Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /create draft ftr/i }).first() },
            { name: 'text', locator: this.page.getByText(/create draft ftr/i).first() },
        ]);
    }

    async getRepairInformationHeading(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Repair Information Heading',
            [
                { name: 'role', locator: this.page.getByRole('heading', { name: /repair information/i }).first() },
                { name: 'text', locator: this.page.getByText(/^Repair Information$/i).first() },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    async getTextboxByLabel(label: string, options?: { timeout?: number }) {
        const escaped = this.toXPathLiteral(label);
        return SmartLocator.resolve(
            `Textbox: ${label}`,
            [
                { name: 'role-name', locator: this.page.getByRole('textbox', { name: this.toLabelRegex(label) }).first() },
                // reason: getByLabel can resolve to the <label> element itself (it carries aria-label), so it is a fallback only
                { name: 'label', locator: this.page.getByLabel(this.toLabelRegex(label)).first() },
                {
                    name: 'xpath-input',
                    locator: this.page
                        .locator(`xpath=(//*[contains(normalize-space(), ${escaped})]/following::input[1])`)
                        .first(),
                },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    async getComboboxByLabel(label: string, options?: { timeout?: number }) {
        const escaped = this.toXPathLiteral(label);
        return SmartLocator.resolve(
            `Combobox: ${label}`,
            [
                { name: 'role-name', locator: this.page.getByRole('combobox', { name: this.toLabelRegex(label) }).first() },
                { name: 'label', locator: this.page.getByLabel(this.toLabelRegex(label)).first() },
                {
                    name: 'xpath-combobox',
                    locator: this.page
                        .locator(`xpath=(//*[contains(normalize-space(), ${escaped})]/following::*[@role='combobox'][1])`)
                        .first(),
                },
                {
                    name: 'xpath-select',
                    locator: this.page.locator(`xpath=(//*[contains(normalize-space(), ${escaped})]/following::select[1])`).first(),
                },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /**
     * Native Repair Date input (`<input type="date">` inside the Angular naq-datepicker).
     * The calendar toggle opens Chromium's native date picker (not in the DOM), so the
     * value is set directly with fill('YYYY-MM-DD') instead of clicking calendar cells.
     */
    async getRepairDateInput(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Repair Date Input',
            [
                { name: 'date-input', locator: this.page.locator('input[type="date"]').first() },
                // reason: the toggle button shares the "Enter Repair Date" aria-label, so scope to the input element
                { name: 'input-aria-label', locator: this.page.locator('input[aria-label="Enter Repair Date"]').first() },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    async getRadioByName(optionName: string, options?: { timeout?: number }) {
        return SmartLocator.resolve(
            `Radio: ${optionName}`,
            [
                { name: 'role-name', locator: this.page.getByRole('radio', { name: this.toLabelRegex(optionName) }).first() },
                { name: 'label', locator: this.page.getByLabel(this.toLabelRegex(optionName)).first() },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    async getRadioInGroup(groupLabel: string, optionName: string, options?: { timeout?: number }) {
        const groupEscaped = this.toXPathLiteral(groupLabel);
        const optionEscaped = this.toXPathLiteral(optionName);
        return SmartLocator.resolve(
            `Radio in ${groupLabel}: ${optionName}`,
            [
                {
                    name: 'role-radiogroup',
                    locator: this.page
                        .getByRole('radiogroup', { name: this.toLabelRegex(groupLabel) })
                        .getByRole('radio', { name: this.toLabelRegex(optionName) })
                        .first(),
                },
                {
                    name: 'xpath-radiogroup',
                    locator: this.page
                        .locator(
                            `xpath=(//*[@role='radiogroup' and contains(normalize-space(@aria-label), ${groupEscaped})]//*[@role='radio' and (contains(normalize-space(@aria-label), ${optionEscaped}) or contains(normalize-space(), ${optionEscaped}))][1])`,
                        )
                        .first(),
                },
                {
                    name: 'xpath-near-label',
                    locator: this.page
                        .locator(
                            `xpath=(//*[contains(normalize-space(), ${groupEscaped})]/following::*[@role='radio' and (contains(normalize-space(@aria-label), ${optionEscaped}) or contains(normalize-space(), ${optionEscaped}))][1])`,
                        )
                        .first(),
                },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    async getVisibleDropdownOptions() {
        return this.page
            .locator('[role="option"]:visible, mat-option:visible, .mat-mdc-option:visible, .mdc-list-item:visible')
            .filter({ hasText: /.+/ });
    }

    /** The "DTC Information" section region (scopes all DTC controls to avoid page-wide collisions). */
    private dtcRegion(): Locator {
        return this.page.getByRole('region', { name: /dtc information/i });
    }

    /** "Enter DTC code" textbox inside the DTC Information section. */
    async getDtcCodeInput(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'DTC Code Input',
            [{ name: 'role', locator: this.dtcRegion().getByRole('textbox', { name: /dtc/i }).first() }],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** "Add" button inside the DTC Information section. */
    async getDtcAddButton(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'DTC Add Button',
            [{ name: 'role', locator: this.dtcRegion().getByRole('button', { name: /^add$/i }).first() }],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** DTC grid rows that contain the given code (plain collection locator — used for presence/removal checks). */
    getDtcRowsByCode(dtcCode: string): Locator {
        return this.dtcRegion().getByRole('row').filter({ hasText: this.toLabelRegex(dtcCode) });
    }

    /** The "Primary DTC" action label rendered in the row for the given code. */
    getDtcPrimaryActionLabel(dtcCode: string): Locator {
        return this.getDtcRowsByCode(dtcCode).first().getByText(/primary dtc/i);
    }

    /** The "Set Primary" button in the DTC row. */
    getDtcSetPrimaryButton(dtcCode: string): Locator {
        return this.getDtcRowsByCode(dtcCode).first().getByText(/set primary/i);
    }

    /** Trash icon button in the DTC row (the only non-text button after Set Primary becomes Primary DTC). */
    getDtcDeleteButton(dtcCode: string): Locator {
        return this.getDtcRowsByCode(dtcCode).first().locator('button').last();
    }

    /** "Delete row?" dialog heading. */
    getDeleteRowDialogHeading(): Locator {
        return this.page.getByText(/delete row\?/i).first();
    }

    /** "This action cannot be undone." message. */
    getDeleteRowDialogMessage(): Locator {
        return this.page.getByText(/this action cannot be undone/i).first();
    }

    /** "Delete" confirm button in the popup. */
    getDeleteRowDialogDeleteButton(): Locator {
        return this.page.getByRole('button', { name: /^delete$/i }).first();
    }

    /** "Cancel" button in the popup. */
    getDeleteRowDialogCancelButton(): Locator {
        return this.page.getByRole('button', { name: /^cancel$/i }).first();
    }

    /** The "Part Number Information" section region (scopes all controls to avoid page-wide collisions). */
    private partNumberRegion(): Locator {
        return this.page.getByRole('region', { name: /part number information/i });
    }

    /** "Enter the part number" textbox inside the Part Number Information section. */
    async getPartNumberInput(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Part Number Input',
            [{ name: 'placeholder', locator: this.partNumberRegion().getByPlaceholder(/enter the part number/i).first() }],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** "Enter serial number / date" textbox inside the Part Number Information section. */
    async getPartSerialDateInput(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Part Serial/Date Input',
            [{ name: 'placeholder', locator: this.partNumberRegion().getByPlaceholder(/enter serial number/i).first() }],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** "Enter the Quantity" textbox inside the Part Number Information section. */
    async getPartQuantityInput(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Part Quantity Input',
            [{ name: 'placeholder', locator: this.partNumberRegion().getByPlaceholder(/enter the quantity/i).first() }],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** "Add" button inside the Part Number Information section. */
    async getPartNumberAddButton(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Part Number Add Button',
            [{ name: 'role', locator: this.partNumberRegion().getByRole('button', { name: /^add$/i }).first() }],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** Part Number grid rows that contain the given part number (plain collection locator — used for presence checks). */
    getPartNumberRowsByValue(partNumber: string): Locator {
        return this.partNumberRegion().getByRole('row').filter({ hasText: this.toLabelRegex(partNumber) });
    }

    /** The "Set Primary" button rendered in the part number row. */
    getPartNumberSetPrimaryButton(partNumber: string): Locator {
        return this.getPartNumberRowsByValue(partNumber).first().getByText(/set primary/i);
    }

    async getSaveAsDraftButton() {
        return SmartLocator.resolve('Save as Draft Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /save as draft/i }).first() },
            { name: 'text', locator: this.page.getByText(/save as draft/i).first() },
        ]);
    }

    /** "Repair Details" section heading (Condition Description / Diagnostic Steps / Repair Process). */
    async getRepairDetailsHeading(options?: { timeout?: number }) {
        return SmartLocator.resolve(
            'Repair Details Heading',
            [
                { name: 'role', locator: this.page.getByRole('heading', { name: /repair details/i }).first() },
                { name: 'text', locator: this.page.getByText(/^Repair Details$/i).first() },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /**
     * Resolve a Repair Details `<textarea>` by its field label (e.g. "Condition
     * Description"). Mirrors getTextboxByLabel but targets a textarea element.
     */
    async getRepairDetailTextarea(label: string, options?: { timeout?: number }) {
        const escaped = this.toXPathLiteral(label);
        return SmartLocator.resolve(
            `Repair Details Textarea: ${label}`,
            [
                { name: 'role-name', locator: this.page.getByRole('textbox', { name: this.toLabelRegex(label) }).first() },
                {
                    name: 'xpath-textarea',
                    locator: this.page
                        .locator(`xpath=(//*[contains(normalize-space(), ${escaped})]/following::textarea[1])`)
                        .first(),
                },
            ],
            { timeout: options?.timeout ?? 10000 },
        );
    }

    /** "Submit" button on the FTR action bar. */
    async getSubmitButton() {
        return SmartLocator.resolve('Submit Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^submit$/i }).first() },
            { name: 'text', locator: this.page.getByText(/^submit$/i).first() },
        ]);
    }

    /** Submission confirmation banner heading ("Thank you for submitting your Field Technical Report (#FTR...)"). */
    getSubmissionSuccessHeading(): Locator {
        return this.page.getByText(/thank you for submitting your field technical report/i).first();
    }

    /** "Close" button on the submission confirmation screen. */
    getSubmissionCloseButton(): Locator {
        return this.page.getByRole('button', { name: /^close$/i }).first();
    }
}
