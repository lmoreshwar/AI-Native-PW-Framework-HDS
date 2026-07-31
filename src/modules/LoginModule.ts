import { Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { Logger } from '../utils/Logger';
import { Actions } from '../utils/Actions';
import { WaitHelper } from '../utils/WaitHelper';
import { env, config } from '../config';

/**
 * LoginModule — Layer 2: Business Logic
 * 
 * Orchestrates the login workflow using Logger.step() and LoginPage locators.
 * Uses env() for credentials from .env file.
 */
export class LoginModule {
    private loginPage: LoginPage;
    private logger: Logger;
    private actions: Actions;
    private waitHelper: WaitHelper;

    constructor(private page: Page) {
        this.loginPage = new LoginPage(page);
        this.logger = Logger.create('LoginModule');
        this.actions = new Actions(page);
        this.waitHelper = new WaitHelper(page);
    }

    /**
     * Perform complete login workflow with Corporate User credentials
     * 
     * @param username - Optional username override (default from .env APP_USERNAME)
     * @param password - Optional password override (default from .env APP_PASSWORD)
     */
    async performLogin(username?: string, password?: string): Promise<void> {
        const user = username || env('APP_USERNAME');
        const pass = password || env('APP_PASSWORD');

        this.logger.testStart('Login Workflow');

        this.logger.step(1, `Navigating to ${config.baseUrl}`);
        await this.page.goto('/');

        this.logger.step(2, `Waiting for login page to render`);
        await this.waitHelper.waitForPageLoadState('domcontentloaded', { timeout: 30000 }).catch(() => null);
        // Slow UAT boots behind an initial "Loading..." app-shell spinner; let it clear (framework
        // budget) before resolving the heading, otherwise the 15s heading wait can give up too early.
        await this.waitHelper.waitForLoader({ timeout: 45000, stableWindowMs: 800 }).catch(() => null);
        const pageHeading = await this.loginPage.getPageHeading();
        await pageHeading.isVisible({ timeout: 15000 }).catch(() => null);

        this.logger.step(3, `Filling username: ${user}`);
        const usernameInput = await this.loginPage.getUsernameInput();
        await this.actions.fill(usernameInput, user);

        this.logger.step(4, `Filling password`);
        const passwordInput = await this.loginPage.getPasswordInput();
        await this.actions.fill(passwordInput, pass);

        this.logger.step(5, `Clicking login button`);
        const loginButton = await this.loginPage.getLoginButton();

        // Use Promise.all to handle the navigation that fires immediately on login click
        await Promise.all([
            this.waitHelper.waitForUrlMatch(/\/user-home/i, { timeout: 20000 }).catch(async (err) => {
                // ERR_ABORTED happens on some auth redirects — fall back to load state
                this.logger.warn(`waitForURL caught: ${(err as Error).message} — falling back to waitForLoadState`);
                await this.waitHelper.waitForPageLoadState('load', { timeout: 20000 }).catch(() => null);
                await this.waitHelper.waitForUrlMatch(/\/user-home/i, { timeout: 15000 }).catch(() => null);
            }),
            this.actions.click(loginButton),
        ]);

        this.logger.testEnd('Login Workflow');
    }

    /**
     * Verify user is logged in and on the user home page
     */
    async verifyLoggedIn(): Promise<boolean> {
        try {
            const currentUrl = this.page.url();
            this.logger.info(`Current URL: ${currentUrl}`);
            return currentUrl.includes('/user-home');
        } catch (error) {
            this.logger.error('Failed to verify login', error);
            return false;
        }
    }
}
