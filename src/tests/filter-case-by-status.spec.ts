import { test, expect } from '../fixtures';
import { LoginModule } from '../modules/LoginModule';
import { CaseViewModule } from '../modules/CaseViewModule';
import { credentials } from '../config';

const TARGET_STATUS = 'Pending T2 Review';

test.describe('My Created Status Filter Workflow @P1 @Regression', () => {
    test('User filters My Created cases by status and verifies the case in the new tab @P1 @Regression', async ({
        page,
        userHomePage,
        userHomeModule,
    }) => {
        // 1. Login (lands on /user-home) and confirm we are on the user home page.
        const loginModule = new LoginModule(page);
        const { username, password } = credentials('app');
        await loginModule.performLogin(username, password);

        const isLoggedIn = await loginModule.verifyLoggedIn();
        expect(isLoggedIn).toBe(true);

        // 2. Switch to the "My Created" tab and confirm it is the selected (highlighted) tab.
        await userHomeModule.openMyCreatedTab();

        const myCreatedTab = await userHomePage.getMyCreatedTab();
        expect(await myCreatedTab.isChecked()).toBe(true);

        // 3. Filter the grid by Status = "Pending T2 Review" and wait for results.
        await userHomeModule.filterByCaseStatus(TARGET_STATUS);

        // 4. Open the first filtered case — it launches in a new tab.
        const initialTabCount = page.context().pages().length;
        const { caseViewPage, caseId } = await userHomeModule.openFirstCreatedCase();

        expect(page.context().pages().length).toBe(initialTabCount + 1);
        expect(caseViewPage.url()).toContain(`/tas/case-view?caseId=${caseId}`);

        // 5. On the case-view tab, verify the case is loaded and the Case ID matches.
        const caseViewModule = new CaseViewModule(caseViewPage);
        await caseViewModule.waitForReady(caseId);

        // 6. Verify the Status on the case-view page equals the filtered status.
        const actualStatus = await caseViewModule.getStatusValue();
        expect(actualStatus.toLowerCase()).toContain(TARGET_STATUS.toLowerCase());
    });
});
