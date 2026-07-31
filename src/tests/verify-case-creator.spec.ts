import { test, expect } from '../fixtures';
import { LoginModule } from '../modules/LoginModule';
import { CaseViewModule } from '../modules/CaseViewModule';
import { credentials } from '../config';
import testData from '../testdata/testData.json';

test.describe('TAS Verify Case Creator Workflow @P1 @Regression', () => {
    test('User opens their first created case and verifies the Creator name @P1 @Regression', async ({
        page,
        userHomeModule,
    }) => {
        const user = testData.corporateUsers[0];
        const expectedCreator: string = user.creatorName;

        // 1. Login and confirm we landed on the user home page.
        const loginModule = new LoginModule(page);
        const { username, password } = credentials('app');
        await loginModule.performLogin(username, password);

        const isLoggedIn = await loginModule.verifyLoggedIn();
        expect(isLoggedIn).toBe(true);

        // 2. Switch to the "My Created" tab and wait for cases to load.
        await userHomeModule.openMyCreatedTab();

        // 3. Open the FIRST created case — it launches in a new tab.
        const initialTabCount = page.context().pages().length;
        const { caseViewPage, caseId } = await userHomeModule.openFirstCreatedCase();

        expect(page.context().pages().length).toBe(initialTabCount + 1);
        expect(caseViewPage.url()).toContain(`/tas/case-view?caseId=${caseId}`);

        // 4. On the case-view tab, expand Details and read the Creator name.
        const caseViewModule = new CaseViewModule(caseViewPage);
        await caseViewModule.waitForReady(caseId);
        await caseViewModule.expandDetails();

        const actualCreator = await caseViewModule.getCreatorName();

        // 5. Verify the Creator matches the expected name (case-insensitive,
        //    substring match — no assumptions about exact formatting).
        expect(actualCreator.toLowerCase()).toContain(expectedCreator.toLowerCase());
    });
});
