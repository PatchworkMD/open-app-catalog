# Hugging App accounts and boards contract

## Runtime boundary

The browser targets Firebase Authentication and Cloud Firestore for the existing
GCP project `patchworkmd-hugging-app-prod`; Firebase activation remains unconfirmed
as detailed below. Once approved, a public, non-secret Firebase Web App configuration
is served as `/firebase-config.json`. Production rejects other projects. Missing configuration disables account
actions with an explicit setup message; it never falls back to a fake account
or a different project.

Email/password accounts require verified email before board data is available.
Google sign-in uses Firebase Authentication. The Google provider, email/password
provider, Firestore database, and deployed rules are live activation gates.

## Firestore documents

- `boards/{boardId}` stores `{ownerUid, title, createdAt, updatedAt,
  schemaVersion, state}`. `state: "active"` is required for a usable board.
  Every board has a matching immutable `boardIdentities/{boardId}` record
  storing `{ownerUid, state, createdAt}`. Both records must be active and have
  the same owner; the identity record is created atomically with the board and
  is never client-readable, updateable, or deletable. Its retained existence
  prevents a deleted board ID from being reused.
- `boards/{boardId}/members/{uid}` stores `{uid, email, role, joinedAt,
  inviteId}`. The owner has role `owner`; collaborators have role `member`.
- `boards/{boardId}/items/{kind--encodedItemId}` stores only
  `{kind, itemId, addedBy, addedAt}`. `kind` is `screen` or `collection`;
  references point to the public catalog and contain no private user payload.
- `users/{uid}/boards/{boardId}` is a private list index for that user's own
  memberships. Board creation atomically creates the board, immutable identity,
  owner membership, and owner index. Invite acceptance atomically marks the
  invite accepted and creates the recipient membership and index. Member removal
  and leaving atomically remove the matching membership and index.
- `boardInvites/{inviteId}` stores `{boardId, boardTitle, ownerUid, inviteeEmail, status,
  createdAt, acceptedByUid}`. The owner can read the owner's invites; the
  invited verified email can read only an invite whose status is `pending`.
  Acceptance atomically creates membership and the recipient's index.

## Operations and authorization

- Sign in, create an email account, verify email, resend verification, reset a
  password, and sign out.
- Create a private board, choose an owned or shared board, and sync only the
  saved catalog references changed while that board is selected.
- Import this browser's existing saved references only after the user presses
  the import action. Import merges and never deletes cloud items.
- Invite an email address by creating a pending invite. The owner copies or
  emails the generated invite link; Hugging App does not send mail.
- Accept only when signed into the invited verified email. Revoke pending
  invites and remove collaborators as the board owner. A collaborator may
  leave; the owner cannot leave or hard-delete a board.
- Board IDs are not reusable: clients cannot delete the board or its identity
  record, and identity records are immutable. Deleting or losing access to
  board contents does not reset that ID's owner/history.
- Async reads, snapshots, and writes are fenced by the signed-in account
  generation and selected board. A completion from a previous account or
  board must not repopulate state after an account/board change or sign-out.
- A verified account replacement clears the prior account's loaded board,
  collaborators, items, invitations, and private drafts before bootstrap awaits.
- Snapshots for the same account and board preserve title/invite drafts, focused
  editors, and supported selections without stealing focus from another control.
  A completed board creation clears its submitted title only if no newer edit
  occurred; account and actual board changes still clear private drafts.
- Firestore rules deny unauthenticated, unverified, non-member, cross-user
  index, cross-board, malformed, and public-list access. Client-side checks are
  usability only; rules are the authorization boundary.

## Activation boundary

Source and isolated tests may be prepared locally. Do not accept Firebase
terms, enable providers, create live database resources, change live rules, set
live Web App configuration, or deploy these changes without the corresponding
separate approval.

### Exact activation handoff

The existing GCP project `patchworkmd-hugging-app-prod` is `ACTIVE` (project
number `668246727797`), and the Firebase Management API is enabled. A read-only
Firebase Management resource lookup using the quota project returned
`404 NOT_FOUND`; Firebase resource setup and terms are therefore not confirmed.
Do not treat the existing GCP project or local source as an activated Firebase
deployment.

The exact remaining foreman-approval gates are:

1. Accept any required Firebase resource terms and create/confirm the Firebase
   resource for this project.
2. Enable Firebase Authentication Email/Password and Google sign-in.
3. Authorize `catalog.patchworkmd.dev` as an Authentication domain.
4. Create the native `(default)` Firestore database in the settled region
   `us-east4`.
5. Review and approve deployment of the current `firestore.rules`.
6. Create a dedicated Firebase Web App, then approve publishing its actual
   public client configuration at `/firebase-config.json`. Never invent a
   support email or configuration values; the client key is public but server
   credentials must remain private.
7. Separately approve and publish the site/config/rules activation.

None of these live actions has been taken by this source change. Source work and
synthetic emulator checks do not activate Firebase or prove
live Google redirects, provider setup, authorized-domain behavior, or website
publishing. Until each live gate is separately approved and verified, account
sync remains unconfigured and saves stay on the current device.
