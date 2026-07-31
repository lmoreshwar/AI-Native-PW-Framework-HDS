import { test, expect } from '../fixtures';
import { LoginModule } from '../modules/LoginModule';
import { TASModule } from '../modules/TASModule';
import { credentials } from '../config';

test.describe('TAS Pre-Call Worksheet Navigation @P0 @Smoke', () => {
    test('User logs in, opens TAS from the hamburger menu, and lands on the Pre-Call Worksheet page @P0 @Smoke', async ({
        page,
    }) => {
        // 1. Login to the application.
        const loginModule = new LoginModule(page);
        const { username, password } = credentials('app');
        await loginModule.performLogin(username, password);

        // 2. Verify we landed on the user home page.
        const isLoggedIn = await loginModule.verifyLoggedIn();
        expect(isLoggedIn).toBe(true);

        const tasModule = new TASModule(page);

        // 3. Open the hamburger menu.
        await tasModule.openHamburgerMenu();

        // 4. Click the TAS option and wait for the TAS shell to load.
        await tasModule.navigateToTAS();

        // 5. Click the Pre-Call Worksheets tab and wait for the page to load.
        await tasModule.openPreCallWorksheets();

        // 6. Verify the Pre-Call Worksheet page loaded successfully.
        const preCallLoaded = await tasModule.verifyPreCallWorksheetLoaded();
        expect(preCallLoaded).toBe(true);
        expect(page.url()).toMatch(/\/tas\/case-setup\/pre-?call-worksheets/i);
    });
});
