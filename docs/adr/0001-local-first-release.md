# ADR-0001: Ship the public catalog with device-local boards

- Status: accepted
- Date: 2026-11-05
- Decided by: Austin

## Context

The cloud account and shared-board code (`site/cloud-boards.mjs`, `firestore.rules`) exists. Firebase activation is unconfirmed (see the [dedicated Firebase project decision](../decisions/2026-09-23-dedicated-firebase-project.md)). Shipping accounts would need providers, reviewed database rules, public Web App configuration and a separate review.

## Decision

The public release loads no account code. Boards are saved in the visitor's browser under the existing `oac-board` and `oac-board-collections` keys. Export is the portable copy. The cloud source and its emulator harness stay in the repo for a later release.

## Consequences

- No sign-in, no account network traffic, and no account UI. `tests/local-first.test.cjs` guards all three.
- Clearing browser storage removes a board. The About copy says so.
- The `window.HuggingCatalog` board bridge stays as the seam where a cloud adapter can attach later.
- Enabling accounts needs its own ADR and release. Adding configuration alone does not enable them.
