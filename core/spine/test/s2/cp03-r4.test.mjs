// CP-03 round 4 regressions for the stop gate (G-1, CONTRACT 3.1). Each test replays the adversarial
// reviewer's commands through the built bundle and asserts a refusal.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { BIN, mkRepo, real, readJson, runDirOf, writeJson } from '../helpers.mjs';
import { sessionFolderName } from '../../src/sessions.mjs';

const made = [];
const mk = (o) => { const r = mkRepo(o); made.push(r.dir, r.home); return r; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function start(repo, session, cwd, env) {
  const r = real(repo, ['start', '--preset', 'feature', '--request', 'ship ' + session, '--session', session], env, cwd);
  assert.equal(r.code, 0, r.stdout);
  return r.out.run_id;
}
const hookStop = (repo, session, cwd, env) => real(repo, ['gate', 'stop', '--session', session, '--cwd', cwd || repo.dir], env, cwd);
const statusOf = (repo, id) => readJson(path.join(runDirOf(repo, id), 'state.json')).status;
const packOf = (repo, id) => { try { return readJson(path.join(runDirOf(repo, id), 'owner-pack.json')); } catch { return null; } };
const res = (a, o) => ({ schema: 'it-result/1', stage: 'build-it', run_id: a, slice_id: null, verdicts: [], ...o });

function building(repo, session) {
  const a = start(repo, session);
  assert.equal(real(repo, ['next', '--run', a]).code, 0);
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
  return a;
}

test('CP03 R4-S1-H8 run-level needs_human with no question, blocked or failed with no reason are refused; the run stays gated', () => {
  const repo = mk();
  const a = building(repo, 'S');
  const r = path.join(repo.dir, 'results', 'r.json');
  const cases = [
    [{ status: 'needs_human', exit_code: 2 }, 'NEEDS_HUMAN_WITHOUT_QUESTION'],
    [{ status: 'blocked', exit_code: 3 }, 'BLOCK_REASON_REQUIRED'],
    [{ status: 'failed', exit_code: 1 }, 'FAIL_REASON_REQUIRED'],
    [{ status: 'blocked', exit_code: 3, reason: '   ' }, 'BLOCK_REASON_REQUIRED'],
    [{ status: 'failed', exit_code: 1, reason: '' }, 'FAIL_REASON_REQUIRED'],
    // a questions file that yields nothing the pack accepts is no question
    [{ status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/empty-q.json' } }, 'NEEDS_HUMAN_WITHOUT_QUESTION'],
  ];
  writeJson(path.join(repo.dir, 'results', 'empty-q.json'), { questions: [{ kind: 'ratify', text: '  ' }] });
  for (const [o, want] of cases) {
    writeJson(r, res(a, o));
    const out = real(repo, ['record', '--run', a, '--result', 'results/r.json']);
    assert.equal(out.code, 1, JSON.stringify(o) + ': ' + out.stdout);
    assert.equal(out.out.outcome, want, JSON.stringify(o));
    assert.equal(statusOf(repo, a), 'BUILDING', JSON.stringify(o) + ' left the status alone');
  }
  // one hook stop after all of them (each stop without progress counts toward patience)
  const hook = hookStop(repo, 'S');
  assert.equal(hook.out.outcome, 'STOP_REFUSED', hook.stdout);
  assert.equal(hook.out.open.length, 10, 'the board still has its 10 open rows');
  assert.equal(packOf(repo, a), null, 'no pack was written by a refused record');
});

test('CP03 R4-S1-H8 with a reason, BLOCKED and FAILED record it in state and events; FAILED then escalates only through an owner-pack question', () => {
  const repo = mk();
  const a = building(repo, 'S');
  writeJson(path.join(repo.dir, 'results', 'b.json'), res(a, { status: 'blocked', exit_code: 3, reason: 'owner gate: the production flag is not set' }));
  const b = real(repo, ['record', '--run', a, '--result', 'results/b.json']);
  assert.equal(b.out.outcome, 'RECORDED', b.stdout);
  assert.equal(b.out.reason, 'owner gate: the production flag is not set');
  let st = readJson(path.join(runDirOf(repo, a), 'state.json'));
  assert.equal(st.status, 'BLOCKED');
  assert.deepEqual([st.status_reason.status, st.status_reason.reason], ['BLOCKED', 'owner gate: the production flag is not set']);
  const ev = fs.readFileSync(path.join(runDirOf(repo, a), 'events.jsonl'), 'utf8');
  assert.match(ev, /"event":"run_blocked".*production flag/);

  const c = building(repo, 'S2');
  writeJson(path.join(repo.dir, 'results', 'f.json'), res(c, { status: 'failed', exit_code: 1, reason: 'the build exited non-zero three times' }));
  assert.equal(real(repo, ['record', '--run', c, '--result', 'results/f.json']).code, 1);
  st = readJson(path.join(runDirOf(repo, c), 'state.json'));
  assert.equal(st.status, 'FAILED');
  assert.equal(st.status_reason.reason, 'the build exited non-zero three times');
  assert.match(fs.readFileSync(path.join(runDirOf(repo, c), 'events.jsonl'), 'utf8'), /"event":"run_failed".*non-zero three times/);
  // the reviewer's `gate escalate --reason "x y z"`: it now hands the run to the owner through the pack
  assert.equal(packOf(repo, c), null);
  const esc = real(repo, ['gate', 'escalate', '--run', c, '--reason', 'x y z']);
  assert.equal(esc.out.outcome, 'ESCALATED', esc.stdout);
  const pack = packOf(repo, c);
  assert.equal(pack.questions.length, 1, 'the escalation wrote one owner-pack question');
  assert.equal(pack.questions[0].kind, 'escalation');
  assert.match(pack.questions[0].text, /x y z.*recorded cause: the build exited non-zero three times/);
  assert.equal(esc.out.pack_question, pack.questions[0].n);
  assert.match(fs.readFileSync(path.join(runDirOf(repo, c), 'events.jsonl'), 'utf8'), /"event":"escalated".*"question":1/);
});

test('CP03 R4-S1-H8 legitimate callers keep working: needs_human with a question from INTAKE, and G-8 mid-run defaults from BUILDING', () => {
  const repo = mk();
  const a = start(repo, 'S');
  writeJson(path.join(repo.dir, 'results', 'q.json'), { questions: [{ kind: 'ratify', text: 'Ship the plan?', options: ['yes', 'no'], recommendation: 'yes', default: 'yes', reversible: true }] });
  writeJson(path.join(repo.dir, 'results', 'r.json'), res(a, { stage: 'plan-it', status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/q.json' } }));
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/r.json']).code, 2);
  assert.equal(statusOf(repo, a), 'NEEDS_HUMAN');
  // a second needs_human on a run that already waits is not a new transition
  writeJson(path.join(repo.dir, 'results', 'r2.json'), res(a, { stage: 'plan-it', status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/q.json' } }));
  assert.equal(real(repo, ['record', '--run', a, '--result', 'results/r2.json']).code, 2);
  // autonomy (G-8, X27): from BUILDING the question becomes a default and the run keeps going
  const b = building(repo, 'S2');
  writeJson(path.join(repo.dir, 'results', 'q2.json'), [{ kind: 'attended', text: 'Keep the legacy flag?', options: ['keep', 'drop'], recommendation: 'keep', default: 'keep', reversible: true }]);
  writeJson(path.join(repo.dir, 'results', 'r3.json'), res(b, { status: 'needs_human', exit_code: 2, pending_human: { questions_path: 'results/q2.json' } }));
  const m = real(repo, ['record', '--run', b, '--result', 'results/r3.json']);
  assert.equal(m.out.outcome, 'MIDRUN_QUESTION_REFUSED', m.stdout);
  assert.equal(statusOf(repo, b), 'BUILDING');
  assert.equal(hookStop(repo, 'S2').out.outcome, 'STOP_REFUSED');
});

// R4-S1-M8: the session registry is one file per run, so parallel starts never lose each other.
// R5-S1-M12: the folder is named by the digest of the exact session id; the pre-release single file kept the plain id
const regDir = (repo, s, root) => path.join(root || path.join(repo.home, '.do-it'), 'sessions', sessionFolderName(s));
const legacyFile = (repo, s, root) => path.join(root || path.join(repo.home, '.do-it'), 'sessions', s) + '.json';
const entries = (repo, s, root) => { try { return fs.readdirSync(regDir(repo, s, root)).filter((n) => n.endsWith('.json') && !n.startsWith('.')).map((n) => readJson(path.join(regDir(repo, s, root), n))); } catch { return []; } };

function spawnAsync(argv, opts) {
  return new Promise((resolve) => {
    const c = cp.spawn(process.execPath, argv, opts);
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ code, out }));
  });
}

function repoIn(parent, name, env) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  cp.execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  cp.execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: dir, env });
  cp.execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, env });
  return dir;
}

test('CP03 R4-S1-M8 8 parallel starts of one session give 8 registry entries, 20 times out of 20; each run is gated from the parent folder', async () => {
  const base = mk({ commit: true });
  const parent = path.join(base.home, 'par');
  fs.mkdirSync(parent);
  const userHome = path.join(base.home, 'uh');
  const env = { ...base.env, DO_IT_USER_HOME: userHome };
  const dirs = [];
  for (let i = 0; i < 8; i++) dirs.push(repoIn(parent, 'R' + i, env));
  const counts = [];
  for (let t = 0; t < 20; t++) {
    const session = 'race-' + t;
    const outs = await Promise.all(dirs.map((d) => spawnAsync([BIN, 'start', '--preset', 'feature', '--request', 'race ' + t, '--session', session, '--json'], { cwd: d, env })));
    for (const o of outs) {
      assert.equal(o.code, 0, o.out);
      assert.ok(!/session_registry_error/.test(o.out), o.out);
    }
    const ids = outs.map((o) => JSON.parse(o.out.trim().split('\n').pop()).run_id).sort();
    const got = entries(base, session, userHome).map((e) => e.run_id).sort();
    counts.push(got.length);
    assert.deepEqual(got, ids, 'trial ' + t + ': every start kept its entry');
  }
  assert.deepEqual(counts, Array(20).fill(8));
  // each run is gated from the parent folder (no repo): seed rows, then stop
  const session = 'race-19';
  for (const d of dirs) for (const id of fs.readdirSync(path.join(d, '.do-it', 'runs'))) {
    const st = readJson(path.join(d, '.do-it', 'runs', id, 'state.json'));
    if (st.owner && st.owner.session_id === session) assert.equal(real({ ...base, dir: d, env }, ['next', '--run', id], null, d).code, 0);
  }
  const stop = real({ ...base, env }, ['gate', 'stop', '--session', session, '--cwd', parent], null, parent);
  assert.equal(stop.out.outcome, 'STOP_REFUSED', stop.stdout);
  assert.equal(stop.out.refused_homes.length, 8, 'all 8 homes refuse');
  fs.rmSync(parent, { recursive: true, force: true });
});

test('CP03 R4-S1-M8 the pre-release single-file registry is still read and migrated; pruning removes only the stale run\'s file', () => {
  const repo = mk({ commit: true });
  const a = start(repo, 'mig');
  real(repo, ['next', '--run', a]);
  const doIt = fs.realpathSync(repo.doIt);
  // rewrite the registry in the old layout: sessions/mig.json with runs: [...], plus a dead entry
  fs.rmSync(regDir(repo, 'mig'), { recursive: true });
  writeJson(legacyFile(repo, 'mig'), { session_id: 'mig', runs: [{ run_id: a, home: doIt, root: fs.realpathSync(repo.dir) }, { run_id: 'r-gone', home: path.join(repo.home, 'nowhere', '.do-it') }] });
  const y = path.join(repo.home, 'Y');
  fs.mkdirSync(y);
  const stop = hookStop(repo, 'mig', y);
  assert.equal(stop.out.outcome, 'STOP_REFUSED', 'a legacy entry still gates: ' + stop.stdout);
  assert.ok(!fs.existsSync(legacyFile(repo, 'mig')), 'the old file is migrated away');
  assert.deepEqual(entries(repo, 'mig').map((e) => e.run_id), [a], 'the live entry is carried over, the dead one is not');
  // a second run of the session; when the first is concluded-away, only its own file goes
  const b = start(repo, 'mig');
  fs.rmSync(path.join(repo.doIt, 'runs', a), { recursive: true });
  hookStop(repo, 'mig', y);
  assert.deepEqual(entries(repo, 'mig').map((e) => e.run_id), [b]);
});

// R4-S1-M7: a broken registry, or a broken other home, never opens the gate for the cwd's own run.
test('CP03 R4-S1-M7 a garbled, directory or unreadable registry is reported; the cwd run stays refused', () => {
  const repo = mk({ commit: true });
  const userHome = path.join(repo.home, 'uh');
  const env = { DO_IT_USER_HOME: userHome };
  const a = start(repo, 'reg-1', null, env);
  assert.equal(real(repo, ['next', '--run', a], env).code, 0);
  // many stops without progress follow: keep patience out of the way (it is tested in T-S1-05/10)
  writeJson(path.join(repo.doIt, 'settings.json'), { stop_gate: { patience: 50 } });
  assert.equal(hookStop(repo, 'reg-1', null, env).out.outcome, 'STOP_REFUSED');
  const legacy = path.join(userHome, 'sessions', 'reg-1.json');
  const dir = path.join(userHome, 'sessions', sessionFolderName('reg-1'));
  const check = (label) => {
    const r = hookStop(repo, 'reg-1', null, env);
    assert.equal(r.code, 1, label + ': ' + r.stdout);
    assert.equal(r.out.outcome, 'STOP_REFUSED', label);
    assert.equal(r.out.run_id, a, label);
    assert.ok(Array.isArray(r.out.registry_unreadable) && r.out.registry_unreadable.length, label + ' is reported: ' + r.stdout);
    return r;
  };
  // the reviewer's three, on the pre-release file name
  fs.writeFileSync(legacy, '{"session_id":"reg-1","runs":[');
  check('garbled legacy file');
  fs.rmSync(legacy); fs.mkdirSync(legacy);
  check('legacy path is a directory');
  fs.rmSync(legacy, { recursive: true }); fs.writeFileSync(legacy, '{}'); fs.chmodSync(legacy, 0o000);
  check('legacy file chmod 000');
  fs.chmodSync(legacy, 0o644); fs.rmSync(legacy);
  // the same on the per-run layout
  const own = fs.readdirSync(dir).filter((n) => n.endsWith('.json'))[0];
  fs.writeFileSync(path.join(dir, 'r-bad.json'), '{"session_id":"reg-1","run_id":');
  check('garbled run file');
  fs.rmSync(path.join(dir, 'r-bad.json'));
  fs.chmodSync(dir, 0o000);
  check('session folder chmod 000');
  fs.chmodSync(dir, 0o755);
  fs.renameSync(dir, dir + '.moved'); fs.writeFileSync(dir, 'x');
  check('session folder replaced by a file');
  fs.rmSync(dir); fs.renameSync(dir + '.moved', dir);
  assert.ok(fs.existsSync(path.join(dir, own)));
});

test('CP03 R4-S1-M7 another home that cannot be evaluated is listed in unreadable_homes; a garbled board there fails closed', () => {
  const repo = mk({ commit: true });
  const userHome = path.join(repo.home, 'uh');
  const env = { DO_IT_USER_HOME: userHome };
  const a = start(repo, 'xh-1', null, env);
  assert.equal(real(repo, ['next', '--run', a], env).code, 0);
  // home Y: a second repo with a run of the same session
  const yDir = path.join(repo.home, 'Y');
  fs.mkdirSync(yDir);
  cp.execFileSync('git', ['init', '-q', '-b', 'main', yDir]);
  const y = { ...repo, dir: yDir, doIt: path.join(yDir, '.do-it') };
  const b = start(y, 'xh-1', yDir, env);
  assert.equal(real(y, ['next', '--run', b], env, yDir).code, 0);
  // the reviewer's case: Y's finish-line.json garbled -> the stop from X is still refused
  const yfl = path.join(yDir, '.do-it', 'finish-line.json');
  const good = fs.readFileSync(yfl, 'utf8');
  fs.writeFileSync(yfl, '<<<<<<< HEAD\n' + good);
  let r = hookStop(repo, 'xh-1', null, env);
  assert.equal(r.out.outcome, 'STOP_REFUSED', r.stdout);
  assert.equal(r.out.run_id, a, 'the cwd run answers first');
  assert.ok(r.out.refused_homes.includes(fs.realpathSync(y.doIt)), 'a garbled board fails closed for its own run too');
  // close every row of X's run: X allows, Y (garbled board) still refuses, so the stop is refused
  const xfl = path.join(repo.doIt, 'finish-line.json');
  const fl = readJson(xfl);
  fs.writeFileSync(path.join(repo.dir, 'ev.txt'), 'x\n');
  for (const row of fl.rows) if (row.run_id === a) { row.state = 'DONE'; row.evidence = 'ev.txt'; }
  writeJson(xfl, fl);
  r = hookStop(repo, 'xh-1', null, env);
  assert.equal(r.out.outcome, 'STOP_REFUSED', r.stdout);
  assert.equal(r.out.run_id, b);
  assert.match(r.out.reason, /finish-line\.json cannot be read/);
  // Y's home throws while being evaluated (its run folder is read-only, so the refusal cannot be counted):
  // it is reported, and does not stop X from being gated
  fs.writeFileSync(yfl, good);
  for (const row of fl.rows) if (row.run_id === a) { row.state = 'OPEN'; row.evidence = null; }
  writeJson(xfl, fl);
  const yRun = path.join(yDir, '.do-it', 'runs', b);
  fs.chmodSync(yRun, 0o555);
  try {
    r = hookStop(repo, 'xh-1', null, env);
    assert.equal(r.out.outcome, 'STOP_REFUSED', r.stdout);
    assert.equal(r.out.run_id, a);
    // since R5-S1-M9 the error is contained per run: Y's run is reported as unwritable, with its home
    assert.equal(r.out.unwritable.length, 1, r.stdout);
    assert.equal(r.out.unwritable[0].home, fs.realpathSync(y.doIt));
    assert.equal(r.out.unwritable[0].run_id, b);
  } finally {
    fs.chmodSync(yRun, 0o755);
  }
});

// R4-L4: redaction never rewrites the protocol fields.
test('CP03 R4-L4 a .secrets value equal to STOP_REFUSED (or a status word) never redacts the outcome or the state', () => {
  const repo = mk({ commit: true });
  const a = start(repo, 'sec');
  assert.equal(real(repo, ['next', '--run', a]).code, 0);
  fs.mkdirSync(path.join(repo.dir, '.secrets'));
  fs.writeFileSync(path.join(repo.dir, '.secrets', 'token'), 'STOP_REFUSED\n');
  fs.writeFileSync(path.join(repo.dir, '.secrets', 'other'), 'BUILDING');
  fs.writeFileSync(path.join(repo.dir, '.secrets', 'real'), 'sk-live-0123456789abcdef');
  const r = hookStop(repo, 'sec');
  assert.equal(r.code, 1, r.stdout);
  assert.equal(r.out.outcome, 'STOP_REFUSED', r.stdout);
  assert.ok(!/REDACTED:token/.test(r.stdout), r.stdout);
  // a status word is never treated as a secret, so state.json keeps its status and stays readable
  assert.equal(real(repo, ['gate', 'advance', '--run', a, '--to', 'BUILDING']).out.outcome, 'ADVANCED');
  assert.equal(statusOf(repo, a), 'BUILDING');
  assert.equal(real(repo, ['status', '--run', a]).out.status, 'BUILDING');
  assert.equal(hookStop(repo, 'sec').out.outcome, 'STOP_REFUSED');
  // a real secret in a free-text field is still redacted
  writeJson(path.join(repo.dir, 'results', 'b.json'), res(a, { status: 'blocked', exit_code: 3, reason: 'the key sk-live-0123456789abcdef was revoked' }));
  const b = real(repo, ['record', '--run', a, '--result', 'results/b.json']);
  assert.equal(b.out.outcome, 'RECORDED', b.stdout);
  assert.equal(b.out.reason, 'the key [REDACTED:real] was revoked');
  assert.ok(!fs.readFileSync(path.join(runDirOf(repo, a), 'state.json'), 'utf8').includes('sk-live-'));
});

test('CP03 R4-L4 the protocol words cover every run status of the state schema', async () => {
  const { PROTOCOL_WORDS } = await import('../../src/redact.mjs');
  const schema = readJson(path.join(path.dirname(BIN), '..', 'schemas', 'do-it-state.1.schema.json'));
  for (const s of schema.properties.status.enum) assert.ok(PROTOCOL_WORDS.has(s), s);
  for (const s of ['STOP_REFUSED', 'STOP_ALLOWED']) assert.ok(PROTOCOL_WORDS.has(s), s);
});
