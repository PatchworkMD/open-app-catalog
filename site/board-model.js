(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.HuggingBoardModel = model;
})(globalThis, function () {
  'use strict';

  function uniqueIds(values, limit) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0 && value.length <= 180))].slice(0, limit);
  }

  function normalizeBoard(value, fallbackId = 'local-default') {
    const board = value && typeof value === 'object' ? value : {};
    const id = typeof board.id === 'string' && board.id ? board.id : fallbackId;
    const name = typeof board.name === 'string' ? board.name.trim().slice(0, 80) : '';
    const emails = Array.isArray(board.memberEmails)
      ? [...new Set(board.memberEmails.filter(email => typeof email === 'string').map(email => email.trim().toLowerCase()).filter(Boolean))].slice(0, 50)
      : [];
    return {
      id,
      localId: typeof board.localId === 'string' && board.localId ? board.localId : id,
      cloudId: typeof board.cloudId === 'string' && board.cloudId ? board.cloudId : null,
      name: name || 'Saved board',
      ownerUid: typeof board.ownerUid === 'string' && board.ownerUid ? board.ownerUid : null,
      ownerEmail: typeof board.ownerEmail === 'string' ? board.ownerEmail : null,
      memberEmails: emails,
      appIds: uniqueIds(board.appIds, 5000),
      collectionIds: uniqueIds(board.collectionIds, 1000),
      updatedAt: board.updatedAt || null
    };
  }

  function applySetDelta(current, base, desired) {
    const currentSet = new Set(uniqueIds(current, 5000));
    const baseSet = new Set(uniqueIds(base, 5000));
    const desiredSet = new Set(uniqueIds(desired, 5000));
    for (const value of desiredSet) if (!baseSet.has(value)) currentSet.add(value);
    for (const value of baseSet) if (!desiredSet.has(value)) currentSet.delete(value);
    return [...currentSet];
  }

  function invitationDecision(status) {
    if (status === 'revoked') return {action:'reissue'};
    if (status === 'pending') return {action:'reject', message:'An invitation is already pending for this email.'};
    if (status === 'accepted') return {action:'reject', message:'This person already has access to the board.'};
    return {action:'reject', message:'This email has an invitation with an unknown status. Ask the board owner to review it.'};
  }

  return {normalizeBoard, uniqueIds, applySetDelta, invitationDecision};
});
