import { test, expect } from '../fixtures';
import { FTRModule } from '../modules/FTRModule';
import { credentials } from '../config';
import testData from '../testdata/testData.json';

test.describe('FTR VIN Validation @P0 @Smoke', () => {
    test('User logs in to FTR, opens Create Field Technical Report, validates a VIN, and sees vehicle information @P0 @Smoke', async ({
        page,
    }) => {
        const ftr = testData.FTR;

        const ftrModule = new FTRModule(page);

        // 1. Log in to the FTR application and land on the Create FTR page.
        const ftrCreds = credentials('ftr');
        await ftrModule.loginToFtr(ftr.landingUrl, ftrCreds.username, ftrCreds.password);

        // 2. Verify the Create Field Technical Report landing page is displayed.
        const landingDisplayed = await ftrModule.verifyLandingDisplayed();
        expect(landingDisplayed).toBe(true);

        // 3. Enter the VIN and click Validate.
        await ftrModule.enterVinAndValidate(ftr.vin);

        // 4. Verify Division, Model, Model Year, and VIN are displayed.
        const vehicleInfoVerified = await ftrModule.verifyVehicleInformation(ftr.expectedVehicle);
        expect(vehicleInfoVerified).toBe(true);
    });
});
