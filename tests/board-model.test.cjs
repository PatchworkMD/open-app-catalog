const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeBoard, uniqueIds, activeMemberships, applySetDelta, invitationDecision, reconcileCloudBoard, hasPendingSync} = require('../site/board-model.js');

const firebaseConfig = require('../firebase.json');
const firestoreIndexes = require('../firestore.indexes.json');
const accountSyncSource = require('node:fs').readFileSync(require.resolve('../site/account-sync.js'), 'utf8');

test('Firebase indexes cover every filtered account query shape', () => {
  assert.equal(firebaseConfig.firestore.indexes, 'firestore.indexes.json');

  const boardIndex = firestoreIndexes.indexes.find(index =>
    index.collectionGroup === 'boards' && index.queryScope === 'COLLECTION'
  );
  assert.deepEqual(boardIndex?.fields, [
    {fieldPath:'ownerUid', order:'ASCENDING'},
    {fieldPath:'localId', order:'ASCENDING'}
  ]);

  for (const [collectionGroup, fieldPath] of [['invites', 'invitedEmail'], ['members', 'uid']]) {
    const override = firestoreIndexes.fieldOverrides.find(index =>
      index.collectionGroup === collectionGroup && index.fieldPath === fieldPath
    );
    assert.deepEqual(
      new Set(override?.indexes.map(index => `${index.queryScope}:${index.order}`)),
      new Set(['COLLECTION:ASCENDING', 'COLLECTION:DESCENDING', 'COLLECTION_GROUP:ASCENDING'])
    );
  }

  assert.match(accountSyncSource, /query\(collection\(client\.db, COLLECTIONS\.boards\),\s*where\('ownerUid', '==', user\.uid\),\s*where\('localId', '==', (?:boardId|localBoardId)\)\)/s);
  assert.match(accountSyncSource, /query\(collectionGroup\(client\.db, COLLECTIONS\.invites\),\s*where\('invitedEmail', '==', email\)\)/s);
  assert.match(accountSyncSource, /query\(collectionGroup\(client\.db, COLLECTIONS\.members\),\s*where\('uid', '==', user\.uid\)\)/s);
  assert.match(accountSyncSource, /query\(collection\(client\.db, COLLECTIONS\.boards\),\s*where\('ownerUid', '==', user\.uid\)\)/s);
});

test('normalizes local and cloud board identity without changing saved references', () => {
  const board = normalizeBoard({
    id:'cloud-1', localId:'local-1', cloudId:'cloud-1', name:'  Studio  ',
    ownerUid:'user-1', appIds:['screen-1','screen-1',5], collectionIds:['flow-1']
  });
  assert.equal(board.id, 'cloud-1');
  assert.equal(board.localId, 'local-1');
  assert.equal(board.cloudId, 'cloud-1');
  assert.equal(board.name, 'Studio');
  assert.deepEqual(board.appIds, ['screen-1']);
  assert.deepEqual(board.collectionIds, ['flow-1']);
});

test('filters invalid ids and enforces the requested bound', () => {
  assert.deepEqual(uniqueIds(['a', '', 4, 'a', 'b', 'c'], 2), ['a', 'b']);
});

test('inactive memberships do not block active boards from loading', () => {
  const memberships = activeMemberships([
    {status:'inactive', boardId:'revoked-board'},
    {status:'active', boardId:'shared-board'}
  ]);
  assert.deepEqual(memberships.map(membership => membership.boardId), ['shared-board']);
});

test('preserves all supported collection ids across cloud round trips', () => {
  const collectionIds = Array.from({length:1000}, (_, index) => `collection-${index}`);
  assert.deepEqual(normalizeBoard({collectionIds}).collectionIds, collectionIds);
});

test('reconciles pending local edits with newer cloud data without losing either side', () => {
  const local = normalizeBoard({
    id:'cloud-1', localId:'local-1', cloudId:'cloud-1', ownerUid:'owner-1',
    syncBaseAppIds:['keep','remove'], appIds:['keep','local-add'],
    syncBaseCollectionIds:['flow-keep','flow-remove'], collectionIds:['flow-keep','local-flow']
  });
  const remote = normalizeBoard({
    id:'cloud-1', localId:'local-1', cloudId:'cloud-1', ownerUid:'owner-1',
    appIds:['keep','remove','remote-add'], collectionIds:['flow-keep','flow-remove','remote-flow']
  });
  const merged = reconcileCloudBoard(local, remote);
  assert.deepEqual(new Set(merged.appIds), new Set(['keep','local-add','remote-add']));
  assert.deepEqual(new Set(merged.collectionIds), new Set(['flow-keep','local-flow','remote-flow']));
  assert.equal(hasPendingSync(merged), true);
  assert.equal(hasPendingSync(reconcileCloudBoard(merged, normalizeBoard({
    ...remote, appIds:merged.appIds, collectionIds:merged.collectionIds
  }))), false);
});

test('conservatively unions an older synced board with no local sync baseline', () => {
  const merged = reconcileCloudBoard(
    normalizeBoard({id:'cloud-1', ownerUid:'owner-1', appIds:['local-ref']}),
    normalizeBoard({id:'cloud-1', ownerUid:'owner-1', appIds:['remote-ref']})
  );
  assert.deepEqual(new Set(merged.appIds), new Set(['local-ref','remote-ref']));
});

test('merges concurrent set edits without removing unrelated additions', () => {
  assert.deepEqual(
    applySetDelta(['screen-a','screen-b','remote-addition'], ['screen-a','screen-b'], ['screen-a','local-addition']),
    ['screen-a','remote-addition','local-addition']
  );
});

test('invitation states distinguish active, completed, revoked, and invalid records', () => {
  assert.deepEqual(invitationDecision('pending'), {action:'reject', message:'An invitation is already pending for this email.'});
  assert.deepEqual(invitationDecision('accepted'), {action:'reject', message:'This person already has access to the board.'});
  assert.deepEqual(invitationDecision('revoked'), {action:'reissue'});
  assert.equal(invitationDecision('unknown').action, 'reject');
});
