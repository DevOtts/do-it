// T-S1-06 [REAL]: replay the stop gate against a copy of a real consumer's .do-it/ (X3: path from the env only).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, readJsonl, tmp } from '../helpers.mjs';

const PILOT = process.env.DO_IT_PILOT_DOIT;

function questionCount(home) {
  let n = 0;
  for (const id of fs.readdirSync(path.join(home, 'runs'))) {
    const f = path.join(home, 'runs', id, 'owner-pack.json');
    if (fs.existsSync(f)) n += readJson(f).questions.length;
  }
  return n;
}

function eventCount(home) {
  let n = 0;
  for (const id of fs.readdirSync(path.join(home, 'runs'))) {
    const f = path.join(home, 'runs', id, 'events.jsonl');
    if (fs.existsSync(f)) n += readJsonl(f).length;
  }
  return n;
}

test('T-S1-06 [REAL] a fresh session and the owning session both stop freely on a copy of the pilot board', (t) => {
  if (!PILOT || !fs.existsSync(path.join(PILOT, 'runs'))) {
    console.log('IMPLEMENTED-NOT-VERIFIED: DO_IT_PILOT_DOIT is not set to a consumer .do-it/ directory');
    t.skip('IMPLEMENTED-NOT-VERIFIED: DO_IT_PILOT_DOIT not set');
    return;
  }
  const home = path.join(tmp('dit-replay-'), 'do-it-home');
  fs.cpSync(PILOT, home, { recursive: true });
  try {
    const states = fs.readdirSync(path.join(home, 'runs')).map((id) => readJson(path.join(home, 'runs', id, 'state.json')));
    assert.equal(states.length, 4, 'the pilot has 4 runs');
    assert.ok(states.every((s) => s.status === 'PARKED'), 'all 4 are PARKED');
    assert.equal(states.filter((s) => !s.owner).length, 1, '1 legacy run with no owner');
    assert.equal(states.filter((s) => s.owner && !s.owner.session_id).length, 2, '2 runs with session null');
    const owned = states.filter((s) => s.owner && s.owner.session_id);
    assert.equal(owned.length, 1, '1 owned run');

    const repo = mkRepo();
    const env = { DO_IT_HOME: home };
    const cwd = tmp('dit-replay-cwd-');
    const questionsBefore = questionCount(home);
    const eventsBefore = eventCount(home);
    const results = [];
    const fresh = real(repo, ['gate', 'stop', '--session', 'fresh-session-id', '--cwd', cwd], env, cwd);
    results.push(fresh);
    const owner = real(repo, ['gate', 'stop', '--session', owned[0].owner.session_id, '--cwd', cwd], env, cwd);
    results.push(owner);
    // a host that gives no session at all, from inside the owner's recorded cwd or elsewhere
    results.push(real(repo, ['gate', 'stop', '--cwd', cwd], env, cwd));
    for (const r of results) {
      assert.equal(r.code, 0, r.stdout);
      assert.equal(r.out.outcome, 'STOP_ALLOWED');
    }
    assert.equal(fresh.out.owned, false);
    assert.equal(owner.out.owned, true);
    assert.equal(results.filter((r) => r.out.outcome === 'STOP_REFUSED').length, 0, 'zero refusals');
    assert.equal(questionCount(home), questionsBefore, 'zero new pack questions');
    assert.equal(eventCount(home), eventsBefore, 'the stops wrote nothing');
  } finally {
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
  }
});
