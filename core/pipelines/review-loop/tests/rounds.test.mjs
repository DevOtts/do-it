import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { decide, processRound, recordRoundResult, startRound } from '../controller.mjs';
import { amend, editRow, freezeRoteiro, marksForRound, markCheck, readRoteiro, sha256 } from '../fingerprint.mjs';
import { classify, writeBacklog } from '../severity.mjs';
import { files, round, tmp } from './helpers.mjs';

const ctx = { reviewer: 'c1', runner: 'c2', builder: 'c3' };

test('T-P4-02 roteiro is frozen at round 1', () => {
  const d = tmp();
  const rows = [{ id: 'c1', text: 'login works', refs: [] }, { id: 'c2', text: 'logout works', refs: [] }];
  const ro = freezeRoteiro(d, rows);
  assert.match(ro.sha256, /^[0-9a-f]{64}$/);
  const canon = JSON.stringify(rows.map((r) => ({ id: r.id, text: r.text, refs: r.refs })));
  assert.equal(ro.sha256, sha256(canon));
  const before = fs.readFileSync(path.join(d, 'roteiro.json'));
  assert.throws(() => editRow(d, 'c1', { text: 'changed' }), (e) => e.outcome === 'ROTEIRO_FROZEN' && e.exit === 1);
  assert.throws(() => freezeRoteiro(d, rows), (e) => e.outcome === 'ROTEIRO_FROZEN');
  assert.deepEqual(fs.readFileSync(path.join(d, 'roteiro.json')), before);
});

test('T-P4-03 [REAL] a check changed on disk invalidates its mark', () => {
  const rev = tmp(); const repo = tmp('dit-repo-');
  fs.writeFileSync(path.join(repo, 'app.txt'), 'v1');
  fs.writeFileSync(path.join(repo, 'other.txt'), 'stable');
  freezeRoteiro(rev, [{ id: 'k1', text: 'app renders', refs: ['app.txt'] }, { id: 'k2', text: 'other renders', refs: ['other.txt'] }]);
  markCheck(rev, repo, 1, 'k1', 'LOCKED');
  markCheck(rev, repo, 1, 'k2', 'LOCKED');
  assert.deepEqual(marksForRound(rev, repo).map((m) => m.status), ['LOCKED', 'LOCKED']);
  fs.writeFileSync(path.join(repo, 'app.txt'), 'v2');
  const m = marksForRound(rev, repo);
  assert.equal(m[0].status, 're-run - changed since round 1');
  assert.equal(m[1].status, 'LOCKED');
});

test('T-P4-04 severity classes route correctly', () => {
  const rev = tmp();
  const r = round(1, { b: 1, m: 1, mi: 2, ni: 1 });
  const c = classify(r.findings);
  assert.equal(c.loopCount, 2);
  const created = writeBacklog(rev, r.findings, 1);
  assert.equal(created.length, 3);
  for (const f of created) assert.ok(f.startsWith(path.join(rev, 'backlog')));
  const nit = created.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))).filter((x) => x.severity === 'nit');
  assert.equal(nit.length, 1);
  assert.deepEqual(nit[0].tags, ['nit']);
});

test('T-P4-14 author, runner and builder are separate', () => {
  const rev = tmp();
  for (const bad of [{ reviewer: 'c1', runner: 'c1', builder: 'c3' }, { reviewer: 'c1', runner: 'c2', builder: 'c2' }]) {
    assert.throws(() => startRound(rev, 1, bad), (e) => e.outcome === 'CONTEXT_NOT_SEPARATE' && e.exit === 1);
  }
  assert.deepEqual(files(rev), []); // the round did not start: nothing written
  assert.deepEqual(startRound(rev, 1, ctx), { started: true, round: 1 });
});

test('T-P4-18 amendments do not touch the frozen fingerprint', () => {
  const d = tmp();
  const ro = freezeRoteiro(d, [{ id: 'a', text: 'x' }]);
  const am0 = ro.amendments_sha256;
  const after = amend(d, [{ id: 'n1', text: 'new', origin: 'build' }, { id: 'n2', text: 'new2', origin: 'build' }]);
  assert.equal(after.sha256, ro.sha256);
  assert.notEqual(after.amendments_sha256, am0);
  assert.equal(readRoteiro(d).amendments.length, 2);
  assert.throws(() => amend(d, [{ id: 'z', text: 'q', origin: 'bogus' }]), (e) => e.outcome === 'AMENDMENT_ORIGIN_INVALID');
  assert.throws(() => editRow(d, 'a', { text: 'y' }), (e) => e.outcome === 'ROTEIRO_FROZEN');
});

test('T-P4-19 [REAL] round result tampered after the runner wrote it', () => {
  const rev = tmp();
  startRound(rev, 1, ctx);
  recordRoundResult(rev, 1, round(1, { m: 2 }));
  assert.equal(processRound(rev, 1).decision, 'FIXING');
  startRound(rev, 2, ctx);
  const file = recordRoundResult(rev, 2, round(2, { m: 1 }));
  const j = JSON.parse(fs.readFileSync(file, 'utf8')); j.findings = []; // hide the finding
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
  assert.throws(() => processRound(rev, 2), (e) => e.outcome === 'ROUND_RESULT_TAMPERED' && e.exit === 1);
  const st = JSON.parse(fs.readFileSync(path.join(rev, 'review-state.json'), 'utf8'));
  assert.equal(st.decisions[2], undefined); // not counted, no exit produced
  assert.equal(st.rounds[2], undefined);
});

test('T-P4-20 resume gives the same decision and no duplicate cards', () => {
  const rev = tmp();
  const feed = (n, spec) => { startRound(rev, n, ctx); recordRoundResult(rev, n, round(n, spec)); return processRound(rev, n); };
  feed(1, { m: 3, mi: 1, fps: ['f-1', 'f-2', 'f-3'] });
  const d2 = feed(2, { m: 1, fps: ['f-1'] });
  assert.equal(d2.decision, 'RAISE_TIER'); // f-1 recurred; state now has raise_used
  // "restart": a fresh process reads only the files
  startRound(rev, 3, ctx);
  recordRoundResult(rev, 3, round(3, { mi: 2 }));
  const a = processRound(rev, 3);
  const cards1 = files(path.join(rev, 'backlog')).length;
  const b = processRound(rev, 3);
  assert.deepEqual(a, b);
  assert.equal(files(path.join(rev, 'backlog')).length, cards1);
  assert.equal(a.exit, 'CONVERGED_WITH_MINORS');
  assert.equal(a.raise_used, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(rev, 'review-state.json'), 'utf8')).raise_used, true);
  assert.throws(() => startRound(rev, 4, ctx), (e) => e.outcome === 'ROUND_AFTER_EXIT');
  // replaying an already-decided round from its recorded history agrees with decide()
  assert.equal(decide([round(1, { m: 3, mi: 1, fps: ['f-1', 'f-2', 'f-3'] }), round(2, { m: 1, fps: ['f-1'] })]).decision, 'RAISE_TIER');
});
