import { test, expect } from '../fixtures';
import { credentials } from '../config';
import { TIMEOUTS } from '../utils';
import testData from '../testdata/testData.json';

test.describe('PQR Create & Validation Flows @P1 @Regression', () => {
    test('Non-CQS user creates and submits a Single VIN PQR successfully @P1 @Regression', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;

        const pqrCreds = credentials('pqr');
        await pqrModule.loginToPqr(pqr.landingUrl, pqrCreds.username, pqrCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);
        expect(await pqrModule.isCqsWidgetHidden(), 'CQS top widget should be hidden for this non-CQS user').toBe(true);

        await pqrModule.selectSingleVin();
        await pqrModule.enterVinAndValidate(pqr.vin);
        expect(await pqrModule.verifyVehicleInformation(pqr.expectedVehicle), 'Validated VIN should show expected vehicle details').toBe(true);

        await pqrModule.createDraftPqr();
        await pqrModule.fillRepairInformation(pqr.repairInformation);

        const partPrimary = await pqrModule.addPrimaryPart(pqr.partNumberInformation, 'Yes');
        expect(partPrimary, 'Part row should be added and marked as primary').toBe(true);

        const dtcPrimary = await pqrModule.addPrimaryDtc(pqr.dtcInformation.dtcCode);
        expect(dtcPrimary, 'DTC row should be added and marked as primary').toBe(true);

        // Attachments are intentionally deferred for this release.
        await pqrModule.fillRepairDetails(pqr.repairDetails);

        const submitResult = await pqrModule.submitPqr();
        expect(submitResult.successVisible, 'Submission success state should be visible').toBe(true);
        expect(submitResult.caseNumber, 'A submitted PQR case number should be generated').toMatch(/^PQR\d+/i);
    });

    test('Invalid VIN is rejected and PQR routing is prevented @P1 @Regression', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;

        const pqrCreds = credentials('pqr');
        await pqrModule.loginToPqr(pqr.landingUrl, pqrCreds.username, pqrCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);

        await pqrModule.selectSingleVin();
        const result = await pqrModule.validateVinExpectingError(pqr.invalidVin);

        expect(result.errorVisible, 'An "Invalid VIN" error should be shown for a non-existent VIN').toBe(true);
        expect(result.vehicleInfoEmpty, 'Vehicle Information should not populate for an invalid VIN').toBe(true);
        expect(await pqrModule.isCreateDraftPqrAvailable(), 'Create Draft PQR must not be available after an invalid VIN').toBe(false);
    });

    test('Non-CQS user creates and submits a Multi-VIN PQR successfully @P1 @Regression', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;
        const multi = pqr.multiVin;

        const pqrCreds = credentials('pqr');
        await pqrModule.loginToPqr(pqr.landingUrl, pqrCreds.username, pqrCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);
        expect(await pqrModule.isCqsWidgetHidden(), 'CQS top widget should be hidden for this non-CQS user').toBe(true);

        await pqrModule.selectMultipleVin();
        expect(await pqrModule.addVin(multi.primaryVin), 'Primary VIN should be added to the grid').toBe(true);
        expect(await pqrModule.addVin(multi.secondVin), 'Second VIN should be added to the grid').toBe(true);
        expect(await pqrModule.setPrimaryVin(multi.primaryVin), 'One VIN should be markable as primary').toBe(true);
        expect(await pqrModule.verifyVehicleInformation(multi.expectedVehicle), 'Primary VIN should show expected vehicle details').toBe(true);

        await pqrModule.createDraftPqr();
        await pqrModule.fillRepairInformation(pqr.repairInformation);

        expect(await pqrModule.addPrimaryPart(pqr.partNumberInformation, 'Yes'), 'Part row should be added and marked as primary').toBe(true);
        expect(await pqrModule.addPrimaryDtc(pqr.dtcInformation.dtcCode), 'DTC row should be added and marked as primary').toBe(true);

        await pqrModule.fillRepairDetails(pqr.repairDetails);
        expect(await pqrModule.uploadAttachment(pqr.attachment), 'Uploaded attachment should be listed in the Attachments widget').toBe(true);

        const submitResult = await pqrModule.submitPqr();
        expect(submitResult.successVisible, 'Submission success state should be visible').toBe(true);
        expect(submitResult.caseNumber, 'A submitted PQR case number should be generated').toMatch(/^PQR\d+/i);
    });

    test('Multi-VIN without a primary VIN cannot create a draft PQR @P1 @Regression', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;
        const multi = pqr.multiVin;

        const pqrCreds = credentials('pqr');
        await pqrModule.loginToPqr(pqr.landingUrl, pqrCreds.username, pqrCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);

        await pqrModule.selectMultipleVin();
        expect(await pqrModule.addVin(multi.primaryVin), 'First VIN should be added to the grid').toBe(true);
        expect(await pqrModule.addVin(multi.secondVin), 'Second VIN should be added to the grid').toBe(true);

        // No primary VIN is set — the Create Draft PQR button is only rendered/enabled after
        // a primary is chosen, so routing to draft creation must remain blocked.
        expect(await pqrModule.isCreateDraftPqrAvailable(), 'Create Draft PQR must not be available without a primary VIN').toBe(false);
    });

    test('Single VIN PQR without a primary Part and DTC is blocked on submit @P2 @Regression @Negative', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;

        const pqrCreds = credentials('pqr');
        await pqrModule.loginToPqr(pqr.landingUrl, pqrCreds.username, pqrCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);

        await pqrModule.selectSingleVin();
        await pqrModule.enterVinAndValidate(pqr.vin);
        expect(await pqrModule.verifyVehicleInformation(pqr.expectedVehicle), 'Validated VIN should show expected vehicle details').toBe(true);

        await pqrModule.createDraftPqr();
        await pqrModule.fillRepairInformation(pqr.repairInformation);

        // Add a Part and a DTC to their grids but do NOT set either as primary.
        expect(await pqrModule.addPart(pqr.partNumberInformation, 'Yes'), 'Part row should be added to the grid').toBe(true);
        expect(await pqrModule.addDtc(pqr.dtcInformation.dtcCode), 'DTC row should be added to the grid').toBe(true);

        await pqrModule.fillRepairDetails(pqr.repairDetails);

        const result = await pqrModule.submitExpectingMissingPrimaryErrors();
        expect(result.blocked, 'Submission must be blocked when no primary Part/DTC is set').toBe(true);
        expect(result.errorCount, 'A primary-required error should appear under both the Part and DTC tables').toBeGreaterThanOrEqual(2);
        expect(result.errorMessages.join(' | '), 'Errors should state a primary row is required').toMatch(/required to have a primary row/i);
    });

    // TC_E2E_011 — TCI Port, Multi-VIN, No Auto-Assign Dispatcher.
    // The submission confirmation is generic ("forwarded to the next step in the workflow")
    // and does not expose the routing step, so — like the Non-CQS submit tests — this
    // asserts the reliably-visible UI outcome (case number generated + success). The
    // specific "TCI PQ Analyst Review" routing is a backend state verified from the Case
    // Management Center, out of this test's UI scope.
    test('TCI Port user creates and submits a Multi-VIN PQR successfully (No Auto-Assign) @P1 @Regression @TCI', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;
        const multi = pqr.multiVin;

        const tciCreds = credentials('pqr-tci');
        await pqrModule.loginToPqr(pqr.landingUrl, tciCreds.username, tciCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);
        expect(await pqrModule.isCqsWidgetHidden(), 'CQS top widget should be hidden for a TCI Port user').toBe(true);

        await pqrModule.selectMultipleVin();
        expect(await pqrModule.addVin(multi.primaryVin), 'Primary VIN should be added to the grid').toBe(true);
        expect(await pqrModule.addVin(multi.secondVin), 'Second VIN should be added to the grid').toBe(true);
        expect(await pqrModule.setPrimaryVin(multi.primaryVin), 'One VIN should be markable as primary').toBe(true);
        expect(await pqrModule.verifyVehicleInformation(multi.expectedVehicle), 'Primary VIN should show expected vehicle details').toBe(true);

        await pqrModule.createDraftPqr();
        await pqrModule.fillRepairInformation(pqr.repairInformation);

        expect(await pqrModule.addPrimaryPart(pqr.partNumberInformation, 'Yes'), 'Part row should be added and marked as primary').toBe(true);
        expect(await pqrModule.addPrimaryDtc(pqr.dtcInformation.dtcCode), 'DTC row should be added and marked as primary').toBe(true);

        await pqrModule.fillRepairDetails(pqr.repairDetails);

        const submitResult = await pqrModule.submitPqr();
        expect(submitResult.successVisible, 'Submission success state should be visible').toBe(true);
        expect(submitResult.caseNumber, 'A submitted PQR case number should be generated').toMatch(/^PQR\d+/i);
    });

    // TC_E2E_012 — TCI Port, Multi-VIN, Translation Review.
    // Gated: the submission confirmation is generic and does NOT expose the routing step,
    // so "Translation Review" routing can only be confirmed from the Case Management Center
    // case detail. It also requires a TCI account whose language preference is Spanish or
    // French. Enable once a Spanish/French TCI credential and a case-detail routing-step
    // locator are available (see conversation notes).
    test.fixme('TCI Port Multi-VIN submission routes to Translation Review @P2 @Regression @TCI', async () => {
        // Pending: Spanish/French TCI credential + Case Management Center routing-step verification.
    });

    // TC_E2E_013 — TCI Port, Multi-VIN, Missing Primary VIN blocks draft creation.
    test('TCI Port Multi-VIN without a primary VIN cannot create a draft PQR @P1 @Regression @TCI @Negative', async ({ pqrModule }) => {
        test.setTimeout(TIMEOUTS.TEST_LONG);
        const pqr = testData.PQR;
        const multi = pqr.multiVin;

        const tciCreds = credentials('pqr-tci');
        await pqrModule.loginToPqr(pqr.landingUrl, tciCreds.username, tciCreds.password);

        expect(await pqrModule.verifyLandingDisplayed(), 'PQR landing screen should be visible').toBe(true);

        await pqrModule.selectMultipleVin();
        expect(await pqrModule.addVin(multi.primaryVin), 'First VIN should be added to the grid').toBe(true);
        expect(await pqrModule.addVin(multi.secondVin), 'Second VIN should be added to the grid').toBe(true);

        // No primary VIN is set — the Create Draft PQR button is only rendered/enabled after
        // a primary is chosen, so routing to draft creation must remain blocked for TCI too.
        expect(await pqrModule.isCreateDraftPqrAvailable(), 'Create Draft PQR must not be available without a primary VIN').toBe(false);
    });
});

