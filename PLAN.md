# Hugging App shipping plan

Goal: ship a dependable, free, public App Store design research catalog using Apple's public data, with honest source labels, screenshot comparison, and local saved boards. Derived from README and recent product/refresh commits; no CONTEXT.md or STATUS.md existed at intake.

## Gaps against done

- Existing checks run inside the production refresh/deploy workflow; PRs need independent validation without credentials or deployment.
- Browser checks cover 390px but not the required 320px viewport.
- Austin approved local-first on 2026-11-05: public catalog plus local boards. Cloud accounts belong to a separate later release.
- Capture local screenshots and verify runtime errors before calling the public catalog ready.

## Ordered steps

1. Run current Python, Node, and browser checks and build reference pages.
2. Add isolated PR validation and 320px layout checks; fix demonstrated defects in small changes.
3. Run the full checks and review screenshots at both widths.
4. Record evidence and launch gates in STATUS.md; commit, push feature branch, open a small PR. Never merge or deploy.

## Validation result

31 Python tests and 14 Node/browser tests passed. Built 803 reference pages. All main routes and the focused viewer fit 390px/320px; reviewed fixture screenshots. JavaScript syntax and whitespace checks passed. The Flows overflow regression was reproduced before the one-property CSS fix.

## Gates

Record product decisions in STATUS.md with recommended options first. Do not activate Firebase, change credentials, spend on metered APIs, or trigger production workflows.

## Local-first release follow-up

1. Stop loading the deferred cloud account module from the release page; retain its source and emulator harness.
2. Make source/privacy copy reflect device-local boards.
3. Verify persistence/export, no account traffic/UI, no console errors, and mobile layout; run the complete existing checks.
4. Open a second small PR stacked on #11. No merge or deployment.

Local-first verification: all 31 Python and 15 Node/browser tests passed; the expanded all-route console regression passed. Real representative media was reviewed in local-board screenshots at both widths. Read-only live Worker verification passed. Product gate resolved; only PR checks/review remain before handback.
