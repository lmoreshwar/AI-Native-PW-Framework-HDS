# 📖 Agile User Stories & Acceptance Criteria

**Purpose:** Use this file if you prefer to write test scenarios in plain, high-level English
rather than strict test cases. The AI Agent interprets these into automated Playwright tests
for the **TAS** and **FTR** applications.

> Application under test: `https://app.example.com`

---

## 📝 Example Format

### Epic: TAS Case Management

**User Story 1: Search and Open a Case**
*As a Corporate User, when I navigate to Case Management, I should be able to search for a case
by Case ID, VIN, or dealer code and open it to view full details.*

**Acceptance Criteria (Please automate these):**
1. Sign in via SSO as a Corporate User (`dealerCode = CORP001`).
2. Navigate to `/tas/case-management`.
3. Search by Case ID `TA241500045`. Verify exactly one matching case is returned.
4. Open the case and verify the dealer name is `LEXUS OF TAMPA BAY` and status is `Pending Closure`.
5. **Scenario A (Search by VIN):** Search by VIN `4T1BF1AK5CU123456`. Verify cases for that VIN are listed.
6. **Scenario B (Filter by Status):** Apply the status filter `Pending Closure` and verify all visible rows show that status and the result count matches the rows displayed.

---

### Epic: TAS Case Lifecycle

**User Story 2: Create a Technical Case**
*As a Corporate User, I want to create a new Technical case against a valid VIN so the dealer's
issue is tracked end to end.*

**Acceptance Criteria:**
1. Navigate to `/tas/case-setup`.
2. Select case type `Technical`.
3. Enter VIN `58AD11D19MU001187` and validate — verify the vehicle resolves to `2021 Lexus ES 250`.
4. Select category `Powertrain` and customer type `Service Manager`.
5. Submit the case and verify a new Case ID is generated and the case opens.

**User Story 3: Update Case Status (Save then Submit)**
*As a Corporate User, I want to change a case status, save it, then submit it so the case progresses correctly.*

**Acceptance Criteria:**
1. Open case `TA241500045`.
2. Change the status to `Pending Closure` and click **Save** — verify the change persists as a draft.
3. Click **Submit** — verify a confirmation is shown and the status is updated.

**User Story 4: Watch a Case**
*As a user, I want to add a case to my watch list so I'm notified of updates.*

**Acceptance Criteria:**
1. Open case `TA241500045`.
2. Click **Watch** and verify the case shows as watched for the current user.

---

### Epic: Field Technical Report (FTR)

**User Story 5: Validate a VIN on the FTR Landing Page**
*As a Field Engineer, when I open Create Field Technical Report and enter a VIN, I should see the
correct vehicle information so I report against the right vehicle.*

**Acceptance Criteria:**
1. Sign in via SSO and open the Create Field Technical Report page.
2. Enter VIN `58AD11D19MU001187` and click **Validate**.
3. Verify the Vehicle Information section shows: Division, Model `ES 250`, Model Year `2021 Lexus ES 250`, and the VIN.
4. **Scenario A (Invalid VIN):** Enter `INVALIDVIN123` and validate — verify a validation error is shown and no vehicle details populate.

**User Story 6: Create and Submit an FTR**
*As a Field Engineer, I want to complete and submit a Field Technical Report so the repair is documented.*

**Acceptance Criteria:**
1. Validate VIN `58AD11D19MU001187` and open the FTR form.
2. Complete Repair Information (repair order, odometer, title, radio/dropdown selections).
3. Add a DTC row and set it as primary.
4. Add a part number row (part number, serial date, quantity).
5. Complete Repair Details (condition description, diagnostic steps, repair process).
6. Click **Submit** and verify a success message and a report number are displayed.

**User Story 7: Save an FTR as Draft**
*As a Field Engineer, I want to save an in-progress FTR as a draft so I can finish it later.*

**Acceptance Criteria:**
1. Validate a VIN and fill Repair Information.
2. Click **Save as Draft** and verify a draft report number is generated.
3. Reopen the draft and verify the saved values are retained.

**User Story 8: Verify FTR on the Case View**
*As a reviewer, I want submitted FTR values to render correctly on the case view so I can trust the data.*

**Acceptance Criteria:**
1. Submit an FTR and open its case view.
2. Verify Vehicle Information matches `2021 Lexus ES 250`.
3. Verify the Repair Information values match what was entered (repair order, odometer, selections).
4. Verify the DTC and part rows persist exactly as added.
