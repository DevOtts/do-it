import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';
import { cleanup, finishFiles, mkFixtureRepo, needReal, readJson, runJest, runListFiles, sNN } from '../helpers.mjs';

after(cleanup);

const GUARDS = ['test/guards/g1.spec.ts', 'test/guards/g2.spec.ts'];
const stalled = (file) => (ctx) => ctx.rows().some((r) => r.type === 'start' && r.file === file);
const noDup = (res) => {
  const seen = new Set();
  for (const r of res.rows.filter((x) => x.type === 'start' || x.type === 'finish')) {
    const k = r.type + r.file + r.leg + r.run_id;
    assert.ok(!seen.has(k), 'duplicate ' + k);
    seen.add(k);
  }
};

async function killAtS19(repo, real) {
  const a = await runJest(repo, { real, args: ['--runInBand'], env: { FIXTURE_STALL: 's19' }, killWhen: stalled('test/s19.spec.ts') });
  assert.equal(a.killed, true);
  assert.equal(a.finishes.length, 20, 'g1, g2 and s01 to s18 finished before the kill');
  return a;
}

test('T-A1-08 [REAL] SIGKILL after 20 finish rows then resume: 12 files run, 18 reused; killed again at s19 the third run still lists s19 and 11 others', async (t) => {
  const real = needReal(t);
  if (!real) return;
  // scenario one: kill once, resume to completion
  const repo = mkFixtureRepo(real);
  await killAtS19(repo, real);
  const b = await runJest(repo, { real, args: ['--runInBand'], resume: true });
  assert.equal(b.code, 0, b.stderr);
  assert.deepEqual(runListFiles(b), [...GUARDS, ...sNN(19, 28)].sort());
  assert.equal(readJson(path.join(b.runDir, 'decision.json')).files.filter((d) => d.decision === 'reuse').length, 18);
  assert.equal(b.finishes.length, 12);
  noDup(b);

  // scenario two: the resumed run is killed too (s19 starts again); the next resume still owes s19
  const repo2 = mkFixtureRepo(real);
  await killAtS19(repo2, real);
  const c = await runJest(repo2, { real, args: ['--runInBand'], resume: true, env: { FIXTURE_STALL: 's19' }, killWhen: stalled('test/s19.spec.ts') });
  assert.equal(c.killed, true);
  assert.deepEqual(finishFiles(c), GUARDS, 'the second run finished only the NEVER set before the kill');
  const d = await runJest(repo2, { real, args: ['--runInBand'], resume: true });
  assert.equal(d.code, 0, d.stderr);
  const list = runListFiles(d);
  const s19 = readJson(path.join(d.runDir, 'decision.json')).files.find((x) => x.file === 'test/s19.spec.ts');
  if (s19.decision === 'solo') {
    // the real decide (CONTRACT §4.5, M1, PRD-2 D14): two kills on one key make s19 SUSPECT_KILLER; it leaves the main
    // list for the solo invocation `gate run` makes after it, so the run still owes s19 and 11 others
    assert.equal(s19.why, 'suspect-killer');
    assert.equal(list.length, 11);
    assert.ok(!list.includes('test/s19.spec.ts'));
    assert.deepEqual([...list, s19.file].sort(), [...GUARDS, ...sNN(19, 28)].sort());
    assert.equal(d.finishes.length, 11);
  } else {
    assert.equal(list.length, 12);
    assert.ok(list.includes('test/s19.spec.ts'));
    assert.equal(d.finishes.length, 12);
  }
  noDup(d);
});
