const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const guard = import('../scripts/git-guard.mjs');

const local = 'a'.repeat(40),
  remote = 'b'.repeat(40),
  zero = '0'.repeat(40);

const line = (remoteRef, localSha = local, remoteSha = remote) =>
  `refs/heads/topic ${localSha} ${remoteRef} ${remoteSha}\n`;

const fastForward = () => true;

test('a fast-forward push to a feature branch is allowed', async () => {
  const { refusals } = await guard;
  assert.deepEqual(refusals(line('refs/heads/push/20261106-topic'), fastForward), []);
  assert.deepEqual(
    refusals(line('refs/heads/push/new', local, zero), () => false),
    []
  );
});

test('pushes to the default branch, deletions and force updates are refused', async () => {
  const { refusals } = await guard;
  assert.match(refusals(line('refs/heads/master'), fastForward)[0], /protected/);
  assert.match(refusals(line('refs/heads/main'), fastForward)[0], /protected/);
  assert.match(refusals(line('refs/heads/push/topic', zero), fastForward)[0], /deleting/);
  assert.match(refusals(line('refs/heads/push/topic'), () => false)[0], /force-pushed/);
});

test('the hook command exits non-zero for a refused push', () => {
  const script = path.join(__dirname, '../scripts/git-guard.mjs');
  assert.throws(() => execFileSync('node', [script], { input: line('refs/heads/master'), stdio: 'pipe' }));
  assert.equal(execFileSync('node', [script], { input: '' }).toString(), '');
});
