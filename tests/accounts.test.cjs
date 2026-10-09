'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('Firebase setup accepts only the dedicated Hugging App web project', async () => {
  const {firebaseConfigReady} = await import('../site/cloud-boards.mjs');
  const config = {projectId:'[redacted-gcp-project]',apiKey:'public-client-key',authDomain:'[redacted-gcp-project].firebaseapp.com',appId:'1:web:app'};
  assert.equal(firebaseConfigReady(config), true);
  assert.equal(firebaseConfigReady({...config,projectId:'another-product'}), false);
  assert.equal(firebaseConfigReady({...config,appId:''}), false);
  assert.equal(firebaseConfigReady(null), false);
});

test('saved references receive safe deterministic document IDs', async () => {
  const {itemDocumentId,normalizeEmail} = await import('../site/cloud-boards.mjs');
  assert.equal(itemDocumentId('screen','app/with slash'), 'screen--app%2Fwith%20slash');
  assert.equal(itemDocumentId('collection','flows:welcome'), 'collection--flows%3Awelcome');
  assert.equal(normalizeEmail('  Austin@Example.COM  '), 'austin@example.com');
});

