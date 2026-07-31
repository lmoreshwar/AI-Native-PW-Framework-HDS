import { Page } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * UserHomePage — Layer 1: Locators Only
 *
 * Handles the existing `/user-home` page elements required for TAS case search.
 */
export class UserHomePage {
    constructor(private page: Page) {}

    /**
     * Get the "My Created" radio option on the user home page case grid.
     * (Part of the `myassigned_mycreated_cases` radiogroup, alongside Case Search.)
     */
    async getMyCreatedTab() {
        return SmartLocator.resolve('My Created Tab', [
            { name: 'radio', locator: this.page.getByRole('radio', { name: /my created/i }).first() },
            // reason: radio label can render as a plain clickable text node in some builds
            { name: 'text', locator: this.page.getByText(/^my created$/i).first() },
        ]);
    }

    /**
     * Get the FIRST case # hyperlink in the cases grid (TA-number link).
     * No hardcoded case id — captures whatever case is first in the list.
     */
    async getFirstCaseLink() {
        return SmartLocator.resolve('First Case Link', [
            { name: 'ta-link', locator: this.page.getByRole('link', { name: /^\s*TA\d+\s*$/i }).first() },
            // reason: link accessible name can carry surrounding cell text, so fall back to href pattern
            { name: 'href', locator: this.page.locator('a[href*="caseId=TA"]').first() },
        ]);
    }

    /**
     * Get the per-column Status filter input in the "My Created" cases grid.
     *
     * TIER 3 (grid column-filter input, no guaranteed accessible name): the Status
     * column filter textbox sits in the grid header filter row with no visible label
     * or placeholder, so it needs structural fallbacks to stay resilient.
     */
    async getStatusFilterInput() {
        return SmartLocator.resolve('My Created Status Filter Input', [
            { name: 'role-name', locator: this.page.getByRole('textbox', { name: /status/i }).first() },
            // reason: some grid builds expose the column on the input only via placeholder, not an accessible name
            { name: 'placeholder', locator: this.page.getByPlaceholder(/status/i).first() },
            // reason: when the input has neither name nor placeholder, scope to the Status columnheader's own input
            {
                name: 'columnheader-input',
                locator: this.page
                    .locator('[role="columnheader"]')
                    .filter({ hasText: /^\s*status\s*$/i })
                    .locator('input')
                    .first(),
            },
        ]);
    }

    /**
     * Get the per-column "Case #" filter input in the "My Created" cases grid.
     *
     * Evidence: UAT My Created grid exposes the column filter as a textbox with
     * the accessible name "Case # Filter Input".
     */
    async getCaseIdFilterInput() {
        return SmartLocator.resolve('My Created Case # Filter Input', [
            { name: 'role-name', locator: this.page.getByRole('textbox', { name: /case #\s*filter input/i }).first() },
            // reason: when the grid build drops the accessible name, scope to the Case # columnheader's own input
            {
                name: 'columnheader-input',
                locator: this.page
                    .locator('[role="columnheader"]')
                    .filter({ hasText: /^\s*case #\s*$/i })
                    .locator('input')
                    .first(),
            },
        ]);
    }

    /**
     * Get the "Refresh" button above the "My Created" cases grid (used to re-query
     * the grid while waiting for a just-created case to become searchable).
     */
    async getMyCreatedRefreshButton() {
        return SmartLocator.resolve('My Created Refresh Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /^\s*refresh\s*$/i }).first() },
        ]);
    }

    /**
     * Get the Case Search radio option on the user home page.
     */
    async getCaseSearchRadio() {
        return SmartLocator.resolve('Case Search Radio', [
            {
                name: 'role',
                locator: this.page.getByRole('radio', { name: /case search/i }),
            },
            {
                name: 'text',
                locator: this.page.getByText(/^case search$/i).first(),
            },
            {
                name: 'css',
                locator: this.page.locator('[role="radio"]').filter({ hasText: /case search/i }).first(),
            },
        ]);
    }

    /**
     * Get the Case # textbox in the Case Search panel.
     */
    async getCaseIdInput() {
        return SmartLocator.resolve('Case Search Case # Input', [
            {
                name: 'role',
                locator: this.page.getByRole('textbox', { name: /please enter case #/i }),
            },
            {
                name: 'placeholder',
                locator: this.page.getByPlaceholder(/please enter case #/i),
            },
            {
                name: 'css',
                locator: this.page.locator('input[placeholder*="Case" i]').first(),
            },
        ]);
    }

    /**
     * Get the Search button in the Case Search panel.
     */
    async getSearchButton() {
        return SmartLocator.resolve('Case Search Button', [
            {
                name: 'role',
                locator: this.page.getByRole('button', { name: /^search$/i }),
            },
            {
                name: 'text',
                locator: this.page.getByText(/^search$/i).first(),
            },
            {
                name: 'css',
                locator: this.page.locator('button').filter({ hasText: /^search$/i }).first(),
            },
        ]);
    }

    /**
     * Get the result row for the requested case ID.
     */
    async getResultRow(caseId: string) {
        const caseIdPattern = new RegExp(escapeRegExp(caseId), 'i');
        const exactCaseIdPattern = new RegExp(`^${escapeRegExp(caseId)}$`, 'i');

        return SmartLocator.resolve(`Case Search Result Row ${caseId}`, [
            {
                name: 'link-ancestor-row',
                locator: this.page
                    .getByRole('link', { name: exactCaseIdPattern })
                    .first()
                    .locator('xpath=ancestor::*[@role="row"][1]'),
            },
            {
                name: 'role',
                locator: this.page.getByRole('row', { name: caseIdPattern }).first(),
            },
            {
                name: 'grid-row',
                locator: this.page.locator('[role="row"]').filter({ hasText: caseId }).first(),
            },
            {
                name: 'text',
                locator: this.page
                    .locator('[role="treegrid"]')
                    .getByText(caseIdPattern)
                    .first()
                    .locator('xpath=ancestor::*[@role="row" or @role="gridcell"][1]'),
            },
        ]);
    }

    /**
     * Get the case hyperlink from the search results grid.
     */
    async getCaseLink(caseId: string) {
        const exactCaseIdPattern = new RegExp(`^${escapeRegExp(caseId)}$`, 'i');

        return SmartLocator.resolve(`Case Result Link ${caseId}`, [
            {
                name: 'role',
                locator: this.page.getByRole('link', { name: exactCaseIdPattern }).first(),
            },
            {
                name: 'text',
                locator: this.page.getByText(exactCaseIdPattern).first(),
            },
            {
                name: 'href',
                locator: this.page.locator(`a[href*="${caseId}"]`).first(),
            },
        ]);
    }

    /**
     * Wait until the user home page is ready.
     */
    async waitForPageLoad() {
        await SmartLocator.resolve(
            'User Home Ready Anchor',
            [
                {
                    name: 'welcome',
                    locator: this.page.getByText(/welcome to quality1/i).first(),
                },
                {
                    name: 'case-search-radio',
                    locator: this.page.getByRole('radio', { name: /case search|my assigned/i }).first(),
                },
                {
                    name: 'treegrid',
                    locator: this.page.locator('[role="treegrid"]').first(),
                },
            ],
            { timeout: 15000, state: 'visible' },
        );
    }
}