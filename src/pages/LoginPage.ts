import { Page } from '@playwright/test';
import { SmartLocator } from '../utils/SmartLocator';

/**
 * LoginPage — Layer 1: Locators Only
 * 
 * Handles login form elements with self-healing fallback strategies.
 * No business logic or assertions in this layer.
 */
export class LoginPage {
    constructor(private page: Page) {}

    /**
     * Get username/email input field.
     * TIER 3 (known-flaky login): label text and field naming vary across SSO/app builds.
     */
    async getUsernameInput() {
        return SmartLocator.resolve('Username Input', [
            { name: 'label', locator: this.page.getByLabel(/user\s*name|username|email|user\s*id/i) },
            // reason: some login builds expose no <label>, only a name attribute on the input
            { name: 'name', locator: this.page.locator('input[name*="user"]').first() },
        ]);
    }

    /**
     * Get password input field.
     * TIER 3 (known-flaky login): label may be absent; fall back to the password input type.
     */
    async getPasswordInput() {
        return SmartLocator.resolve('Password Input', [
            { name: 'label', locator: this.page.getByLabel(/password|pass/i) },
            // reason: some login builds expose no <label>; type=password is the stable handle
            { name: 'type', locator: this.page.locator('input[type="password"]').first() },
        ]);
    }

    /**
     * Get login button.
     * TIER 3 (known-flaky login): button label varies (Log in / Sign In / Submit).
     */
    async getLoginButton() {
        return SmartLocator.resolve('Login Button', [
            { name: 'role', locator: this.page.getByRole('button', { name: /log\s*in|sign\s*in|submit/i }) },
            // reason: some builds render an unlabeled submit control inside the form
            { name: 'form', locator: this.page.locator('form button[type="submit"]').first() },
        ]);
    }

    /**
     * Get page header or title to verify login page is displayed.
     * TIER 3 (known-flaky login): the heading is not always a role=heading; some builds use a plain <h1>.
     */
    async getPageHeading() {
        return SmartLocator.resolve('Login Page Heading', [
            { name: 'role', locator: this.page.getByRole('heading', { level: 1 }) },
            // reason: SSO/login builds frequently render the title as a styled <h1> without heading role semantics
            { name: 'css', locator: this.page.locator('h1').first() },
        ]);
    }
}
