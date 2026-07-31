import { test, expect } from '../fixtures';
import { FTRModule, type FtrEnteredRepairInfo, type FtrRepairDetailsData } from '../modules/FTRModule';
import { FtrCaseViewModule } from '../modules/FtrCaseViewModule';
import { UserHomeModule } from '../modules/UserHomeModule';
import { credentials } from '../config';
import { TIMEOUTS, isVisualEnabled } from '../utils';
import { sauceVisualCheck } from '@saucelabs/visual-playwright';
import testData from '../testdata/testData.json';

/**
 * FTR Case View Verification
 *
 * Prerequisite: a freshly created + submitted FTR case. This spec runs that flow
 * first (reusing FTRModule), capturing the generated FTR number and the dynamic
 * values actually entered, then opens the case from the "My Created" grid and
 * verifies every persisted value on the read-only generic-view-case page.
 */
test.describe('FTR Case View Verification @P1 @Regression', () => {
    test('Created FTR case shows all submitted information in the case view @P1 @Regression', async ({ page }, testInfo) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const ftr = testData.FTR;
        const ftrModule = new FTRModule(page);

        let ftrNumber = '';
        let enteredRepairInfo: FtrEnteredRepairInfo;
        let repairDetails: FtrRepairDetailsData;

        await test.step('Create and submit a new FTR case', async () => {
            const ftrCreds = credentials('ftr');
            await ftrModule.loginToFtr(ftr.landingUrl, ftrCreds.username, ftrCreds.password);
            expect(await ftrModule.verifyLandingDisplayed()).toBe(true);

            await ftrModule.enterVinAndValidate(ftr.vin);
            await ftrModule.verifyVehicleInformation(ftr.expectedVehicle).catch(() => null);

            await ftrModule.selectExistingTasCaseAndCreateDraft('No');
            enteredRepairInfo = await ftrModule.fillRepairInformation(ftr.repairInformation);

            expect(await ftrModule.addPrimaryDtc(ftr.dtcInformation.dtcCode)).toBe(true);

            const partResult = await ftrModule.runPartNumberInformationFlow(ftr.partNumberInformation);
            expect(partResult.rowAddedVisible).toBe(true);
            await ftrModule.finalizePartNumberForSubmission(ftr.partNumberInformation.partNumber, 'Yes');

            repairDetails = ftrModule.buildRandomRepairDetails();
            await ftrModule.fillRepairDetails(repairDetails);

            const submit = await ftrModule.submitFtr();
            expect(submit.successVisible).toBe(true);
            expect(submit.reportNumber).toMatch(/^FTR\d+/i);
            expect(submit.isDraft).toBe(false);
            ftrNumber = submit.reportNumber;
        });

        const caseViewPage = await test.step('Open the created case from My Created in a new tab', async () => {
            const userHomeModule = new UserHomeModule(page);
            await page.goto(`${testData.urls.baseUrl}${testData.urls.homeUrl}`, { waitUntil: 'domcontentloaded' });
            await userHomeModule.searchMyCreatedByCaseId(ftrNumber);
            return userHomeModule.openGenericCaseInNewTab(ftrNumber);
        });

        const caseView = new FtrCaseViewModule(caseViewPage);
        await caseView.waitForReady(ftrNumber);

        await test.step('Verify the case header', async () => {
            const header = await caseView.getHeader();
            expect(header.caseNumber).toBe(ftrNumber);
            expect(header.caseType).toBe(testData.FTR.caseType);
            expect(header.status.length).toBeGreaterThan(0);
        });

        await test.step('Verify the Case Properties (vehicle) values', async () => {
            const props = testData.FTR.expectedCaseProperties;
            expect(await caseView.getCaseProperty('Division')).toBe(ftr.expectedVehicle.division);
            expect(await caseView.getCaseProperty('Model')).toBe(ftr.expectedVehicle.model);
            expect(await caseView.getCaseProperty('Model Year')).toBe(ftr.expectedVehicle.modelYear);
            expect(await caseView.getCaseProperty('VIN')).toBe(ftr.expectedVehicle.vin);
            expect(await caseView.getCaseProperty('Production Date')).toBe(props.productionDate);
            expect(await caseView.getCaseProperty('Vehicle Plant')).toBe(props.vehiclePlant);
            expect(await caseView.getCaseProperty('Engine Plant')).toBe(props.enginePlant);
            expect(await caseView.getCaseProperty('SMS Code')).toBe(props.smsCode);
            expect(await caseView.getCaseProperty('Engine Type')).toBe(props.engineType);
            expect(await caseView.getCaseProperty('Transmission Type')).toBe(props.transmissionType);
        });

        await test.step('Verify the entered Repair Information values', async () => {
            expect(await caseView.getRepairInfoValue('Repair Order #')).toBe(enteredRepairInfo.repairOrder);
            expect(await caseView.getRepairInfoValue('Odometer')).toBe(enteredRepairInfo.odometer);
            expect(await caseView.getRepairInfoValue('Title')).toBe(enteredRepairInfo.title);
            expect((await caseView.getRepairInfoValue('Repair Date')).length).toBeGreaterThan(0);

            for (const radio of enteredRepairInfo.radioSelections) {
                expect(
                    await caseView.isRepairRadioChecked(radio.groupLabel, radio.option),
                    `Repair Information radio "${radio.groupLabel}" should be "${radio.option}"`,
                ).toBe(true);
            }

            // Only the cascading category dropdowns are displayed on the case view (Problem Area is not).
            const shownDropdowns = ['Service Category', 'Section', 'Sub Component', 'Condition'];
            for (const { label, value } of enteredRepairInfo.dropdownSelections) {
                if (!shownDropdowns.includes(label)) {
                    continue;
                }
                expect(
                    await caseView.getRepairComboboxValue(label),
                    `Repair Information dropdown "${label}" should show "${value}"`,
                ).toContain(value);
            }
        });

        await test.step('Verify the DTC, Part Number and Repair Details values', async () => {
            const dtcRow = await caseView.getDtcRowText(ftr.dtcInformation.dtcCode);
            expect(dtcRow).toContain(ftr.dtcInformation.dtcCode);
            expect(dtcRow).toMatch(/yes/i);

            const part = ftr.partNumberInformation;
            const partRow = await caseView.getPartRowText(part.partNumber);
            expect(partRow).toContain(part.partNumber);
            expect(partRow).toContain(part.serialDate);
            expect(partRow).toContain(part.quantity);
            expect(partRow).toMatch(/yes/i);
            expect(await caseView.isPartShipQuestionYes()).toBe(true);

            expect(await caseView.getRepairDetail('Condition Description')).toBe(repairDetails.conditionDescription);
            expect(await caseView.getRepairDetail('Repair Process')).toBe(repairDetails.repairProcess);
            const diagnosticToken = /ref (\d+)/.exec(repairDetails.diagnosticSteps)?.[0] ?? repairDetails.diagnosticSteps;
            expect(await caseView.getRepairDetail('Diagnostic Steps')).toContain(diagnosticToken);
        });

        await test.step('Capture Sauce Visual snapshot of the case view', async () => {
            // Release the page's inner scroll container + grow the viewport so the whole case
            // view (down to Repair Details / Attachments) is captured — native fullPage alone
            // clips it at Repair Information.
            await caseView.prepareFullPageCapture();

            test.skip(!isVisualEnabled(), 'Sauce Visual not enabled (set VISUAL=1 + SAUCE_USERNAME/SAUCE_ACCESS_KEY)');

            // Mask the run-to-run dynamic data (Case # / Status header + randomised Repair
            // Information / Repair Details sections) so visual diffs flag only real UI changes.
            const ignoreRegions = await caseView.getDynamicVisualIgnoreRegions();
            await sauceVisualCheck(caseViewPage, testInfo, 'FTR Case View - Full Page', {
                captureDom: true,
                screenshotOptions: { fullPage: true },
                ignoreRegions,
            });
        });
    });
});
