import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { FAKE_DECIDE_CMD, FILTER, cleanup, fakeResolver, minimalManifest, mkRepo, tmpDir } from '../helpers.mjs';

after(cleanup);
const filter = createRequire(import.meta.url)(FILTER);

const FILES = Array.from({ length: 30 }, (_, i) => 'spec/s' + String(i + 1).padStart(2, '0') + '.spec.js');

test('T-A1-12 any decide failure (exit 1, timeout, malformed list, no list) runs all 30 files and says so (G-1)', async () => {
  const repo = mkRepo(Object.fromEntries(FILES.map((f) => [f, "test('x', () => {});\n"])));
  const paths = FILES.map((f) => path.join(repo.dir, f));
  const scenarios = [
    ['exit1', {}],
    ['sleep', { FAKE_DECIDE_SLEEP_MS: '5000', DO_IT_GATE_DECIDE_TIMEOUT_MS: '400' }],
    ['malformed', {}],
    ['nofile', {}],
  ];
  for (const [mode, extra] of scenarios) {
    const dir = tmpDir('a1-run-');
    minimalManifest(dir);
    const logs = [];
    const out = await filter.filterPaths(paths, {
      env: { ...process.env, DO_IT_GATE_MANIFEST: path.join(dir, 'manifest.json'), DO_IT_GATE_DECIDE: FAKE_DECIDE_CMD, FAKE_DECIDE_MODE: mode, ...extra },
      cwd: repo.dir, context: { resolver: fakeResolver(false), config: {}, version: '29.7.0' }, log: (m) => logs.push(m),
    });
    assert.equal(out.filtered.length, 30, mode + ': every path runs');
    assert.deepEqual(out.filtered.map((x) => x.test), paths, mode + ': in order, none dropped');
    assert.ok(logs.includes('[do-it-gate] decide failed: running every file'), mode + ': ' + logs.join('|'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'selected.json'), 'utf8')).sent, 30);
  }
});
