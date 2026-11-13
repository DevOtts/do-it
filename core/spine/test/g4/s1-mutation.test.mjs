import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CORE_DIR, baseEnv, tmp } from '../helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Copies core/{spine/src,schemas} into a temp tree, optionally strips the gates defaults, then runs the
// agreement check and `--set gates.on_push=x` against that copy in a child process.
function probe(mutate) {
  const dir = tmp('dit-mut-');
  fs.cpSync(CORE_DIR, path.join(dir, 'core'), { recursive: true, filter: (src) => !/[\\/](test|tests|\.git)([\\/]|$)/.test(src) && !src.endsWith('do-it.mjs') });
  const sm = path.join(dir, 'core', 'spine', 'src', 'settings.mjs');
  if (mutate) {
    const text = fs.readFileSync(sm, 'utf8');
    const start = text.indexOf('  gates: {');
    const end = text.indexOf('\n};', start);
    assert.ok(start > 0 && end > start, 'gates defaults block not found');
    fs.writeFileSync(sm, text.slice(0, start) + text.slice(end + 1));
  }
  const repoHome = tmp('dit-mut-home-');
  const script = path.join(dir, 'run.mjs');
  fs.writeFileSync(script, `
import { SETTINGS_DEFAULTS } from ${JSON.stringify(sm)};
import { loadSchemaFile, validateSchema } from ${JSON.stringify(path.join(dir, 'core/spine/src/schema.mjs'))};
import { cliMain } from ${JSON.stringify(path.join(dir, 'core/spine/src/cli.mjs'))};
import { gatesAgreement } from ${JSON.stringify(path.join(HERE, 'agreement.mjs'))};
const problems = gatesAgreement(SETTINGS_DEFAULTS, loadSchemaFile('settings.schema.json'), validateSchema);
const r = cliMain(['doctor', '--set', 'gates.on_push=x', '--json'], { cwd: ${JSON.stringify(repoHome)}, env: { ...process.env, HOME: ${JSON.stringify(repoHome)} } });
console.log(JSON.stringify({ problems: problems.length, outcome: JSON.parse(r.stdout).outcome }));
`);
  const r = cp.spawnSync(process.execPath, [script], { encoding: 'utf8', env: baseEnv(repoHome) });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(repoHome, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('T-S1-14 agreement guard fails on a copy without the gates defaults and passes on the original', () => {
  const bad = probe(true);
  assert.ok(bad.problems > 0, 'agreement check must fail on the mutated copy');
  assert.equal(bad.outcome, 'SETTINGS_UNKNOWN_KEY');
  const good = probe(false);
  assert.equal(good.problems, 0);
  assert.equal(good.outcome, 'DOCTOR_OK');
});
