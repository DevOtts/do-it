import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { gateRowParse } from '../../../spine/src/gate-results.mjs';
import { HERE, cleanup, mkManifest, mkRepo, newRunId, synthKeys } from '../helpers.mjs';

after(cleanup);

test('T-A1-14 8 processes x 250 files append 4000 intact rows into one store', async () => {
  const N = 250;
  const files = Array.from({ length: N }, (_, i) => 'spec/f' + String(i).padStart(3, '0') + '.spec.js');
  const repo = mkRepo(Object.fromEntries(files.map((f) => [f, "test('x', () => {});\n"])));
  const runs = [];
  for (let i = 0; i < 8; i++) {
    const m = mkManifest(repo, { runId: newRunId() });
    synthKeys(repo, m, files);
    runs.push(m);
  }
  const driver = path.join(HERE, 'jest', 'concurrent-driver.cjs');
  await Promise.all(runs.map((m) => new Promise((resolve, reject) => {
    const c = cp.spawn(process.execPath, [driver, m.manifestFile, repo.dir, String(N)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error('driver exited ' + code + ': ' + err))));
  })));
  const lines = fs.readFileSync(path.join(repo.store, 'results.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 8 * N * 2);
  const seen = new Map();
  lines.forEach((line, pos) => {
    const row = gateRowParse(line);
    assert.ok(row, 'torn or corrupt line at ' + pos);
    assert.notEqual(row.type, 'run_end');
    seen.set(row.run_id + '\0' + row.file + '\0' + row.type, pos);
  });
  assert.equal(seen.size, 8 * N * 2, 'one start and one finish per (run, file)');
  for (const m of runs) {
    for (const f of files) {
      assert.ok(seen.get(m.runId + '\0' + f + '\0start') < seen.get(m.runId + '\0' + f + '\0finish'), 'start precedes finish for ' + f);
    }
  }
});
