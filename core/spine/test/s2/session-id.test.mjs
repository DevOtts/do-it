// T-S1-09 [REAL]: `do-it start --request "x"` from a Claude Code Bash with the plugin, no flags and no
// exports, records the session's own id; after /clear, `resume` re-binds the run to the new id.
// The host half is the plugin's SessionStart hook; this test runs it for real, sources the env file it
// writes (what Claude Code does for every Bash call), and spawns the plugin's copy of the CLI.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CORE_DIR, mkRepo, readJson, tmp } from '../helpers.mjs';

const ROOT = path.resolve(CORE_DIR, '..');
const HOOK = path.join(ROOT, 'plugins', 'do-it', 'hooks', 'session-env.mjs');
const CLI = path.join(ROOT, 'plugins', 'do-it', 'scripts', 'do-it.mjs');
const SESSION = process.env.CLAUDE_CODE_SESSION_ID;

function bash(repo, envFile, extraEnv, command) {
  const r = cp.spawnSync('bash', ['-c', '. "$ENVF"; ' + command], {
    cwd: repo.dir,
    env: { ...repo.env, ENVF: envFile, CLI, ...extraEnv },
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('T-S1-09 [REAL] start records CLAUDE_CODE_SESSION_ID with no flag or export; resume after /clear re-binds', (t) => {
  if (!SESSION) {
    console.log('IMPLEMENTED-NOT-VERIFIED: CLAUDE_CODE_SESSION_ID is not set in this environment');
    t.skip('IMPLEMENTED-NOT-VERIFIED: CLAUDE_CODE_SESSION_ID not set');
    return;
  }
  const repo = mkRepo();
  const envFile = path.join(tmp('dit-sessenv-'), 'env.sh');
  fs.writeFileSync(envFile, '');
  const startHook = (id) => cp.spawnSync(process.execPath, [HOOK], { env: { ...repo.env, CLAUDE_ENV_FILE: envFile, CLAUDE_CODE_SESSION_ID: id }, encoding: 'utf8' });
  assert.equal(startHook(SESSION).status, 0);
  assert.match(fs.readFileSync(envFile, 'utf8'), /export DO_IT_SESSION_ENV=/);
  assert.ok(!fs.readFileSync(envFile, 'utf8').includes(SESSION), 'only the variable name is written, never the id');

  const started = bash(repo, envFile, { CLAUDE_CODE_SESSION_ID: SESSION }, 'node "$CLI" start --request "x" --json');
  assert.equal(started.code, 0, started.stdout + started.stderr);
  const runId = JSON.parse(started.stdout.trim().split('\n').pop()).run_id;
  const stateFile = path.join(repo.doIt, 'runs', runId, 'state.json');
  const owner = readJson(stateFile).owner;
  assert.ok(owner.session_id, 'never null');
  assert.equal(owner.session_id, SESSION);

  // /clear: a new session id in the same Bash environment, SessionStart runs again
  const NEW = SESSION + '-after-clear';
  assert.equal(startHook(NEW).status, 0);
  const resumed = bash(repo, envFile, { CLAUDE_CODE_SESSION_ID: NEW }, 'node "$CLI" resume --json');
  assert.equal(resumed.code, 0, resumed.stdout + resumed.stderr);
  const after = readJson(stateFile).owner;
  assert.equal(after.session_id, NEW);
  assert.equal(after.history.length, 1);
  assert.equal(after.history[0].session_id, SESSION);
  fs.rmSync(path.dirname(envFile), { recursive: true, force: true });
});
