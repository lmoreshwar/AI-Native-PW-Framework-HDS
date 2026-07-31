import { Page, Locator } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';

/**
 * TASPage — Layer 1: Locators Only
 * 
 * Handles Tasks menu, VIN input, and Create Case page elements.
 * With self-healing fallback strategies.
 */
export class TASPage {
    constructor(private page: Page) {}

    private escapeForRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get hamburger menu button.
     * TIER 3 (known-flaky nav): accessible name/markup varies across app builds.
     */
    async getHamburgerMenu() {
        return SmartLocator.resolve('Hamburger Menu', [
            { name: 'role', locator: this.page.getByRole('button', { name: /menu|hamburger|navigation/i }) },
            // reason: some builds expose only an aria-label, not a button role name
            { name: 'aria', locator: this.page.locator('[aria-label*="menu" i]').first() },
            // reason: icon-only builds expose no accessible name at all — match the menu/hamburger icon class
            { name: 'css', locator: this.page.locator('button.menu, button[class*="hamburger"]').first() },
        ]);
    }

    /**
     * Get TAS menu item from navigation.
     * TIER 3 (known-flaky nav): renders as menuitem/link before the shell loads, then as a tab.
     */
    async getTASMenuItem() {
        return SmartLocator.resolve('TAS Menu Item', [
            {
                name: 'role',
                locator: this.page.getByRole('menuitem', { name: /tas|tasks/i }).or(
                    this.page.getByRole('link', { name: /tas|tasks/i })
                ),
            },
            // reason: when the TAS shell is already loaded the entry is a tab, not a menuitem/link
            {
                name: 'tab',
                locator: this.page.getByRole('tab', { name: /tas\s*home|create\s+a\s*(tas\s*)?case/i }).first(),
            },
        ]);
    }

    /**
     * Verify TAS submenu options are displayed
     * Returns list of visible task menu items
     */
    async getTASMenuOptions() {
        return SmartLocator.resolve('TAS Menu Options Container', [
            { name: 'role', locator: this.page.getByRole('menu').first() },
        ]);
    }

    /**
     * Get Create a Case option/button.
     * TIER 2: action button vs. navigation tab depending on where the flow starts.
     */
    async getCreateCaseButton() {
        return SmartLocator.resolve('Create a TAS Case Button/Tab', [
            { name: 'role-button', locator: this.page.getByRole('button', { name: /create\s+a\s*(tas\s*)?case/i }).first() },
            // reason: from TAS Home the entry is a tab labelled "Create a TAS Case", not a button
            { name: 'tab', locator: this.page.getByRole('tab', { name: /create\s+a\s+tas\s+case/i }).first() },
        ]);
    }

    async getCreateCaseTab() {
        return SmartLocator.resolve('Create a TAS Case Tab', [
            { name: 'tab', locator: this.page.getByRole('tab', { name: /create\s+a\s+tas\s+case/i }).first() },
        ]);
    }

    /**
     * Get the "Pre-Call Worksheets" tab in the TAS shell top navigation.
     * Evidence: UAT screenshot of /tas/case-setup/pre-call-worksheets — top nav tab
     * "Pre-Call Worksheets" (active), alongside TAS Home / Create a TAS Case / Case Management.
     * TIER 2 (known-flaky nav): nav entry can render as a link before the TAS shell hydrates.
     */
    async getPreCallWorksheetsTab() {
        return SmartLocator.resolve('Pre-Call Worksheets Tab', [
            { name: 'tab', locator: this.page.getByRole('tab', { name: /pre-?call\s+worksheets/i }).first() },
            // reason: before the TAS shell finishes hydrating, the nav entry can render as a link, not a tab
            { name: 'link', locator: this.page.getByRole('link', { name: /pre-?call\s+worksheets/i }).first() },
        ]);
    }

    /**
     * Get VIN input on TAS Home page ("Set your VIN" textbox).
     * Call this BEFORE clicking the Create a TAS Case tab.
     * TIER 2: field is sometimes rendered with only a placeholder, no accessible name.
     */
    async getVinInput() {
        return SmartLocator.resolve('TAS Home VIN Input', [
            { name: 'role-name', locator: this.page.getByRole('textbox', { name: /set your vin/i }) },
            // reason: some envs render the VIN field with a placeholder only (no accessible name)
            { name: 'placeholder', locator: this.page.getByPlaceholder(/set your vin/i) },
        ]);
    }

    /**
     * Get the "Pre-Call Worksheet" page heading — used to verify the Pre-Call
     * Worksheet page has loaded after clicking the Pre-Call Worksheets tab.
     * Evidence: UAT screenshot of /tas/case-setup/pre-call-worksheets — section
     * heading "Pre-Call Worksheet" (singular) with an edit icon.
     * TIER 2: the section title is sometimes rendered as plain text, not a heading role.
     */
    async getPreCallWorksheetHeading() {
        return SmartLocator.resolve('Pre-Call Worksheet Heading', [
            { name: 'role', locator: this.page.getByRole('heading', { name: /^pre-?call worksheet$/i }).first() },
            // reason: the page title is sometimes rendered as plain text, not a heading role
            { name: 'text', locator: this.page.getByText(/^pre-?call worksheet$/i).first() },
        ]);
    }

    /**
     * Get General Information page heading to verify navigation
     */
    async getGeneralInfoHeading() {
        return SmartLocator.resolve('General Information Heading', [
            { name: 'role', locator: this.page.getByRole('heading', { name: /general information/i }) },
            // reason: the section title is sometimes rendered as plain text, not a heading role
            { name: 'text', locator: this.page.getByText(/general information/i).first() },
        ]);
    }

    /**
     * Get page title/heading for current workflow to verify navigation
     */
    async getPageHeading() {
        return SmartLocator.resolve('Page Heading', [
            { name: 'role', locator: this.page.getByRole('heading', { level: 1 }) },
            // reason: some pages render the title as a styled <h1> without heading role semantics
            { name: 'css', locator: this.page.locator('h1, [role="heading"]').first() },
        ]);
    }

    /**
     * Check whether TAS context appears loaded
     */
    async isTASContextVisible(): Promise<boolean> {
        const tasTabVisible = await this.page
            .getByRole('tab', { name: /tas\s*home|create\s+a\s*(tas\s*)?case|case management|pre-?call/i })
            .first()
            .isVisible({ timeout: 2000 })
            .catch(() => false);
        return tasTabVisible;
    }

    /**
     * Check if left navigation contains TAS menuitem
     */
    async isTASSideMenuVisible(): Promise<boolean> {
        return this.page
            .getByRole('menuitem', { name: /^tas$/i })
            .first()
            .isVisible({ timeout: 1500 })
            .catch(() => false);
    }

    /**
     * Wait for TAS to be loaded — VIN input or TAS tabs visible.
     * TIER 3 (multi-state ready anchor): TAS Home can settle into different layouts, so we
     * accept any one of the stable anchors below as "loaded".
     */
    async waitForPageLoad() {
        await SmartLocator.resolve(
            'TAS Ready Anchor',
            [
                // PRIMARY: TAS Home VIN input (role+name)
                {
                    name: 'vin-input-role',
                    locator: this.page.getByRole('textbox', { name: /set your vin/i }),
                },
                // reason: when landing directly in the TAS shell the VIN input isn't present yet — tabs are
                {
                    name: 'tab',
                    locator: this.page
                        .getByRole('tab', { name: /tas\s*home|create\s+a\s*(tas\s*)?case|case management|pre-?call/i })
                        .first(),
                },
                // reason: minimal TAS Home renders only the assignment radios before tabs hydrate
                {
                    name: 'radio',
                    locator: this.page.getByRole('radio', { name: /my assigned|case search|my created/i }).first(),
                },
            ],
            { timeout: 25000, state: 'attached' },
        );
    }

    async getAssignButton() {
        return SmartLocator.resolve('Assign Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: 'Assign' }) },
        ]);
    }

    async getDealerCombobox() {
        return SmartLocator.resolve('Dealer Combobox on Assign Page', [
            // CLI-verified: combobox named "Select" under Dealer label
            { name: 'name-select', locator: this.page.getByRole('combobox', { name: 'Select' }).first() },
            // reason: label-driven build names the combobox "Dealer" instead of "Select"
            { name: 'role', locator: this.page.getByRole('combobox', { name: /dealer/i }).first() },
        ]);
    }

    async getDealerTextbox() {
        return SmartLocator.resolve('Dealer Textbox', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /^dealer$/i }) },
        ]);
    }

    async getRepairOrderDateInput() {
        // TIER 3 (no semantic handle): the date textbox has no accessible name; anchor off the calendar button.
        return SmartLocator.resolve('Repair Order Date Input', [
            {
                name: 'css-sibling',
                locator: this.page
                    .getByRole('button', { name: 'Open calendar' })
                    .first()
                    .locator('xpath=preceding-sibling::input[1]'),
            },
            // reason: in some layouts the input is not a direct sibling of the calendar button
            {
                name: 'css-near-label',
                locator: this.page
                    .locator('text=Repair Order Date')
                    .locator('xpath=ancestor::*[position()<6]//input')
                    .first(),
            },
        ]);
    }

    async getRepairOrderDateButton() {
        return SmartLocator.resolve('Repair Order Date Calendar Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: 'Open calendar' }).first() },
        ]);
    }

    async getRepairOrderInput() {
        return SmartLocator.resolve('Repair Order Input', [
            // CLI-verified: textbox "Repair Order * Required"
            { name: 'role', locator: this.page.getByRole('textbox', { name: 'Repair Order * Required' }) },
        ]);
    }

    async getOdometerInput() {
        return SmartLocator.resolve('Odometer Input', [
            // CLI-verified: textbox "Odometer * Required"
            { name: 'role', locator: this.page.getByRole('textbox', { name: 'Odometer * Required' }) },
        ]);
    }

    async getDirectContactInput() {
        return SmartLocator.resolve('Direct Contact Input', [
            // CLI-verified: textbox "Direct Contact Phone * Required"
            { name: 'role', locator: this.page.getByRole('textbox', { name: 'Direct Contact Phone * Required' }) },
        ]);
    }

    async getCustomerTypeCombobox() {
        return SmartLocator.resolve('Customer Type Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /customer type/i }) },
        ]);
    }

    async getSaveAndContinueButton() {
        return SmartLocator.resolve('Save and Continue Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^save and continue$/i }).first() },
        ]);
    }

    async getDealerSearchInput() {
        // TIER 3 (known-flaky): the search field lives in a dynamically rendered listbox/dialog overlay.
        return SmartLocator.resolve('Dealer Search Input', [
            // CLI-verified: textbox "Search" inside the listbox that opens from the dealer combobox
            {
                name: 'listbox-search',
                locator: this.page.getByRole('listbox').getByRole('textbox', { name: 'Search' }).first(),
            },
            // reason: in some builds the overlay is a dialog, not a listbox
            {
                name: 'dialog-search',
                locator: this.page.getByRole('dialog').getByRole('textbox', { name: /search/i }).first(),
            },
        ]);
    }

    async getDealerOptionByText(optionText: string) {
        const optionPattern = new RegExp(this.escapeForRegex(optionText), 'i');
        return SmartLocator.resolve('Dealer Option', [
            { name: 'role', locator: this.page.getByRole('option', { name: optionPattern }).first() },
        ]);
    }

    async getFirstTechnicianSelectButton() {
        return SmartLocator.resolve('Technician Select Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^select$/i }).first() },
        ]);
    }

    async getSaveAndReturnButton() {
        return SmartLocator.resolve('Save and Return Button', [
            // CLI-verified: button " Save and Return" (leading space from icon emphasis)
            { name: 'role', locator: this.page.getByRole('button', { name: /save and return/i }).first() },
        ]);
    }

    async getCalendarDayButton() {
        // TIER 3 (no semantic handle): Angular Material datepicker day buttons have composed
        // names like "June Jun 1, 2026, 2026"; future dates are [disabled]. No stable role+name.
        return SmartLocator.resolve('Calendar Day Button', [
            {
                // Primary: first enabled button whose name starts with a month name
                name: 'enabled-month-button',
                locator: this.page
                    .getByRole('button', {
                        name: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+/i,
                    })
                    .and(this.page.locator(':not([disabled])'))
                    .first(),
            },
            // reason: composed name format varies by locale/build; fall back to year in aria-label
            {
                name: 'aria-label-year',
                locator: this.page
                    .locator('button[aria-label*="2026"]:not([disabled]), button[aria-label*="2025"]:not([disabled])')
                    .first(),
            },
        ]);
    }

    async getCustomerConcernInput() {
        return SmartLocator.resolve('Customer Concern Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /customer concern/i }) },
        ]);
    }

    async getServiceGroupCombobox() {
        return SmartLocator.resolve('Service Group Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /service group/i }) },
        ]);
    }

    async getServiceCategoryCombobox() {
        return SmartLocator.resolve('Service Category Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /service category/i }) },
        ]);
    }

    async getSectionCombobox() {
        return SmartLocator.resolve('Section Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /^section/i }) },
        ]);
    }

    async getSubComponentCombobox() {
        return SmartLocator.resolve('Sub-Component Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /sub-?component/i }) },
        ]);
    }

    async getConditionCombobox() {
        return SmartLocator.resolve('Condition Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /^condition/i }) },
        ]);
    }

    async getPreCallWorksheetCombobox() {
        return SmartLocator.resolve('Pre-Call Worksheet Combobox', [
            { name: 'role', locator: this.page.getByRole('combobox', { name: /pre-?call worksheet/i }) },
        ]);
    }

    async getDropdownOptionByText(optionText: string) {
        const optionPattern = new RegExp(`^${this.escapeForRegex(optionText)}$`, 'i');
        return SmartLocator.resolve('Dropdown Option', [
            { name: 'role', locator: this.page.getByRole('option', { name: optionPattern }).first() },
        ]);
    }

    async getDiagnosticDescriptionInput() {
        return SmartLocator.resolve('Diagnostic Description Input', [
            { name: 'role', locator: this.page.getByRole('textbox', { name: /^description/i }) },
        ]);
    }

    async getSubmitButton() {
        return SmartLocator.resolve('Submit Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^submit$/i }) },
        ]);
    }

    async getSubmittedSuccessMessage() {
        return SmartLocator.resolve('Submitted Success Message', [
            { name: 'text', locator: this.page.getByText(/your case has been submitted successfully\.?/i).first() },
        ]);
    }

    async getSubmittedCaseLink() {
        return SmartLocator.resolve('Submitted Case Link', [
            { name: 'role', locator: this.page.getByRole('link', { name: /^ta\d+$/i }).first() },
            // reason: link text is the dynamic case id; fall back to the case-view href
            { name: 'css', locator: this.page.locator('a[href*="/tas/case-view?caseId="]').first() },
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // DTC Information Section (Diagnostic Information step)
    // Evidence: .playwright-cli/page-2026-06-18T14-00-29-413Z.yml lines 175-199
    //   - "DTC Information" heading [ref=e2689]
    //   - "DTC Found" panel [ref=e2702] containing textbox "DTC Code" [ref=e2710]
    //     and button "Add" [ref=e2712]
    //   - Two icon-only arrow buttons [ref=e2715, e2717] between Found & Primary lists
    //   - "Primary DTC" panel [ref=e2720]
    // ─────────────────────────────────────────────────────────────────────

    async getDTCInformationHeading() {
        return SmartLocator.resolve('DTC Information Heading', [
            { name: 'role', locator: this.page.getByRole('heading', { name: /^dtc information$/i }) },
            // reason: the section title is sometimes rendered as plain text, not a heading role
            { name: 'text', locator: this.page.getByText(/^dtc information$/i).first() },
        ]);
    }

    /**
     * "Get DTC" button — fetches DTC codes and populates the DTC Found list.
     * There may be multiple (one per diagnostic item), so we target the first.
     */
    async getGetDTCButton() {
        return SmartLocator.resolve('Get DTC Button', [
            { name: 'role-exact', locator: this.page.getByRole('button', { name: /^get\s*dtc$/i }).first() },
        ]);
    }

    /**
     * Container scoped to the "DTC Found" panel inside the DTC Information section.
     * The DTC Found panel is uniquely identified by containing the "DTC Code" textbox.
     * We pick the innermost div that holds BOTH that textbox and the checkbox group,
     * so it only resolves once Get DTC has populated the checkboxes.
     */
    private getDTCFoundPanel(): Locator {
        return this.page
            .locator('div')
            .filter({ has: this.page.getByRole('textbox', { name: /dtc\s*code/i }) })
            .filter({ has: this.page.getByRole('checkbox') })
            .last();
    }

    /**
     * All DTC checkboxes inside the DTC Found list after Get DTC has populated rows.
     * Returns a PLAIN Playwright Locator collection (NOT via SmartLocator, which enforces
     * single-element visibility and breaks on multi-element checkbox collections).
     *
     * Primary strategy: page-wide checkboxes whose accessible name is a DTC code
     * (e.g., "B1442", "P0420"). Before the move, these only exist in DTC Found, so this
     * is the most robust selector and is independent of div nesting. The panel-scoped
     * variant is OR'd in as a fallback for unusual DTC code formats.
     */
    getDTCFoundItems(): Locator {
        const byDtcCodeName = this.page.getByRole('checkbox', { name: /^[a-z][0-9a-z]{2,6}$/i });
        const byPanel = this.getDTCFoundPanel().getByRole('checkbox');
        return byDtcCodeName.or(byPanel);
    }

    /**
     * Arrow button that moves the selected DTC from "DTC Found" → "Primary DTC".
     * TIER 3 (icon-only, no accessible name): evidence button "" [ref=e2715] — no role name/label.
     */
    async getMoveDTCToPrimaryButton() {
        return SmartLocator.resolve('Move DTC To Primary Button', [
            // PRIMARY: icon button whose <em>/<i> child carries a right/chevron-right/arrow-right class
            {
                name: 'right-icon-class',
                locator: this.page
                    .locator(
                        'button:has(em[class*="chevron-right" i]), ' +
                            'button:has(i[class*="chevron-right" i]), ' +
                            'button:has(em[class*="arrow-right" i]), ' +
                            'button:has(i[class*="arrow-right" i]), ' +
                            'button:has(em[class*="angle-right" i]), ' +
                            'button:has(i[class*="angle-right" i])',
                    )
                    .first(),
            },
            // reason: icon class name differs across icon-font versions; fall back to title/aria hint
            {
                name: 'title-aria',
                locator: this.page
                    .locator('button[title*="primary" i], button[aria-label*="primary" i], button[title*="add to primary" i]')
                    .first(),
            },
        ]);
    }

    /**
     * Container scoped to the "Primary DTC" panel inside the DTC Information section.
     * Tag-agnostic: from the "Primary DTC" label, walk up to the NEAREST ancestor that
     * contains a checkbox. This only resolves once a DTC has been moved across, and is
     * robust against custom element tags / extra DOM wrappers.
     */
    private getPrimaryDTCPanel(): Locator {
        return this.page
            .getByText(/^primary dtc$/i)
            .first()
            .locator('xpath=ancestor::*[.//input[@type="checkbox"] or .//*[@role="checkbox"]][1]');
    }

    /**
     * DTC checkboxes currently shown inside the "Primary DTC" list (post-move).
     * Returns a PLAIN Playwright Locator collection (same rationale as getDTCFoundItems).
     */
    getPrimaryDTCItems(): Locator {
        return this.getPrimaryDTCPanel().getByRole('checkbox');
    }

    // ─────────────────────────────────────────────────────────────────────
    // Sauce Visual masking handles — expose the dynamic DTC panels and a generic
    // value-text locator used by the Module to compute ignore regions (value-only).
    // ─────────────────────────────────────────────────────────────────────

    /** The "Primary DTC" panel as a maskable region (its DTC entry is run-to-run dynamic). */
    getPrimaryDtcPanelForVisual(): Locator {
        return this.getPrimaryDTCPanel();
    }

    /** The "DTC Found" panel as a maskable region (its live DTC list is run-to-run dynamic). */
    getDtcFoundPanelForVisual(): Locator {
        return this.getDTCFoundPanel();
    }

    /** First visible element rendering the given dynamic VALUE text — used only to compute a
     *  Sauce Visual ignore region so the value is masked while labels/layout stay compared. */
    getValueText(value: string): Locator {
        return this.page.getByText(value, { exact: false }).first();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Review (Preview) page — Diagnostic Information section
    // Evidence: .playwright-cli/page-2026-06-18T14-00-40-701Z.yml lines 168-176, 229-247
    //   - heading "Diagnostic Information" [ref=e3230]
    //   - "Description" label [ref=e3242] + value generic [ref=e3243]
    //   - "Primary DTC" [ref=e3249] and "DTC Found" [ref=e3255]
    // ─────────────────────────────────────────────────────────────────────

    async getReviewDiagnosticInformationHeading() {
        return SmartLocator.resolve('Review Diagnostic Information Heading', [
            { name: 'role', locator: this.page.getByRole('heading', { name: /^diagnostic information$/i }) },
            // reason: the review section title is sometimes rendered as plain text, not a heading role
            { name: 'text', locator: this.page.getByText(/^diagnostic information$/i).first() },
        ]);
    }

    async getReviewDescriptionValue(expectedText: string) {
        const pattern = new RegExp(this.escapeForRegex(expectedText), 'i');
        return SmartLocator.resolve('Review Description Value', [
            { name: 'text-exact', locator: this.page.getByText(pattern).first() },
        ]);
    }

    async getReviewPrimaryDTCSection() {
        return SmartLocator.resolve('Review Primary DTC Label', [
            // Use .last() — same label exists in the form step, but the form is not in the DOM on Review
            { name: 'text', locator: this.page.getByText(/^primary dtc$/i).last() },
        ]);
    }

    async getReviewDTCFoundSection() {
        return SmartLocator.resolve('Review DTC Found Label', [
            { name: 'text', locator: this.page.getByText(/^dtc found$/i).last() },
        ]);
    }

    /**
     * Locator for the moved DTC code text on the Review page (inside Diagnostic Information block).
     * Lenient substring match (no strict boundaries) with a generous timeout, since the
     * review page can render slightly after navigation.
     */
    async getReviewDTCValue(dtcCode: string) {
        const exact = new RegExp(`^\\s*${this.escapeForRegex(dtcCode)}\\s*$`, 'i');
        const contains = new RegExp(this.escapeForRegex(dtcCode), 'i');
        return SmartLocator.resolve(
            `Review DTC Value (${dtcCode})`,
            [
                { name: 'text-exact', locator: this.page.getByText(exact).first() },
                // reason: review can wrap the code with adjacent labels, so allow a substring match
                { name: 'text-contains', locator: this.page.getByText(contains).first() },
            ],
            { timeout: 12000 },
        );
    }
}
