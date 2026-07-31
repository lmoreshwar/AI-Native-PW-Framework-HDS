# Test Cases

## TC_E2E_002 - Unsuccessful Submission - Missing Primary Part and DTC

| Field | Details |
|---|---|
| Test Case ID | TC_E2E_002 |
| Title | Unsuccessful Submission - Missing Primary Part and DTC |
| Objective | Verify submission is blocked if the user completes the flow but fails to set a Primary Part and Primary DTC. |
| Preconditions | Application is accessible; Backend services are running. |
| Role | FTS (Non-CQS) |

### Steps and Expected Results

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in to the application using the provided URL and credentials. | User is successfully logged in and routed to the home dashboard. |
| 2 | Navigate to the menu option at the top left corner, click it, find EDER, select Detection, then click "Port Quality Report" to go to the PQR Create Landing Screen. Validate a Single VIN, and click "Create Draft PQR". | User is navigated to the PQR Create Main Screen. |
| 3 | On the Create Main screen, complete all mandatory fields in the Repair Information and Repair Details widgets. | All entered data is accepted. |
| 4 | Add a Part and a DTC to their respective data grids, but do NOT click "Set Primary" for either. | Part and DTC are added to the grids but neither is marked as primary. |
| 5 | Click the "Submit" button. | Submission is blocked. Error messages appear under the Part and DTC tables indicating no primary selection has been made. |

---

## TC_E2E_003 - Edge Case - Invalid VIN Routing Prevention

| Field | Details |
|---|---|
| Test Case ID | TC_E2E_003 |
| Title | Edge Case - Invalid VIN Routing Prevention |
| Objective | Verify the business flow cannot proceed to the Main Screen if the initial VIN validation fails. |
| Preconditions | Application is accessible; Backend services are running. |
| Role | FTC (Non-CQS) |

### Steps and Expected Results

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in to the application using the provided URL and credentials. | User is successfully logged in and routed to the home dashboard. |
| 2 | Navigate to the menu option at the top left corner, click it, find EDER, select Detection, then click "Port Quality Report" to go to the PQR Create Landing Screen. | "Single VIN" option is selected. |
| 3 | Enter an invalid VIN in the "VINs" field and click "Validate". | Vehicle Information section remains empty. An error message "The entered VIN# is not valid" is displayed. |
| 4 | Attempt to click the "Create Draft PQR" button. | The "Create Draft PQR" button remains disabled, preventing the user from proceeding to the Main Screen. |

---

## TC_E2E_004 - Successful Multi-VIN PQR Submission - Non-CQS User

| Field | Details |
|---|---|
| Test Case ID | TC_E2E_004 |
| Title | Successful Multi-VIN PQR Submission - Non-CQS User |
| Objective | Verify a standard Non-CQS user can successfully create, manage multiple VINs, and submit a PQR case. |
| Preconditions | Application is accessible; Backend services are running. |
| Role | FPE (Non-CQS) |

### Steps and Expected Results

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in to the application using the provided URL and credentials. | User is successfully logged in and routed to the home dashboard. |
| 2 | Navigate to the menu option at the top left corner, click it, find EDER, select Detection, then click "Port Quality Report" to go to the PQR Create Landing Screen. | The PQR Create Landing Screen is displayed. The "TOP WIDGET" (CQS responsibility question) is hidden. |
| 3 | Select the "Multiple VIN(s)" radio button option. | "Multiple VIN(s)" option is selected and the Multiple VIN data grid is displayed. |
| 4 | Enter a valid 17-character VIN in the "VINs" field and click "Add VIN". | The VIN is added to the Multiple VIN Data Grid with Action Button "Set Primary". |
| 5 | Enter a second valid 17-character VIN in the "VINs" field and click "Add VIN". | The second VIN is added to the Multiple VIN Data Grid. |
| 6 | Click "Set Primary" on one of the VIN rows in the Data Grid. | The row is marked as Primary VIN. The Vehicle Information section is populated based on this Primary VIN, and the "Create Draft PQR" button is enabled. |
| 7 | Click the "Create Draft PQR" button. | User is navigated to the PQR Create Main Screen. The Set VIN header is auto-populated with the Primary VIN details, and the VINs Widget displays the grid. |
| 8 | Complete all mandatory fields in the Repair Information and Repair Details widgets. | All entered data is accepted without validation errors. |
| 9 | Add a valid Part to the Part Number Information Widget and click "Set Primary". | Part is added to the data grid and successfully marked as the Primary Part. |
| 10 | Add a valid DTC to the DTC Information Widget and click "Set Primary". | DTC is added to the data grid and successfully marked as the Primary DTC. |
| 11 | Upload a valid attachment in the Attachments Widget. | Attachment is uploaded successfully and displayed in the list. |
| 12 | Click the "Submit" button in the Footer Actions. | A PQR Case Number is generated. A success message is displayed in the Case Management Center. The case is routed to the Initial Review step, associating all grid data. |

---

## TC_E2E_005 - Unsuccessful Draft Creation - Missing Primary VIN

| Field | Details |
|---|---|
| Test Case ID | TC_E2E_005 |
| Title | Unsuccessful Draft Creation - Missing Primary VIN |
| Objective | Verify the business flow prevents proceeding to the Main Screen if multiple VINs are added but no Primary VIN is set. |
| Preconditions | Application is accessible; Backend services are running. |
| Role | FTS (Non-CQS) |

### Steps and Expected Results

| Step | Action | Expected Result |
|---|---|---|
| 1 | Log in to the application using the provided URL and credentials. | User is successfully logged in and routed to the home dashboard. |
| 2 | Navigate to the menu option at the top left corner, click it, find EDER, select Detection, then click "Port Quality Report" to go to the PQR Create Landing Screen. | User Navigated to Create Landing screen. |
| 3 | Select Multi VIN option and enter multiple valid VINs and click "Add VIN" for each. | VINs are added to the Data Grid. |
| 4 | Do NOT click "Set Primary" for any row, and click the "Create Draft PQR" button. | User remains on the Landing Screen. An error message "Please set Primary VIN" is displayed. |