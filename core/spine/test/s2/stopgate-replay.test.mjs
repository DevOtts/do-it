// T-S1-06 [REAL]: replay the stop gate against a copy of a real consumer's .do-it/ (X3: path from the env only).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { mkRepo, real, readJson, readJsonl, tmp } from '../helpers.mjs';
import { NON_GATING_STATUSES } from '../../src/state.mjs';

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
    // The pilot is live and gains runs (CP-03 R2-L11), so the case asserts the contract's intent, not a count:
    // every run on the copy is in a status that does not gate, and the copy still holds at least the four
    // original categories (a legacy run with no owner, two runs whose session is null, one owned run).
    const states = fs.readdirSync(path.join(home, 'runs'))
      .filter((id) => fs.existsSync(path.join(home, 'runs', id, 'state.json')))
      .map((id) => readJson(path.join(home, 'runs', id, 'state.json')));
    assert.ok(states.length >= 4, 'the pilot has at least 4 runs, found ' + states.length);
    for (const s of states) assert.ok(NON_GATING_STATUSES.includes(s.status), s.run_id + ' is ' + s.status + ', which gates');
    assert.ok(states.filter((s) => !s.owner).length >= 1, 'at least 1 legacy run with no owner');
    assert.ok(states.filter((s) => s.owner && !s.owner.session_id).length >= 2, 'at least 2 runs with session null');
    const owned = states.filter((s) => s.owner && s.owner.session_id);
    assert.ok(owned.length >= 1, 'at least 1 owned run');
    const ownerSessions = [...new Set(owned.map((s) => s.owner.session_id))];

    const repo = mkRepo();
    const env = { DO_IT_HOME: home };
    const cwd = tmp('dit-replay-cwd-');
    const questionsBefore = questionCount(home);
    const eventsBefore = eventCount(home);
    const results = [];
    const fresh = real(repo, ['gate', 'stop', '--session', 'fresh-session-id', '--cwd', cwd], env, cwd);
    results.push(fresh);
    // every owning session stops freely (each owns only runs that do not gate)
    const owners = ownerSessions.map((sid) => real(repo, ['gate', 'stop', '--session', sid, '--cwd', cwd], env, cwd));
    results.push(...owners);
    // a host that gives no session at all, from inside the owner's recorded cwd or elsewhere
    results.push(real(repo, ['gate', 'stop', '--cwd', cwd], env, cwd));
    for (const r of results) {
      assert.equal(r.code, 0, r.stdout);
      assert.equal(r.out.outcome, 'STOP_ALLOWED');
    }
    assert.equal(fresh.out.owned, false);
    for (const o of owners) assert.equal(o.out.owned, true, o.stdout);
    assert.equal(results.filter((r) => r.out.outcome === 'STOP_REFUSED').length, 0, 'zero refusals');
    assert.equal(questionCount(home), questionsBefore, 'zero new pack questions');
    assert.equal(eventCount(home), eventsBefore, 'the stops wrote nothing');
  } finally {
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
  }
});
