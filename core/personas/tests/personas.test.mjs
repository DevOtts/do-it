import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const PERSONAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINT = path.join(PERSONAS, 'lint-personas.mjs');
const run = (args) => { const r = cp.spawnSync(process.execPath, [LINT, ...args], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dit-pers-'));
const persona = (dir, name, fm) => fs.writeFileSync(path.join(dir, name + '.md'), `---\n${fm}\n---\n# ${name}\n`);
const base = (name, tier = 'T2') => `name: ${name}\ndescription: d\ntier: ${tier}\ntools: [read]\ndeny: [write]`;

test('T-P1-05 [REAL] real persona files carry the contract frontmatter', () => {
  const r = run([PERSONAS]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /personas: 10/);
  for (const f of fs.readdirSync(PERSONAS).filter((x) => x.endsWith('.md'))) {
    const t = fs.readFileSync(path.join(PERSONAS, f), 'utf8');
    for (const k of ['name', 'description', 'tier', 'tools', 'deny']) assert.match(t, new RegExp(`^${k}: \\S`, 'm'), `${f} ${k}`);
    assert.match(t, new RegExp(`^name: ${f.replace('.md', '')}$`, 'm'));
  }
});

test('T-P1-06 missing frontmatter field', () => {
  const d = tmp();
  persona(d, 'builder', 'name: builder\ndescription: d\ntier: T2\ntools: [read]');
  const r = run([d]);
  assert.equal(r.code, 1);
  assert.match(r.out, /PERSONA_FIELD_MISSING deny builder\.md/);
});

test('T-P1-07 [REAL] persona tiers match RUN-POLICY in the real contract', () => {
  const r = run([PERSONAS]);
  assert.equal(r.code, 0, r.out);
  const want = { conductor: 'T2', intake: 'T3', planner: 'T1', builder: 'T2', verifier: 'T2', reviewer: 'T2', runner: 'T3', deployer: 'code', concluder: 'T2', reconciler: 'T2' };
  for (const [k, v] of Object.entries(want)) assert.match(r.out, new RegExp(`tier ${k} ${v}\\b`));
});

test('T-P1-08 persona tier drift', () => {
  const d = tmp();
  persona(d, 'builder', base('builder', 'T1') + '\nt1_reason: because');
  const r = run([d]);
  assert.equal(r.code, 1);
  assert.match(r.out, /TIER_POLICY_MISMATCH builder expected T2 got T1/);
});

test('T-P1-09 T1 without a written reason', () => {
  const d = tmp();
  persona(d, 'planner', base('planner', 'T1'));
  const r = run([d]);
  assert.equal(r.code, 1);
  assert.match(r.out, /T1_REASON_MISSING planner/);
  persona(d, 'planner', base('planner', 'T1') + '\nt1_reason: ambiguity resolution needs the strongest tier');
  assert.equal(run([d]).code, 0);
});

test('T-P1-19 persona changed after lint', () => {
  const d = tmp();
  for (const f of fs.readdirSync(PERSONAS).filter((x) => x.endsWith('.md'))) fs.copyFileSync(path.join(PERSONAS, f), path.join(d, f));
  assert.equal(run([d, '--stamp']).code, 0);
  assert.equal(run([d, '--load']).code, 0);
  fs.appendFileSync(path.join(d, 'builder.md'), 'x');
  const r = run([d, '--load']);
  assert.equal(r.code, 1);
  assert.match(r.out, /LINT_STALE builder/);
  assert.equal((r.out.match(/LINT_STALE/g) || []).length, 1);
});

test('capability words are neutral and the visual tier is runner-only', () => {
  const d = tmp();
  persona(d, 'builder', 'name: builder\ndescription: d\ntier: T2\ntools: [Bash]\ndeny: [write]\nvisual_tier: T2');
  const r = run([d]);
  assert.match(r.out, /CAPABILITY_NOT_NEUTRAL Bash/);
  assert.match(r.out, /VISUAL_TIER_NOT_ALLOWED builder/);
});
