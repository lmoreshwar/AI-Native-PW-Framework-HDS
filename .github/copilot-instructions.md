# Copilot Instructions — Playwright AI Automation Framework

This repository uses a strict Playwright + TypeScript automation framework with binding rules.

**Before generating or modifying ANY test code, read and follow [AGENT.md](../AGENT.md).**
Treat AGENT.md as binding policy: 3-layer architecture (pages = locators only, modules =
workflows, tests = assertions), wrapper-driven interactions (`Actions` / `WaitHelper` /
`WorkflowActions`), evidence-based locators via `@playwright/cli`, centralized `TIMEOUTS`,
secrets only in `.env`, and the anti-hallucination + plan-approval gate.

Human-facing reference (commands, locator standard, wrapper APIs, CI) lives in [README.md](../README.md).

Task playbooks are packaged as skills under `.github/skills/` and load automatically by intent:
new automation, modifying a test, debugging a failure, and self-healing.
