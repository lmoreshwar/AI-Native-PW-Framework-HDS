import { test, expect } from '../fixtures';
import { LoginModule } from '../modules/LoginModule';
import { CaseViewModule } from '../modules/CaseViewModule';
import { credentials } from '../config';

const SOURCE_STATUS = 'Pending T2 Review';
const TARGET_STATUS = 'Pending Dealer Response';

test.describe('Case Status Update And Save Submit Workflow @P1 @Regression', () => {
    test('User filters Pending T2 Review case, updates status to Pending Dealer Response, and Save & Submit exits case-view @P1 @Regression', async ({
        page,
        userHomeModule,
    }) => {
        // 1) Login and verify user-home landing.
        const loginModule = new LoginModule(page);
        const { username, password } = credentials('app');
        await loginModule.performLogin(username, password);
        expect(await loginModule.verifyLoggedIn()).toBe(true);

        // 2) Open My Created and filter by source status.
        await userHomeModule.openMyCreatedTab();
        await userHomeModule.filterByCaseStatus(SOURCE_STATUS);

        // 3) Open first matching case in a new tab.
        const initialTabCount = page.context().pages().length;
        const { caseViewPage, caseId } = await userHomeModule.openFirstCreatedCase();
        expect(page.context().pages().length).toBe(initialTabCount + 1);
        expect(caseViewPage.url()).toContain(`/tas/case-view?caseId=${caseId}`);

        // 4) Wait for case-view and perform status update + Save & Submit.
        const caseViewModule = new CaseViewModule(caseViewPage);
        await caseViewModule.waitForReady(caseId);

        const exitedCaseView = await caseViewModule.updateStatusAndSaveSubmit(TARGET_STATUS);
        expect(exitedCaseView).toBe(true);
    });
});
