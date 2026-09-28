const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeBoard, uniqueIds, applySetDelta, invitationDecision} = require('../site/board-model.js');

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

test('preserves all supported collection ids across cloud round trips', () => {
  const collectionIds = Array.from({length:1000}, (_, index) => `collection-${index}`);
  assert.deepEqual(normalizeBoard({collectionIds}).collectionIds, collectionIds);
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
