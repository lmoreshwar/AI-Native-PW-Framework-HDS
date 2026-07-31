import { test, expect } from '../fixtures';
import { LoginModule } from '../modules/LoginModule';
import { CaseViewModule } from '../modules/CaseViewModule';
import { credentials } from '../config';

const TARGET_STATUS = 'Pending T2 Review';

test.describe('Case View Watch Case Workflow @P1 @Regression', () => {
    test('User adds a filtered case to the watch list and verifies the confirmation and Unwatch state @P1 @Regression', async ({
        page,
        userHomeModule,
    }) => {
        // 1. Login (lands on /user-home) and confirm we are on the user home page.
        const loginModule = new LoginModule(page);
        const { username, password } = credentials('app');
        await loginModule.performLogin(username, password);

        const isLoggedIn = await loginModule.verifyLoggedIn();
        expect(isLoggedIn).toBe(true);

        // 2. Switch to the "My Created" tab and wait for cases to load.
        await userHomeModule.openMyCreatedTab();

        // 3. Filter the grid by Status = "Pending T2 Review" and wait for results.
        await userHomeModule.filterByCaseStatus(TARGET_STATUS);

        // 4. Open the first filtered case — it launches in a new tab.
        const { caseViewPage, caseId } = await userHomeModule.openFirstCreatedCase();
        expect(caseViewPage.url()).toContain(`/tas/case-view?caseId=${caseId}`);

        // 5. Wait for the case-view page to be fully loaded.
        const caseViewModule = new CaseViewModule(caseViewPage);
        await caseViewModule.waitForReady(caseId);

        // 6. Reset to the unwatched state — watch state is persistent, so a prior
        //    run may have left this case watched (showing "Unwatch Case").
        await caseViewModule.resetToUnwatchedState();

        // 7. Click "Watch Case" and verify the confirmation toast appears AND the
        //    control toggles to "Unwatch Case".
        const addedToWatchList = await caseViewModule.watchCaseAndVerify();
        expect(addedToWatchList).toBe(true);
    });
});
