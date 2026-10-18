// The catalog describes the sibling repos as they were before the do-it
// integration PRs landed, and pins them against the do-it companions.json of
// that time. These checks replay that state from git history, so they keep
// testing the catalog's claims after the PRs merge.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// do-it commit whose core/companions.json still carries the pre-merge pins
export const PRE_COMPANIONS_COMMIT = '2aff89a';

// last commit of each sibling before its do-it integration PR
export const BASELINE = {
  'prompt-it': '7e4bf0a',
  'build-it': '6feb0cf',
  'plan-it': '82fa8bf',
  'review-it': '8bd3df9',
  'conclude-it': '4d3297f',
  'parallel-lifecycle': '39c1827',
};

// Writes each sibling's tree at its baseline commit into a temp folder.
export function preMergeSiblings(siblingsRoot) {
  const out = mkdtempSync(join(tmpdir(), 'pre-merge-'));
  for (const [repo, sha] of Object.entries(BASELINE)) {
    const dest = join(out, repo);
    mkdirSync(dest, { recursive: true });
    const tar = execFileSync('git', ['-C', join(siblingsRoot, repo), 'archive', sha], { maxBuffer: 256 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', dest], { input: tar });
  }
  return out;
}

// A do-it root whose core/companions.json is the one committed before the pins moved.
export function baselineCompanionsRoot(doItRoot, doItCommit) {
  const out = mkdtempSync(join(tmpdir(), 'pre-merge-root-'));
  const body = execFileSync('git', ['-C', doItRoot, 'show', `${doItCommit}:core/companions.json`], { encoding: 'utf8' });
  mkdirSync(join(out, 'core'), { recursive: true });
  writeFileSync(join(out, 'core', 'companions.json'), body);
  return out;
}
