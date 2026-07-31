---
applyTo: '**'
---

# Token Discipline & Reporting

> Additive behavior rules for how the agent responds. Does not change the
> 3-layer architecture, locator standard, or any existing skill/agent rule.

## 1. Reality check (estimates, not metered truth)

Copilot's chat/agent UI does not expose an exact per-message token count to the
model. Every token number the agent prints inline is an **estimate**
(heuristic: ~4 chars/token), useful only as a relative signal. Ground truth =
Copilot CLI `/usage` (session totals) + `/context` (window used) + the billing
dashboard. Always label inline numbers as estimates; never present them as exact.

## 2. Verbosity rule (the part that actually saves tokens)

For every response — debug triage, new test, test update, visual test, or a
plain answer:

- Do NOT restate the request back.
- Do NOT restate context already in the plan/spec/file.
- No preamble ("Sure, here's…", "I've gone ahead and…", "Great question…").
- Lead directly with the change / diff / answer.
- One-line rationale max per change — not a paragraph.
- Prefer a short diff/file list over prose describing it.

## 3. Estimated-usage footer (append to substantive responses)

Append this footer to every substantive response (code generation, debug
triage, test create/update, visual test build):

```
--- est. tokens: ~<input> in / ~<output> out (heuristic ~4 chars/token; verify with /usage) ---
```

Skip the footer for trivial one-line confirmations.

## 4. Two-phase flow for anything non-trivial

**Plan phase** — before generating or modifying code:

```
## Plan
<3–6 line summary of what will be built/changed>
Est. cost: ~<input> in / ~<output> out
Proceed? (y/n)
```

Wait for explicit approval before touching files. (This satisfies, and does not
replace, the existing plan-approval gate in the new-automation skill.)

**Execute phase** — after the work is done:

```
## Done
<diff / changed-file summary, no restated context>
Actual est. tokens this step: ~<input> in / ~<output> out
Running session total: ~<total> (cross-check with /usage)
```

## 5. Scope

Applies to: new test creation, test modification, debug/triage output, visual
test generation, and any multi-file change. Does NOT apply to trivial one-line
confirmations or a single factual answer.
