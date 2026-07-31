import { Page } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';
import { WaitHelper } from '../utils/WaitHelper';
import { WorkflowActions } from '../utils/WorkflowActions';

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * CaseSearchPage — Layer 1: Locators Only
 *
 * Handles the case detail page opened in a new tab from Case Search results.
 */
export class CaseSearchPage {
    private workflowActions: WorkflowActions;
    private waitHelper: WaitHelper;

    constructor(private page: Page) {
        this.workflowActions = new WorkflowActions(page);
        this.waitHelper = new WaitHelper(page);
    }

    /**
     * Wait until loading indicators are absent for a stable window.
     *
     * Handles cases where the spinner disappears and reappears multiple times.
     */
    async waitForLoadingToStabilize(options?: { timeoutMs?: number; stableWindowMs?: number }) {
        await this.workflowActions.waitForLoadingToStabilize(options);
    }

    /**
     * Get the selected Case View tab on the TAS page shell.
     */
    async getCaseViewTab() {
        return SmartLocator.resolve('Case View Tab', [
            {
                name: 'role',
                locator: this.page.getByRole('tab', { name: /case view/i }).first(),
            },
            {
                name: 'text',
                locator: this.page.getByText(/^case view$/i).first(),
            },
            {
                name: 'css',
                locator: this.page.locator('[role="tab"]').filter({ hasText: /case view/i }).first(),
            },
        ]);
    }

    /**
     * Get the Case Information region on the case-view page.
     */
    async getCaseInformationRegion() {
        return SmartLocator.resolve('Case Information Region', [
            {
                name: 'region',
                locator: this.page.getByRole('region', { name: /case information/i }),
            },
            {
                name: 'text',
                locator: this.page.getByText(/case information/i).first(),
            },
        ]);
    }

    /**
     * Get the visible case number element from the Case Information section.
     */
    async getCaseIdValue(caseId: string) {
        const escapedCaseId = escapeRegExp(caseId);
        const exactCaseIdPattern = new RegExp(`^\\s*${escapedCaseId}\\s*$`, 'i');
        const caseIdContainsPattern = new RegExp(escapedCaseId, 'i');
        const labeledCaseIdPattern = new RegExp(`case\\s*#?\\s*:?\\s*${escapedCaseId}`, 'i');
        const caseInfoRegion = this.page.getByRole('region', { name: /case information/i });

        return SmartLocator.resolve(`Case View Case ID ${caseId}`, [
            {
                name: 'case-info-region',
                locator: caseInfoRegion.locator('p').filter({ hasText: caseIdContainsPattern }).first(),
            },
            {
                name: 'labeled-paragraph',
                locator: this.page
                    .locator('p', {
                        has: this.page.locator('strong').filter({ hasText: /case\s*#/i }),
                    })
                    .filter({ hasText: caseIdContainsPattern })
                    .first(),
            },
            {
                name: 'text-exact',
                locator: this.page.getByText(exactCaseIdPattern).first(),
            },
            {
                name: 'paragraph-loose',
                locator: this.page.locator('p').filter({ hasText: labeledCaseIdPattern }).first(),
            },
            {
                name: 'text-contains',
                locator: this.page.getByText(caseIdContainsPattern).first(),
            },
            {
                name: 'url',
                locator: this.page.locator(`a[href*="caseId=${caseId}"], a[href*="${caseId}"]`).first(),
            },
        ]);
    }

    /**
     * Get the "Details" expander inside the Case Information region.
     *
     * "Details" renders as a clickable header (chevron icon + plain text node)
     * at the bottom of the Case Information region. Scoping to that region
     * excludes the vehicle banner "More Details" tab and the "Case Details" region.
     */
    async getCaseDetailsExpander() {
        const caseInfoRegion = this.page.getByRole('region', { name: /case information/i });

        return SmartLocator.resolve('Case Details Expander', [
            {
                name: 'region-details-node',
                locator: caseInfoRegion.locator('xpath=.//*[normalize-space(text())="Details"]').first(),
            },
            // reason: if markup nests the label differently, fall back to region-scoped text (substring,
            // safe because the Case Information region contains no other "Details" text)
            {
                name: 'region-details-text',
                locator: caseInfoRegion.getByText('Details').first(),
            },
        ]);
    }

    /**
     * Get the paragraph/row that holds the case "Creator" value after Details is expanded.
     */
    async getCreatorRow() {
        const caseInfoRegion = this.page.getByRole('region', { name: /case information/i });

        return SmartLocator.resolve('Case Creator Row', [
            {
                name: 'region-paragraph',
                locator: caseInfoRegion.locator('p').filter({ hasText: /creator/i }).first(),
            },
            // reason: creator may render outside a <p> — fall back to the nearest container of the label
            {
                name: 'text-container',
                locator: this.page
                    .getByText(/creator/i)
                    .first()
                    .locator('xpath=ancestor-or-self::*[self::p or self::tr or self::li or self::div][1]'),
            },
        ]);
    }

    /**
     * Get the read-only Status value paragraph in the Case Information region.
     *
     * Scoped to the Case Information region so it never matches the editable
     * "Status" dropdown in the Case Actions section.
     */
    async getStatusValue() {
        const caseInfoRegion = this.page.getByRole('region', { name: /case information/i });

        return SmartLocator.resolve('Case View Status Value', [
            {
                name: 'region-paragraph',
                locator: caseInfoRegion.locator('p').filter({ hasText: /status/i }).first(),
            },
            // reason: status may render outside a <p> — fall back to the nearest container of the "Status:" label
            {
                name: 'region-text-container',
                locator: caseInfoRegion
                    .getByText(/status\s*:/i)
                    .first()
                    .locator('xpath=ancestor-or-self::*[self::p or self::div or self::li][1]'),
            },
        ]);
    }

    /**
     * Get the "Watch Case" action control in the Case Actions section.
     *
     * TIER 3 (Case Actions control renders as a borderless icon + text node, not a
     * reliable accessible button — unlike the bordered "Email Case to Self"/"Reassign").
     */
    async getWatchCaseButton() {
        return SmartLocator.resolve('Watch Case Button', [
            { name: 'text-exact', locator: this.page.getByText(/^\s*watch case\s*$/i).first() },
            // reason: when the build exposes an accessible role, match it as a button instead
            { name: 'role-button', locator: this.page.getByRole('button', { name: /^\s*watch case\s*$/i }).first() },
        ]);
    }

    /**
     * Get the "Unwatch Case" action control shown after a case is added to the watch list.
     *
     * Its presence is the state-change proof that Watch Case succeeded.
     * TIER 3 (same borderless icon + text rendering as the Watch Case control).
     */
    async getUnwatchCaseButton() {
        return SmartLocator.resolve('Unwatch Case Button', [
            { name: 'text-exact', locator: this.page.getByText(/^\s*unwatch case\s*$/i).first() },
            // reason: when the build exposes an accessible role, match it as a button instead
            { name: 'role-button', locator: this.page.getByRole('button', { name: /^\s*unwatch case\s*$/i }).first() },
        ]);
    }

    /**
     * Get the toast/confirmation message shown after adding a case to the watch list.
     */
    async getWatchListConfirmationMessage() {
        return SmartLocator.resolve('Watch List Confirmation Message', [
            { name: 'text', locator: this.page.getByText(/added to watch\s*list/i).first() },
        ]);
    }

    /**
     * Get the editable Status combobox in the Case Actions section.
     *
     * Evidence: case-view screenshot showing Case Actions row with
     * Status dropdown currently set to "Pending T2 Review".
     */
    async getCaseActionsStatusCombobox() {
        return SmartLocator.resolve('Case Actions Status Combobox', [
            { name: 'label-scoped', locator: this.page.getByText(/^status$/i).first().locator('xpath=following::*[@role="combobox"][1]') },
            // reason: in some builds the combobox exposes an accessible name "Status" and can be targeted directly
            { name: 'role', locator: this.page.getByRole('combobox', { name: /status/i }).first() },
        ]);
    }

    /**
     * Get the target status option from the opened Status dropdown list.
     */
    async getCaseActionsStatusOption(optionText: string) {
        const optionPattern = new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`, 'i');
        return SmartLocator.resolve(`Case Actions Status Option ${optionText}`, [
            { name: 'role', locator: this.page.getByRole('option', { name: optionPattern }).first() },
            // reason: some listbox renders expose options as plain text rows before role hydration
            { name: 'text', locator: this.page.getByText(optionPattern).first() },
        ]);
    }

    /**
     * Get the Save & Submit action control in the Case Actions header.
     */
    async getSaveAndSubmitButton() {
        return SmartLocator.resolve('Case Actions Save And Submit Button', [
            { name: 'text', locator: this.page.getByText(/^\s*save\s*&\s*submit\s*$/i).first() },
            // reason: some builds expose it as a semantic button with accessible name
            { name: 'role', locator: this.page.getByRole('button', { name: /^\s*save\s*&\s*submit\s*$/i }).first() },
        ]);
    }

    /**
     * Wait until the case-view page is ready.
     */
    async waitForPageLoad(caseId: string) {
        await SmartLocator.resolve(
            'Case View Ready Anchor',
            [
                {
                    name: 'tab',
                    locator: this.page.getByRole('tab', { name: /case view/i }).first(),
                },
                {
                    name: 'case-information',
                    locator: this.page.getByText(/case information/i).first(),
                },
            ],
            { timeout: 30000, state: 'visible' },
        );

        await this.waitHelper.waitForPageReady({ timeout: 30000 }).catch(() => null);
        await this.waitForLoadingToStabilize({ timeoutMs: 30000, stableWindowMs: 1500 });

        const caseIdValue = await this.getCaseIdValue(caseId);
        await this.waitHelper.waitForVisible(caseIdValue, { timeout: 30000 });

        await this.waitForLoadingToStabilize({ timeoutMs: 20000, stableWindowMs: 1200 });
        await this.waitHelper.waitForVisible(caseIdValue, { timeout: 15000 });
    }
}