# Firebase provisioning receipt — 2026-09-23

Owner approval: "7 get it going an approved and working" (PatchworkMD app plugins gate).

## Completed

1. **GCP project created**: `patchworkmd-hugging-app-prod`
   - Display name: `Hugging App Production`
   - State: ACTIVE
   - Project number: 668246727797
   - Owner: user:austinwisepgh@gmail.com (roles/owner verified via IAM readback)
   - Created via: `gcloud projects create patchworkmd-hugging-app-prod --name="Hugging App Production"`
2. **Firebase Management API enabled** on the project (firebase.googleapis.com).
3. **ADC quota project repaired**: `gcloud auth application-default set-quota-project carbide-sensor-463917-q0` — cleared the stale `projects/32555940559` SERVICE_DISABLED error.
4. **Firebase Management API enabled on carbide-sensor-463917-q0** (ADC quota project) to allow API calls.

## Pending: addFirebase returned 403; cause not confirmed

The recorded `projects.addFirebase` attempt returned `403 PERMISSION_DENIED`. The original attribution to disabled billing was an inference, not a verified cause. Current Firebase documentation says this error can indicate missing project permissions or unaccepted Firebase Terms; it does not identify disabled billing as the cause. The project owner binding is present, and the Firebase Management API is enabled.

Read-only check on 2026-09-27: `patchworkmd-hugging-app-prod` is `ACTIVE`, the Firebase Management API is enabled, the owner IAM binding is present, and Cloud Billing is disabled. Disabled billing alone does not prove the add-Firebase blocker. Firebase's no-cost Spark plan does not require a payment method; billing changes are not the next step unless a specific Firebase feature later requires Blaze.

## Exact remaining human action

As the project owner, open the [Firebase Console](https://console.firebase.google.com/), choose **Add Firebase to Google Cloud project**, select `patchworkmd-hugging-app-prod`, and accept the Firebase Terms if prompted. If the 403 remains, capture its full error details and verify the owner's Firebase Management permissions. Do not reopen or attach billing solely to resolve this error.

## Remaining implementation

- No Firebase Auth providers or Firestore rules are configured yet.
- The active user goal (2026-09-27) explicitly includes independent Google/email sign-in and private synced/shared boards after Firebase activation.
- No credentials or publication were added.
- No Appllama project linkage
- No deletion of any project

Adding Firebase changes the existing Google Cloud project and cannot be fully undone. Firebase configuration, Google/email providers, Firestore rules, credentials, and deployment still require their own verified steps. See Google's [existing-project setup and 403 guidance](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project) and [Spark/Blaze pricing](https://firebase.google.com/pricing).
