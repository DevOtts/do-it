// N1 (CP-01): the exact 1.0.5 settings shape, in the repo layout (hosts/ beside core/).
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = ['eng', 'ine'].join('');
function doctor(settings) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'n1-repo-')));
  try {
    cp.execFileSync('git', ['init', '-q', dir]);
    fs.mkdirSync(path.join(dir, '.do-it'));
    fs.writeFileSync(path.join(dir, '.do-it', 'settings.json'), JSON.stringify(settings));
    const env = { ...process.env, HOME: dir };
    for (const k of Object.keys(env)) if (k.startsWith('DO_IT_')) delete env[k];
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'core', 'spine', 'do-it.mjs'), 'doctor', '--json'], { cwd: dir, env, encoding: 'utf8' });
    return { code: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop()), raw: r.stdout };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('N1 repo layout: backend local + dormant state.<host> block is valid (1.0.5 shape)', () => {
  const r = doctor({ state: { backend: 'local', [HOST]: { blobs: 'rows' } } });
  assert.equal(r.code, 0, r.raw);
});
test('N1 repo layout: a bad dormant block is refused by the host schema; an unknown host is refused naming it', () => {
  const bad = doctor({ state: { backend: 'local', [HOST]: { blobs: 'bogus' } } });
  assert.equal(bad.code, 1, bad.raw);
  assert.ok(bad.out.errors.some((e) => e.pointer === '/state/' + HOST + '/blobs'));
  const unk = doctor({ state: { backend: 'local', nohost: { x: 1 } } });
  assert.equal(unk.code, 1, unk.raw);
  assert.ok(unk.out.errors.some((e) => e.pointer === '/state/nohost' && e.message.includes('"nohost"')));
});
