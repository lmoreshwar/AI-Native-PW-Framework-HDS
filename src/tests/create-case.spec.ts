import { test, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { LoginModule } from '../modules/LoginModule';
import { credentials } from '../config';
import { TIMEOUTS, isVisualEnabled } from '../utils';
import { sauceVisualCheck } from '@saucelabs/visual-playwright';
import {
    TASModule,
    CaseDetailsData,
    DiagnosticInformationData,
    GeneralInformationData,
    AssignDealerData,
} from '../modules/TASModule';

// Load test data from simple JSON file
import testData from '../testdata/testData.json';

async function loginAndOpenTAS(page: Page) {
    const loginModule = new LoginModule(page);
    const { username, password } = credentials('app');
    await loginModule.performLogin(username, password);
    const loggedIn = await loginModule.verifyLoggedIn();

    const tasModule = new TASModule(page);
    await tasModule.openHamburgerMenu();
    await tasModule.navigateToTAS();

    return { loginModule, tasModule, loggedIn };
}

test.describe('Create Case Workflow @P0 @Smoke', () => {
    test('Corporate/Dealer create-case flow follows user-type assignment branch and submits successfully', async ({ page }, testInfo) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const user = testData.corporateUsers[0] as { userType: string };
        const vin = testData.vins[0] as { vin: string };
        const assign = testData.createCaseFlow.assign as AssignDealerData;
        const caseDetails = testData.createCaseFlow.caseDetails as CaseDetailsData;

        const generalInformation: GeneralInformationData = {
            vin: vin.vin,
            repairOrder: `${testData.createCaseFlow.generalInformation.repairOrderPrefix}${Date.now().toString().slice(-6)}`,
            odometer: testData.createCaseFlow.generalInformation.odometer,
            directContact: testData.createCaseFlow.generalInformation.directContact,
            customerType: testData.createCaseFlow.generalInformation.customerType,
        };

        const { tasModule, loggedIn } = await loginAndOpenTAS(page);
        expect(loggedIn).toBe(true);

        // Enter VIN on TAS Home BEFORE clicking the Create a TAS Case tab
        await tasModule.enterVIN(generalInformation.vin);

        const createCaseTabVisible = await tasModule.verifyCreateCaseTabVisible();
        expect(createCaseTabVisible).toBe(true);

        // Click tab → navigates to /tas/case-setup with VIN pre-populated
        await tasModule.openCreateCaseTab();
        const generalInfoVisible = await tasModule.verifyGeneralInfoPageDisplayed();
        expect(generalInfoVisible).toBe(true);

        if (user.userType.toLowerCase().includes('corporate')) {
            await tasModule.completeAssignDealerFlow(assign);
        }

        await tasModule.completeGeneralInformation(generalInformation);
        // Capture the run-to-run dynamic date now so the Review snapshot can mask it by value.
        const enteredRepairOrderDate = await tasModule.getEnteredRepairOrderDate();

        // Visual checks are additive + opt-in. Each step is a no-op when VISUAL is off, so the
        // functional flow continues unaffected. NOTE: we use `if (!isVisualEnabled()) return`
        // (not `test.skip`) because these snapshots are interleaved mid-wizard — `test.skip`
        // would abort the remaining functional steps.
        await test.step('Capture Sauce Visual snapshot of the General Information screen', async () => {
            if (!isVisualEnabled()) {
                return;
            }
            // STANDARD full-capture: release inner scrollers + grow the viewport so the whole
            // (scrollable) screen is captured and mask coordinates line up, then restore.
            await tasModule.prepareFullPageCapture();
            const ignoreRegions = await tasModule.getGeneralInformationVisualIgnoreRegions(generalInformation.vin);
            await sauceVisualCheck(page, testInfo, 'TAS Create Case - General Information', {
                captureDom: false,
                screenshotOptions: { fullPage: true },
                ignoreRegions,
            });
            await tasModule.restoreAfterFullPageCapture();
        });

        await tasModule.continueFromGeneralInformation();

        await tasModule.fillCaseDetails(caseDetails);
        await test.step('Capture Sauce Visual snapshot of the Case Details screen', async () => {
            if (!isVisualEnabled()) {
                return;
            }
            // STANDARD full-capture (no masks — all Case Details values are static test data).
            await tasModule.prepareFullPageCapture();
            await sauceVisualCheck(page, testInfo, 'TAS Create Case - Case Details', {
                captureDom: false,
                screenshotOptions: { fullPage: true },
            });
            await tasModule.restoreAfterFullPageCapture();
        });
        await tasModule.continueFromCaseDetails();

        const diagnosticInfo: DiagnosticInformationData = {
            description: testData.createCaseFlow.diagnosticInformation.description,
            dtcCodes: testData.createCaseFlow.diagnosticInformation.dtcCodes,
        };
        const diagnosticResult = await tasModule.fillDiagnosticInformation(diagnosticInfo);
        // A DTC was selected and moved to Primary DTC (no format assumptions on the code)
        expect(diagnosticResult.primaryDTC).toBeTruthy();

        await test.step('Capture Sauce Visual snapshot of the Diagnostic Information screen', async () => {
            if (!isVisualEnabled()) {
                return;
            }
            // STANDARD full-capture, then mask the live/randomised DTC panels; the Description
            // field + layout stay compared.
            await tasModule.prepareFullPageCapture();
            const ignoreRegions = await tasModule.getDiagnosticVisualIgnoreRegions(generalInformation.vin);
            await sauceVisualCheck(page, testInfo, 'TAS Create Case - Diagnostic Information', {
                captureDom: false,
                screenshotOptions: { fullPage: true },
                ignoreRegions,
            });
            await tasModule.restoreAfterFullPageCapture();
        });
        await tasModule.continueToReviewFromDiagnostic();

        // Preview / Review page must surface what we just submitted
        await tasModule.verifyDiagnosticInformationOnReview(diagnosticResult);

        await test.step('Capture Sauce Visual snapshot of the Review screen', async () => {
            if (!isVisualEnabled()) {
                return;
            }
            // STANDARD full-capture for the (tall) Review screen, then mask only the run-to-run
            // dynamic values by their text.
            await tasModule.prepareFullPageCapture();
            const ignoreRegions = await tasModule.getReviewVisualIgnoreRegions([
                generalInformation.repairOrder,
                enteredRepairOrderDate,
                diagnosticResult.primaryDTC,
            ]);
            await sauceVisualCheck(page, testInfo, 'TAS Create Case - Review', {
                captureDom: false,
                screenshotOptions: { fullPage: true },
                ignoreRegions,
            });
            await tasModule.restoreAfterFullPageCapture();
        });

        const caseId = await tasModule.submitCaseAndGetCaseId();
        expect(caseId).toMatch(/^TA\d+$/i);

        await tasModule.openSubmittedCaseAndVerify(caseId);
    });
});


