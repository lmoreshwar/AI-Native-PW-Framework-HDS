import { test, expect } from '../fixtures';
import { LoginModule } from '../modules/LoginModule';
import { CaseSearchPage } from '../pages/CaseSearchPage';
import { credentials } from '../config';
import testData from '../testdata/testData.json';

test.describe('TAS Case Search Workflow @P1 @Regression', () => {
    test('User can search TAS case ID from user home and open case view in a new tab @P1 @Regression', async ({
        page,
        userHomeModule,
    }) => {
        const tasCase = testData.tasCaseIds[0];

        const loginModule = new LoginModule(page);
        const { username, password } = credentials('app');
        await loginModule.performLogin(username, password);

        const isLoggedIn = await loginModule.verifyLoggedIn();
        expect(isLoggedIn).toBe(true);

        await userHomeModule.searchCaseById(tasCase.caseId);

        const caseVisibleInResults = await userHomeModule.verifyCaseInResults(tasCase.caseId);
        expect(caseVisibleInResults).toBe(true);

        const initialTabCount = page.context().pages().length;
        const caseViewPage = await userHomeModule.clickCaseLink(tasCase.caseId);

        expect(page.context().pages().length).toBe(initialTabCount + 1);
        expect(caseViewPage.url()).toContain(`/tas/case-view?caseId=${tasCase.caseId}`);

        const caseSearchPage = new CaseSearchPage(caseViewPage);
        await caseSearchPage.waitForPageLoad(tasCase.caseId);

        const caseViewTab = await caseSearchPage.getCaseViewTab();
        const caseInformationRegion = await caseSearchPage.getCaseInformationRegion();
        const caseIdValue = await caseSearchPage.getCaseIdValue(tasCase.caseId);

        expect(await caseViewTab.isVisible()).toBe(true);
        expect(await caseInformationRegion.isVisible()).toBe(true);
        expect(await caseIdValue.isVisible()).toBe(true);
    });
});