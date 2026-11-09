// @ts-check
// Pre-push guard: refuses pushes to the default branch, branch deletions and non-fast-forward (force) updates.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROTECTED = new Set(['refs/heads/master', 'refs/heads/main']);
const ZERO = /^0+$/;

/**
 * @param {string} input pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" per line
 * @param {(ancestor: string, descendant: string) => boolean} isAncestor
 * @returns {string[]} reasons the push is refused
 */
export function refusals(input, isAncestor) {
  return input
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .filter(fields => fields.length === 4)
    .flatMap(([, localSha, remoteRef, remoteSha]) => {
      if (PROTECTED.has(remoteRef)) return [`${remoteRef} is protected; push a feature branch and open a PR`];

      if (ZERO.test(localSha)) return [`deleting ${remoteRef} is not allowed; archive instead`];

      if (!ZERO.test(remoteSha) && !isAncestor(remoteSha, localSha)) return [`${remoteRef} would be force-pushed`];

      return [];
    });
}

/** @param {string} ancestor @param {string} descendant */
function gitIsAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const reasons = refusals(readFileSync(0, 'utf8'), gitIsAncestor);

  for (const reason of reasons) console.error(`git-guard: ${reason}`);
  process.exitCode = reasons.length ? 1 : 0;
}
