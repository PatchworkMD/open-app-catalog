const { test } = require('node:test');
const assert = require('node:assert/strict');
const ruleCases = require('./fixtures/snapshot-rule-cases.json');
const intakeCases = require('./fixtures/snapshot-intake-cases.json');

const snapshotModule = import('../site/snapshot.js');
const asJson = value => JSON.parse(JSON.stringify(value));

test('every shared rule case matches the pipeline', async () => {
  const m = await snapshotModule;
  const rules = {
    assetPath: m.isAssetPath,
    screenshotId: m.isScreenshotId,
    appleSourceUrl: m.isAppleSourceUrl,
    fullSizeUrl: m.isFullSizeUrl,
    reviewedScreenshot: m.isReviewedScreenshot,
  };
  assert.deepEqual(Object.keys(rules).sort(), Object.keys(ruleCases).sort());
  for (const [name, rule] of Object.entries(rules)) {
    for (const value of ruleCases[name].valid)
      assert.equal(rule(value), true, `${name} should accept ${JSON.stringify(value)}`);
    for (const value of ruleCases[name].invalid)
      assert.equal(rule(value), false, `${name} should reject ${JSON.stringify(value)}`);
  }
});

for (const testCase of intakeCases) {
  test(`snapshot intake: ${testCase.name}`, async () => {
    const { readSnapshot, mergeReviewedLibrary } = await snapshotModule;
    const intake = () => {
      const snapshot = readSnapshot(testCase.snapshot);
      return 'reviewed' in testCase ? mergeReviewedLibrary(snapshot, testCase.reviewed) : snapshot;
    };
    if (testCase.error) assert.throws(intake, TypeError);
    else assert.deepEqual(asJson(intake()), testCase.expected);
  });
}
