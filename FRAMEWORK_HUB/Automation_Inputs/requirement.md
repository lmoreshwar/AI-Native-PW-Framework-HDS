# 📌 TAS / FTR Automation Requirements

## 🎯 Objective

Automate end-to-end testing of the **Technical Assistance System (TAS)** and the
**Field Technical Report (FTR)** application using Playwright with TypeScript — ensuring
scalability, robustness, and minimal maintenance through wrapper-driven, self-healing locators.

> **Application under test:** `https://app.example.com`
> **Primary flows:** SSO sign-in, TAS case management, FTR creation & submission.

---

## 📋 Functional Requirements

| ID | Requirement       | Description                                                            |
| -- | ----------------- | --------------------------------------------------------------------- |
| R1 | Automation Scope  | Automate core TAS case and FTR report flows in Playwright + TypeScript |
| R2 | AI Powered        | Leverage AI for test generation, locator healing, and failure triage  |
| R3 | Low Maintenance   | Wrapper-driven interactions and evidence-based locators                |
| R4 | Robustness        | SmartLocator self-healing adapts to UI changes automatically          |
| R5 | 3-Layer Structure | Strict pages (locators) / modules (workflows) / specs (assertions)    |

---

## 🔐 Authentication & Access

| Role           | Description                                          |
| -------------- | --------------------------------------------------- |
| Corporate User | Company staff who create, triage, and close TAS cases  |
| Dealer User    | Dealership staff who raise and watch cases          |
| Field Engineer | Submits Field Technical Reports (FTR) against a VIN |

> Credentials are sourced from **GitHub repository secrets / `.env`** — never hardcoded in repo files.

---

## 🧩 In-Scope Application Flows

| Area | Flow                  | Description                                                         |
| ---- | --------------------- | ----------------------------------------------------------------- |
| TAS  | Create Case           | Create a Technical / Documentation Only / Parts Release case      |
| TAS  | Case Search           | Search cases by Case ID, VIN, or dealer code                      |
| TAS  | Filter by Status      | Filter the case list by status (e.g. Pending Closure)             |
| TAS  | Update Case Status    | Save / Submit a case status change                                |
| TAS  | Watch Case            | Add a case to the user's watch list                               |
| TAS  | Verify Case Creator   | Confirm the case creator name and metadata                        |
| TAS  | Pre-Call Worksheet    | Complete the pre-call worksheet before contacting the dealer      |
| FTR  | VIN Validation        | Enter a VIN and validate vehicle information                      |
| FTR  | Create Draft          | Build and save an FTR as a draft                                  |
| FTR  | Create & Submit       | Complete repair info / DTC / parts / details and submit the FTR   |
| FTR  | Case View Verification| Verify persisted FTR values render correctly on the case view     |

---

## 🌐 Cross-Platform Testing

| Category  | Details                       |
| --------- | ----------------------------- |
| Viewports | Desktop, Tablet, Mobile       |
| Browsers  | Chrome, Edge, Firefox, Safari |
| Cloud     | Sauce Labs (saucectl)         |

---

## 🔧 Tools & Integrations

| ID | Requirement                                                       |
| -- | ----------------------------------------------------------------- |
| R6 | Sauce Labs integration for cross-browser cloud execution          |
| R7 | AiDebugReporter for AI-assisted failure analysis (`DEBUG_REPORT`) |
| R8 | SmartLocator self-healing telemetry (`SELF_HEALING_REPORT`)       |
| R9 | CI pipeline trigger with HTML + JSON reports                      |

---

## 👤 Primary User Story

As a quality engineer, I want the TAS case lifecycle and FTR submission flows to be
validated automatically on every build, so regressions in case creation, search, status
updates, and field technical reporting are caught early with self-healing locators and
AI-assisted failure reports.

---

## 🚀 Future Scope

* Extend coverage to additional TAS case types (Collision Center, Parts Release edge cases)
* Add API-level setup/teardown for faster case provisioning
* Multi-environment matrix (UAT / Staging) execution
* Accessibility and visual-regression checks on key TAS/FTR screens
