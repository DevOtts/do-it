#!/usr/bin/env node
// reconcile-it commands over real git: scan, plan, apply --approved. Backs the `reconcile-apply` code step of
// core/pipelines/reconcile.yaml. State file .do-it/reconcile/state.json (phase, inventory, dispositions, approved_at).
// scan and plan are read-only against the repos. apply refuses without --approved (exit 2, nothing touched) and
// re-checks every row against the repo at execution time (a branch that moved since plan is skipped, never deleted).
// usage: node scripts/reconcile.mjs scan|plan|apply [--approved] --root DIR [--state-dir DIR]
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function git(cwd, args) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const gitOk = (cwd, args) => git(cwd, args).code === 0;

// Repos are the directories directly under root whose .git is a directory (a worktree has a .git file).
export function findRepos(root) {
  return fs.readdirSync(root).sort().map((n) => path.join(root, n))
    .filter((d) => fs.existsSync(path.join(d, '.git')) && fs.statSync(path.join(d, '.git')).isDirectory());
}

function defaultBranch(repo) {
  for (const b of ['main', 'master']) if (gitOk(repo, ['rev-parse', '--verify', '-q', 'refs/heads/' + b])) return b;
  return git(repo, ['symbolic-ref', '--short', 'HEAD']).out;
}

function worktreesOf(repo) {
  const out = git(repo, ['worktree', 'list', '--porcelain']).out.split('\n\n').filter(Boolean);
  return out.map((blk) => {
    const o = {};
    for (const l of blk.split('\n')) {
      const i = l.indexOf(' ');
      o[i === -1 ? l : l.slice(0, i)] = i === -1 ? true : l.slice(i + 1);
    }
    return { path: o.worktree, branch: o.branch ? String(o.branch).replace('refs/heads/', '') : null, head: o.HEAD };
  });
}

export function scan(root) {
  const inventory = [];
  for (const repo of findRepos(root)) {
    const name = path.basename(repo);
    const main = defaultBranch(repo);
    const wts = worktreesOf(repo);
    const mainWt = wts[0];
    const branches = git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).out.split('\n').filter((b) => b && b !== main);
    for (const b of branches) {
      const tip = git(repo, ['rev-parse', b]).out;
      const wt = wts.find((w) => w.branch === b && w.path !== mainWt.path) || null;
      const dirty = wt ? git(wt.path, ['status', '--porcelain']).out.length > 0 : false;
      const merged = gitOk(repo, ['merge-base', '--is-ancestor', b, main]);
      const ahead = Number(git(repo, ['rev-list', '--count', main + '..' + b]).out);
      // superseded: unmerged, and main changed one of the files the branch changed since they diverged
      let superseded = false;
      if (!merged) {
        const base = git(repo, ['merge-base', main, b]).out;
        const mine = new Set(git(repo, ['diff', '--name-only', base, b]).out.split('\n').filter(Boolean));
        superseded = git(repo, ['diff', '--name-only', base, main]).out.split('\n').filter(Boolean).some((f) => mine.has(f));
      }
      inventory.push({ ref: name + ':' + b, kind: 'branch', repo: name, repo_path: repo, branch: b, default_branch: main, tip, merged, ahead, superseded, worktree: wt ? wt.path : null, dirty });
    }
    for (const w of wts.slice(1)) {
      inventory.push({ ref: name + ':worktree:' + path.basename(w.path), kind: 'worktree', repo: name, repo_path: repo, branch: w.branch, path: w.path });
    }
  }
  return inventory;
}

export function plan(inventory) {
  return inventory.filter((r) => r.kind === 'branch').map((r) => {
    let action;
    if (r.dirty) action = 'rescue-wip';
    else if (r.worktree && r.ahead > 0) action = 'keep-in-flight';
    else if (r.merged && !r.worktree) action = 'delete-landed';
    else if (r.superseded && !r.worktree) action = 'archive-superseded';
    else action = 'review';
    return { ref: r.ref, action, tip: r.tip, repo_path: r.repo_path, branch: r.branch, worktree: r.worktree };
  });
}

// Re-read the row at execution time. null means it still matches the plan.
export function changedSincePlan(d) {
  const tip = git(d.repo_path, ['rev-parse', '--verify', '-q', 'refs/heads/' + d.branch]);
  if (tip.code !== 0) return 'branch no longer exists';
  if (tip.out !== d.tip) return 'branch moved from ' + d.tip.slice(0, 7) + ' to ' + tip.out.slice(0, 7);
  return null;
}

function applyRow(d) {
  const moved = changedSincePlan(d);
  if (moved) return { ref: d.ref, action: d.action, result: 'SKIPPED_CHANGED_SINCE_PLAN', detail: moved };
  if (d.action === 'delete-landed') {
    const r = git(d.repo_path, ['branch', '-d', d.branch]); // -d refuses an unmerged branch
    return r.code === 0 ? { ref: d.ref, action: d.action, result: 'DELETED' } : { ref: d.ref, action: d.action, result: 'SKIPPED_CHANGED_SINCE_PLAN', detail: r.err };
  }
  if (d.action === 'archive-superseded') {
    const tag = 'archive/' + d.branch.replace(/\//g, '-');
    git(d.repo_path, ['tag', tag, d.tip]);
    const r = git(d.repo_path, ['branch', '-D', d.branch]);
    return { ref: d.ref, action: d.action, result: r.code === 0 ? 'ARCHIVED' : 'FAILED', archive_tag: tag };
  }
  if (d.action === 'rescue-wip') {
    const dirty = git(d.worktree, ['status', '--porcelain']).out.length > 0;
    if (!dirty) return { ref: d.ref, action: d.action, result: 'KEPT', detail: 'worktree clean at apply time' };
    const rescue = 'rescue/' + d.branch.replace(/\//g, '-') + '-wip';
    const steps = [['switch', '-c', rescue], ['add', '-A'], ['-c', 'user.email=reconcile@do-it.local', '-c', 'user.name=reconcile', 'commit', '-q', '-m', 'rescue: uncommitted work from ' + d.branch]];
    for (const s of steps) { const r = git(d.worktree, s); if (r.code !== 0) return { ref: d.ref, action: d.action, result: 'FAILED', detail: r.err }; }
    return { ref: d.ref, action: d.action, result: 'RESCUED', rescue_branch: rescue };
  }
  return { ref: d.ref, action: d.action, result: 'KEPT' };
}

const stateFile = (dir) => path.join(dir, 'state.json');
function writeState(dir, state) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFile(dir) + '.tmp', JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(stateFile(dir) + '.tmp', stateFile(dir));
}
const readState = (dir) => (fs.existsSync(stateFile(dir)) ? JSON.parse(fs.readFileSync(stateFile(dir), 'utf8')) : null);

// Returns { exit, ...payload }. Exit 2 = needs a human (no approval).
export function run(cmd, o) {
  const dir = o.stateDir || path.join(o.root, '.do-it', 'reconcile');
  if (cmd === 'scan') {
    const inventory = scan(o.root);
    writeState(dir, { phase: 'scan', inventory, dispositions: [], approved_at: null });
    return { exit: 0, phase: 'scan', inventory };
  }
  const st = readState(dir);
  if (cmd === 'plan') {
    if (!st) return { exit: 1, outcome: 'NO_SCAN' };
    const dispositions = plan(st.inventory);
    writeState(dir, { ...st, phase: 'plan', dispositions, approved_at: null });
    return { exit: 0, phase: 'plan', dispositions };
  }
  if (cmd === 'apply') {
    if (!st || st.phase !== 'plan') return { exit: 1, outcome: 'NO_PLAN' };
    if (!o.approved) return { exit: 2, outcome: 'APPROVAL_REQUIRED', message: 'apply requires --approved; nothing was changed' };
    writeState(dir, { ...st, phase: 'apply', approved_at: new Date().toISOString() });
    const rows = st.dispositions.map(applyRow);
    writeState(dir, { ...readState(dir), phase: 'done', report: rows });
    return { exit: 0, phase: 'done', rows };
  }
  return { exit: 1, outcome: 'USAGE' };
}

function main(argv) {
  const get = (k) => { const i = argv.indexOf('--' + k); return i === -1 ? null : argv[i + 1]; };
  const cmd = argv[0];
  const root = get('root');
  if (!['scan', 'plan', 'apply'].includes(cmd) || !root) { console.error('usage: reconcile.mjs scan|plan|apply [--approved] --root DIR [--state-dir DIR]'); return 1; }
  const r = run(cmd, { root: path.resolve(root), stateDir: get('state-dir'), approved: argv.includes('--approved') });
  console.log(JSON.stringify(r));
  return r.exit;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
