const { test } = require('node:test');
const assert = require('node:assert/strict');
const cases = require('./fixtures/snapshot-rule-cases.json');

const rules = import('../site/snapshot.js').then(m => ({
  module: m,
  byCase: {
    assetPath: m.isAssetPath,
    screenshotId: m.isScreenshotId,
    appleSourceUrl: m.isAppleSourceUrl,
    fullSizeUrl: m.isFullSizeUrl,
    reviewedScreenshot: m.isReviewedScreenshot,
  },
}));

test('every shared case matches the pipeline rules', async () => {
  const { byCase } = await rules;
  assert.deepEqual(Object.keys(byCase).sort(), Object.keys(cases).sort());
  for (const [name, rule] of Object.entries(byCase)) {
    for (const value of cases[name].valid)
      assert.equal(rule(value), true, `${name} should accept ${JSON.stringify(value)}`);
    for (const value of cases[name].invalid)
      assert.equal(rule(value), false, `${name} should reject ${JSON.stringify(value)}`);
  }
});

test('a snapshot always exposes array lists and a coverage record', async () => {
  const { normalizeSnapshot } = (await rules).module;
  const snapshot = normalizeSnapshot({ apps: [{ id: '1', name: 'A' }, null, 'x'], screens: 'bad', coverage: [] });
  assert.deepEqual(snapshot, { apps: [{ id: '1', name: 'A' }], screens: [], flows: [], elements: [], coverage: {} });
  assert.throws(() => normalizeSnapshot(null), TypeError);
  assert.throws(() => normalizeSnapshot([]), TypeError);
});
