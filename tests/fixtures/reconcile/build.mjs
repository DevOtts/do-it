// Scratch workspace builder: 2 repos, 5 branches, 2 worktrees. Real git, no network.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const BRANCH_LABELS = {
  'repo-a': { 'feat/landed-a': 'landed', 'feat/superseded': 'superseded', 'feat/in-flight': 'in-flight' },
  'repo-b': { 'feat/landed-b': 'landed', 'feat/dirty': 'dirty' },
};
// Worktrees (besides each repo's main checkout): the in-flight and dirty branches.
export const WORKTREES = { 'repo-a': ['feat/in-flight'], 'repo-b': ['feat/dirty'] };

function git(cwd, args, env) {
  return cp.execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...(env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
}

function commit(cwd, file, text, msg, env) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, ['add', '-A'], env);
  git(cwd, ['commit', '-q', '-m', msg], env);
}

export function buildReconcileWorkspace(root, env) {
  const e = { ...(env || {}) };
  const out = { root, repos: {}, worktrees: [] };
  for (const name of Object.keys(BRANCH_LABELS)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    git(dir, ['init', '-q', '-b', 'main'], e);
    git(dir, ['config', 'user.email', 't@example.com'], e);
    git(dir, ['config', 'user.name', 'T'], e);
    commit(dir, 'README.md', name + '\n', 'init', e);
    out.repos[name] = dir;
  }
  const a = out.repos['repo-a'];
  const b = out.repos['repo-b'];
  // landed: merged into main, branch left behind.
  git(a, ['checkout', '-q', '-b', 'feat/landed-a'], e);
  commit(a, 'a.txt', 'landed a\n', 'landed a', e);
  git(a, ['checkout', '-q', 'main'], e);
  git(a, ['merge', '-q', '--no-ff', '-m', 'merge landed-a', 'feat/landed-a'], e);
  // superseded: a different change to the same file landed on main instead; the branch never merged.
  git(a, ['checkout', '-q', '-b', 'feat/superseded'], e);
  commit(a, 'shared.txt', 'old approach\n', 'old approach', e);
  git(a, ['checkout', '-q', 'main'], e);
  commit(a, 'shared.txt', 'new approach\n', 'new approach lands on main', e);
  // in-flight: unmerged work checked out in a worktree.
  git(a, ['branch', 'feat/in-flight', 'main'], e);
  const wtA = path.join(root, 'wt-in-flight');
  git(a, ['worktree', 'add', '-q', wtA, 'feat/in-flight'], e);
  commit(wtA, 'wip.txt', 'in flight\n', 'in flight work', e);
  out.worktrees.push(wtA);

  git(b, ['checkout', '-q', '-b', 'feat/landed-b'], e);
  commit(b, 'b.txt', 'landed b\n', 'landed b', e);
  git(b, ['checkout', '-q', 'main'], e);
  git(b, ['merge', '-q', '--no-ff', '-m', 'merge landed-b', 'feat/landed-b'], e);
  git(b, ['branch', 'feat/dirty', 'main'], e);
  const wtB = path.join(root, 'wt-dirty');
  git(b, ['worktree', 'add', '-q', wtB, 'feat/dirty'], e);
  fs.writeFileSync(path.join(wtB, 'uncommitted.txt'), 'wip not committed\n');
  out.worktrees.push(wtB);
  return out;
}
