import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO, cli, lib, listFiles, tmp, writeSpec } from './helpers.mjs';

const BUILDER = lib('brief-builder.mjs');
const base = { run_id: 'run-1', slice_id: 'sl-1', preamble: 'stable preamble', run_constant: 'run constant', slice: 'do the thing' };

test('T-P2-03 G-11 brief cites a path that does not exist', () => {
  const home = tmp();
  const root = tmp();
  const spec = writeSpec({ ...base, root, home, refs: { paths: ['docs/does-not-exist.md'] } });
  const r = cli(BUILDER, ['--spec', spec]);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'BRIEF_REF_INVALID');
  assert.equal(r.out.path, 'docs/does-not-exist.md');
  assert.deepEqual(listFiles(path.join(home, 'runs')), []);
});

test('T-P2-04 G-11 brief over the limit', () => {
  const home = tmp();
  const root = tmp();
  const spec = writeSpec({ run_id: 'run-1', slice_id: 'sl-1', root, home, slice: 'x'.repeat(40000), refs: {} });
  const r = cli(BUILDER, ['--spec', spec]);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'BRIEF_TOO_LARGE');
  assert.equal(r.out.estimate_tokens, 10000);
  assert.equal(r.out.limit_tokens, 8000);
  assert.equal(r.out.largest_section, 'slice');
  assert.deepEqual(listFiles(path.join(home, 'runs')).filter((f) => f.endsWith('.md')), []);
});

test('T-P2-05 G-11 [REAL] real brief with real references', () => {
  const home = tmp();
  const spec = writeSpec({ ...base, root: REPO, home, refs: { paths: ['delivery/CONTRACT.md', 'docs/03-data-model-and-contract.md'], ids: ['T-P2-01'] } });
  const r = cli(BUILDER, ['--spec', spec]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(r.out.validated_references, 3);
  assert.equal(r.out.estimated, true);
  assert.ok(r.out.estimate_tokens <= 8000);
  assert.ok(fs.existsSync(r.out.file));
  const txt = fs.readFileSync(r.out.file, 'utf8');
  // fixed order: preamble, run-constant, slice, references
  const order = ['## preamble', '## run-constant', '## slice sl-1', '## references'].map((h) => txt.indexOf(h));
  assert.ok(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), 'section order');
  // an id nobody defines is invalid
  const bad = cli(BUILDER, ['--spec', writeSpec({ ...base, root: REPO, home: tmp(), refs: { ids: ['T-P2-99'] } })]);
  assert.equal(bad.out.outcome, 'BRIEF_REF_INVALID');
});

test('T-P2-06 G-11 G-7 [REAL] symlink escapes the repo root', () => {
  const root = tmp('dit-root-');
  const outside = tmp('dit-outside-');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside the root');
  fs.mkdirSync(path.join(root, 'docs'));
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'docs', 'link.md'));
  const home = tmp();
  const r = cli(BUILDER, ['--spec', writeSpec({ ...base, root, home, refs: { paths: ['docs/link.md'] } })]);
  assert.equal(r.code, 1);
  assert.equal(r.out.outcome, 'BRIEF_REF_OUTSIDE_ROOT');
  assert.deepEqual(listFiles(path.join(home, 'runs')), []);
  // lexical .. escape as well
  const r2 = cli(BUILDER, ['--spec', writeSpec({ ...base, root, home, refs: { paths: ['../' + path.basename(outside) + '/secret.txt'] } })]);
  assert.equal(r2.out.outcome, 'BRIEF_REF_OUTSIDE_ROOT');
});
