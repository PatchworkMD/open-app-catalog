# Decision: dedicated Firebase project for accounts and shared boards

- Date: 2026-09-23
- Status update 2026-09-27: GCP project `patchworkmd-hugging-app-prod` was created under owner approval. Firebase activation has not completed; the recorded 403 cause is unconfirmed. See [provisioning receipt](2026-09-23-firebase-provisioning-receipt.md). Authentication/rules/credentials remain incomplete.

## Context

Hugging App's saved boards currently stay in the browser. Accounts and synced or shared boards need a separate backend. Appllama is a product reference only; its accounts, projects, and data must remain separate.

## Decision

Use a dedicated Firebase project owned by PatchworkMD for Hugging App accounts and synced or shared boards. Do not reuse or link an Appllama project or another product's identity or data. The active user goal authorizes independent Google/email sign-in and private synced/shared boards after Firebase activation.

The project has been created under the later owner approval recorded in the provisioning receipt. Saved boards remain browser-local. Firebase activation, authentication, and access rules are not complete.

## Provisioning proposal

- Display name: `Hugging App Production`.
- Owner: a PatchworkMD-controlled Google account or organization. Provisioned owner: austinwisepgh@gmail.com (project creator, roles/owner).
- Project ID: `patchworkmd-hugging-app-prod`, created 2026-09-23 and verified `ACTIVE` on 2026-09-27.
- Firebase Management API: enabled. The recorded `addFirebase` call returned 403. Current Firebase guidance identifies permissions or unaccepted Terms as likely causes; disabled billing alone does not establish the blocker.

## Next human action

As the project owner, open the Firebase Console, select **Add Firebase to Google Cloud project**, choose `patchworkmd-hugging-app-prod`, and accept the Firebase Terms if prompted. If the 403 persists, capture the full error and verify Firebase Management permissions. Do not enable billing just to clear this 403: Firebase's Spark plan is no-cost and does not require a payment method. Google/email provider setup, Firestore rules, credentials, and publication remain separate steps. Project deletion also requires separate approval.
