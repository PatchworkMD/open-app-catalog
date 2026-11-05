# Hugging App shipping plan

Goal: ship a dependable, free, public App Store design research catalog using Apple's public data, with honest source labels, screenshot comparison, and local saved boards. Derived from README and recent product/refresh commits; no CONTEXT.md or STATUS.md existed at intake.

## Gaps against done

- Existing checks run inside the production refresh/deploy workflow; PRs need independent validation without credentials or deployment.
- Browser checks cover 390px but not the required 320px viewport.
- Cloud boards/accounts are intentionally unactivated; launch scope needs Austin's decision.
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
