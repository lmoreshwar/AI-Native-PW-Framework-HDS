import { test, expect } from '../fixtures';
import { FTRModule } from '../modules/FTRModule';
import { credentials } from '../config';
import { TIMEOUTS } from '../utils';
import testData from '../testdata/testData.json';

test.describe('FTR Create Submit Flow @P1 @Regression', () => {
    test('User validates VIN, completes all FTR sections, submits, and a report number is generated @P1 @Regression', async ({ page }) => {
        // Long SSO-driven E2E: login + validate + draft + repair info + DTC + part + repair details + submit.
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const ftr = testData.FTR;

        const ftrModule = new FTRModule(page);

        const ftrCreds = credentials('ftr');
        await ftrModule.loginToFtr(ftr.landingUrl, ftrCreds.username, ftrCreds.password);

        const landingDisplayed = await ftrModule.verifyLandingDisplayed();
        expect(landingDisplayed).toBe(true);

        await ftrModule.enterVinAndValidate(ftr.vin);
        await ftrModule.verifyVehicleInformation(ftr.expectedVehicle).catch(() => null);

        await ftrModule.selectExistingTasCaseAndCreateDraft('No');
        await ftrModule.fillRepairInformation(ftr.repairInformation);

        // Keep a primary DTC for submission (runDtcInformationFlow deletes it as part of its CRUD check).
        const dtcPrimary = await ftrModule.addPrimaryDtc(ftr.dtcInformation.dtcCode);
        expect(dtcPrimary, 'A primary DTC should be added and retained for submission').toBe(true);

        const partResult = await ftrModule.runPartNumberInformationFlow(ftr.partNumberInformation);
        expect(partResult.rowAddedVisible, 'Part Number row should be added to the table').toBe(true);

        // Submission also requires answering the parts-shipping question and marking a primary part row.
        await ftrModule.finalizePartNumberForSubmission(ftr.partNumberInformation.partNumber, 'Yes');

        await ftrModule.fillRepairDetails(ftrModule.buildRandomRepairDetails());

        const submitResult = await ftrModule.submitFtr();
        expect(submitResult.successVisible, 'Submission confirmation banner should be visible').toBe(true);
        expect(submitResult.reportNumber, 'A Field Technical Report number should be generated').toMatch(/^FTR\d+/i);
        expect(submitResult.isDraft, 'Submitted FTR should not be a draft record').toBe(false);
    });
});
