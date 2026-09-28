import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';

const projectId = 'demo-hugging-app-rules';
let testEnv;

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function firestore(uid, email, emailVerified = true) {
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: emailVerified
  }).firestore();
}

function boardData(ownerUid, localId = 'local-board') {
  return {
    ownerUid,
    localId,
    title: 'Research board',
    screenshotIds: ['screen-a'],
    collectionIds: ['flow-a'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function memberData(uid, email, role) {
  return {
    uid,
    email,
    role,
    status: 'active',
    createdAt: serverTimestamp()
  };
}

async function createOwnerBoard(uid = 'owner', email = 'owner@example.com') {
  const db = firestore(uid, email);
  const boardRef = doc(db, 'boards/board-a');
  await assertSucceeds(setDoc(boardRef, boardData(uid)));
  await assertSucceeds(setDoc(
    doc(db, 'boards/board-a/members', uid),
    memberData(uid, email, 'owner')
  ));
  return { db, boardRef };
}

test('verified owners can create private boards; other users cannot read or list them', async () => {
  const { db: ownerDb, boardRef } = await createOwnerBoard();
  assert.equal((await assertSucceeds(getDoc(boardRef))).exists(), true);

  const outsiderDb = firestore('outsider', 'outsider@example.com');
  await assertFails(getDoc(doc(outsiderDb, 'boards/board-a')));
  await assertFails(getDocs(collection(outsiderDb, 'boards')));

  const unverifiedDb = firestore('unverified', 'unverified@example.com', false);
  await assertFails(getDoc(doc(unverifiedDb, 'boards/board-a')));
  await assertSucceeds(getDocs(query(
    collection(ownerDb, 'boards'),
    where('ownerUid', '==', 'owner')
  )));
});

test('only a verified invitee can accept access and edit saved references', async () => {
  const { db: ownerDb } = await createOwnerBoard();
  const inviteRef = doc(ownerDb, 'boards/board-a/invites/invitee@example.com');
  await assertSucceeds(setDoc(inviteRef, {
    invitedEmail: 'invitee@example.com',
    status: 'pending',
    createdBy: 'owner',
    createdAt: serverTimestamp()
  }));

  const inviteeDb = firestore('invitee', 'invitee@example.com');
  const inviteeRef = doc(inviteeDb, 'boards/board-a/invites/invitee@example.com');
  assert.equal((await assertSucceeds(getDoc(inviteeRef))).exists(), true);
  await assertFails(setDoc(
    doc(inviteeDb, 'boards/board-a/members', 'invitee'),
    memberData('invitee', 'invitee@example.com', 'member')
  ));

  await assertSucceeds(updateDoc(inviteeRef, {
    status: 'accepted',
    acceptedBy: 'invitee',
    acceptedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(
    doc(inviteeDb, 'boards/board-a/members', 'invitee'),
    memberData('invitee', 'invitee@example.com', 'member')
  ));
  const sharedBoardRef = doc(inviteeDb, 'boards/board-a');
  assert.equal((await assertSucceeds(getDoc(sharedBoardRef))).exists(), true);

  await assertSucceeds(updateDoc(sharedBoardRef, {
    screenshotIds: ['screen-a', 'screen-b'],
    collectionIds: ['flow-a', 'flow-b'],
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(sharedBoardRef, {
    title: 'Changed by collaborator',
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(sharedBoardRef));
});

test('unverified users cannot create boards, and invites stay private to owner and invitee', async () => {
  const unverifiedDb = firestore('unverified', 'unverified@example.com', false);
  await assertFails(setDoc(
    doc(unverifiedDb, 'boards/unverified-board'),
    boardData('unverified')
  ));

  const { db: ownerDb } = await createOwnerBoard();
  const inviteRef = doc(ownerDb, 'boards/board-a/invites/invitee@example.com');
  await assertSucceeds(setDoc(inviteRef, {
    invitedEmail: 'invitee@example.com',
    status: 'pending',
    createdBy: 'owner',
    createdAt: serverTimestamp()
  }));

  const otherDb = firestore('other', 'other@example.com');
  await assertFails(getDoc(doc(otherDb, 'boards/board-a/invites/invitee@example.com')));
  await assertFails(updateDoc(doc(otherDb, 'boards/board-a/invites/invitee@example.com'), {
    status: 'accepted',
    acceptedBy: 'other',
    acceptedAt: serverTimestamp()
  }));
});
