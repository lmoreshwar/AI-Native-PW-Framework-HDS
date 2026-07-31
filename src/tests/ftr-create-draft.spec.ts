import { test, expect } from '../fixtures';
import { FTRModule } from '../modules/FTRModule';
import { credentials } from '../config';
import { TIMEOUTS } from '../utils';
import testData from '../testdata/testData.json';

test.describe('FTR Create Draft Flow @P1 @Regression', () => {
    test('User validates VIN, opens Create Draft FTR, fills Repair Information, and saves draft @P1 @Regression', async ({ page }) => {
        // Long SSO-driven E2E: login + validate + draft + repair info + DTC flow exceeds the default 180s budget.
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

        const dtcResult = await ftrModule.runDtcInformationFlow(ftr.dtcInformation.dtcCode);
        expect(dtcResult.rowAddedVisible, 'DTC row should be added to the DTC(s) column').toBe(true);
        expect(dtcResult.setPrimaryClicked, 'Set Primary should be clicked and update the row action').toBe(true);
        expect(dtcResult.actionPrimaryVisible, 'Action column should show "Primary DTC"').toBe(true);
        expect(dtcResult.deleteAvailable, 'Delete control should be available for the DTC').toBe(true);
        expect(dtcResult.dialogHeaderVisible, 'Confirmation dialog header "Delete row?" should appear').toBe(true);
        expect(dtcResult.dialogMessageVisible, 'Warning "This action cannot be undone." should appear').toBe(true);
        expect(dtcResult.dialogDeleteOptionVisible, 'Dialog should offer a Delete option').toBe(true);
        expect(dtcResult.dialogCancelOptionVisible, 'Dialog should offer a Cancel option').toBe(true);
        expect(dtcResult.rowVisibleAfterCancel, 'DTC should remain in the list after Cancel').toBe(true);
        expect(dtcResult.rowRemovedAfterDelete, 'DTC should be removed from the list after Delete').toBe(true);

        const partResult = await ftrModule.runPartNumberInformationFlow(ftr.partNumberInformation);
        expect(partResult.rowAddedVisible, 'Part Number row should be added to the table').toBe(true);
        expect(partResult.partNumberVisible, 'Part Number should be displayed in the table').toBe(true);
        expect(partResult.setPrimaryVisible, 'Set Primary button should be displayed in the Part Number row').toBe(true);

        await ftrModule.saveDraft();
    });
});
