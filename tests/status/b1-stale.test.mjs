// T-B1-02: a status.json whose folder has a commit more than 24 h newer than updated_at is flagged stale.
// Fixture repo in a temp dir, driven by the real build-it status-write script (not a copy of its logic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The build-it status writer is another repo's script: its path comes from the environment (never hardcoded).
// Without it the cases print IMPLEMENTED-NOT-VERIFIED and skip.
const WRITER = process.env.BUILD_IT_STATUS_WRITE || process.env.DOIT_STATUS_WRITE || '';
const SKIP = WRITER && existsSync(WRITER) ? false
  : 'IMPLEMENTED-NOT-VERIFIED: set BUILD_IT_STATUS_WRITE or DOIT_STATUS_WRITE to build-it scripts/status/status-write.mjs';
if (SKIP) console.log('T-B1-02 ' + SKIP);
const HOUR = 60 * 60 * 1000;

function git(cwd, args, env = {}) {
  return execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
    cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

function writer(args) {
  return execFileSync(process.execPath, [WRITER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function makeBoard(commitOffsetMs) {
  const root = mkdtempSync(path.join(tmpdir(), 'b1-stale-'));
  const folder = path.join(root, 'docs', 'implementation', 'fixture-board');
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'status.json');
  const plan = path.join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify({
    implementation: 'fixture-board',
    title: 'Fixture board',
    waves: [{ id: 'W1', title: 'One', tasks: [{ id: 'T-1', title: 'Only task' }] }],
    pieces: [],
  }));
  git(root, ['init', '-q']);
  writer(['init', '--file', file, '--plan', plan, '--by', 'plan-it']);
  // updated_at comes from the writer's clock. The commit is dated relative to that clock.
  const updatedAt = JSON.parse(readFileSync(file, 'utf8')).updated_at;
  const commitAt = new Date(Date.parse(updatedAt) + commitOffsetMs).toISOString();
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture: board'], { GIT_AUTHOR_DATE: commitAt, GIT_COMMITTER_DATE: commitAt });
  return { root, file, updatedAt };
}

function view(file) {
  return JSON.parse(writer(['view', '--file', file, '--json']));
}

test('T-B1-02 a commit 25 h newer than updated_at is flagged stale', { skip: SKIP }, () => {
  const { root, file } = makeBoard(25 * HOUR);
  try {
    const v = view(file);
    assert.equal(v.stale, true, 'expected stale=true for a folder commit 25 h after updated_at');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('T-B1-02 control: a commit 3 h newer than updated_at is not stale', { skip: SKIP }, () => {
  const { root, file } = makeBoard(3 * HOUR);
  try {
    const v = view(file);
    assert.equal(v.stale, false, 'expected stale=false for a folder commit 3 h after updated_at');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
