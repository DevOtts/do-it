import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { generate, ingest, writeGate } from '../attended-gate.mjs';
import { evaluate } from '../ratchet.mjs';
import { lib, run, tmp } from './helpers.mjs';

test('T-P4-15 ratchet stays open without a test or a reason', () => {
  const repo = tmp('dit-repo-');
  const rows = [{ id: 'r1' }, { id: 'r2', test_path: 'tests/nope.test.mjs' }, { id: 'r3', cannot_automate: '   ' }];
  const res = evaluate(rows, repo);
  assert.deepEqual(res.open, ['r1', 'r2', 'r3']);
  assert.equal(res.conclude, 'refuse');
  const f = path.join(repo, 'rows.json'); fs.writeFileSync(f, JSON.stringify(rows));
  const r = run(lib('ratchet.mjs'), ['--rows', f, '--root', repo, '--out', path.join(repo, 'result.json')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /RATCHET_OPEN r1 r2 r3/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, 'result.json'), 'utf8')).open, ['r1', 'r2', 'r3']);
});

test('T-P4-16 [REAL] ratchet closes with a real test or a reason', () => {
  const repo = tmp('dit-repo-');
  fs.mkdirSync(path.join(repo, 'tests'));
  fs.writeFileSync(path.join(repo, 'tests', 'login.test.mjs'), '// regression');
  const rows = [{ id: 'r1', test_path: 'tests/login.test.mjs' }, { id: 'r2', cannot_automate: 'needs a physical phone' }, { id: 'r3', test_path: '../escape.test.mjs' }];
  const f = path.join(repo, 'rows.json');
  fs.writeFileSync(f, JSON.stringify(rows.slice(0, 2)));
  const r = run(lib('ratchet.mjs'), ['--rows', f, '--root', repo]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(evaluate(rows.slice(0, 2), repo).closed.map((c) => c.by), ['test', 'reason']);
  assert.deepEqual(evaluate(rows, repo).open, ['r3']); // a path outside the root is not a test
});

test('T-P4-17 [REAL] ATTENDED-GATE.html is tickable and tagged', () => {
  const dir = tmp();
  const rows = [
    { id: 'a1', origin: 'plan', round: 1, fingerprint: 'fp1', text: 'owner approves copy' },
    { id: 'a2', origin: 'build', round: 1, fingerprint: 'fp2', text: 'checkout on a phone' },
    { id: 'a3', origin: 'review', round: 2, fingerprint: 'fp3', text: 'receipt email arrives' },
    { id: 'a4', origin: 'review', round: 2, fingerprint: 'fp4', text: 'dark mode readable' },
  ];
  const file = writeGate(path.join(dir, 'ATTENDED-GATE.html'), rows, { run_id: 'r1' });
  const html = fs.readFileSync(file, 'utf8');
  const boxes = [...html.matchAll(/<input type="checkbox" data-row="([^"]+)" data-origin="([^"]+)">/g)];
  assert.equal(boxes.length, 4);
  boxes.forEach((m, i) => { assert.equal(m[1], rows[i].id); assert.ok(['plan', 'build', 'review'].includes(m[2])); });
  assert.equal((html.match(/data-verdict-btn="PASS"/g) || []).length, 4);
  assert.equal((html.match(/data-verdict-btn="FAIL"/g) || []).length, 4);
  assert.doesNotMatch(html, /http/i);
  assert.doesNotMatch(html, /(src|href)=/);
  // run the embedded script against a minimal DOM: tick a1 PASS, a2 FAIL (no test, no reason), leave a3, a4 FAIL with a reason
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const wraps = rows.map((r) => {
    const fields = { note: { value: '' }, test_path: { value: '' }, cannot_automate: { value: '' } };
    const cb = { checked: false };
    return { dataset: { row: r.id, origin: r.origin, round: String(r.round), fingerprint: r.fingerprint }, fields, cb, querySelector(sel) { if (sel === 'input[type=checkbox]') return cb; const m = /data-field=(\w+)/.exec(sel); return m ? fields[m[1]] : null; } };
  });
  const out = { value: '' }; let listener;
  const document = { addEventListener: (_, fn) => { listener = fn; }, getElementById: () => out, querySelectorAll: (sel) => (sel === '[data-wrap]' ? wraps : []) };
  vm.runInNewContext(script, { document });
  const click = (target) => listener({ target });
  const btn = (w, v) => ({ dataset: { verdictBtn: v }, closest: () => w });
  click(btn(wraps[0], 'PASS')); click(btn(wraps[1], 'FAIL')); click(btn(wraps[3], 'FAIL'));
  wraps[3].fields.cannot_automate.value = 'needs a physical phone';
  click({ id: 'export', dataset: {} });
  const exported = JSON.parse(out.value);
  const res = ingest(exported, rows);
  assert.deepEqual(res.passed, ['a1']);
  assert.deepEqual(res.unanswered, ['a3']);
  assert.deepEqual(res.ratchet.map((r) => r.id), ['a2', 'a4']);
  // a FAIL row opens a ratchet entry
  const rr = evaluate(res.ratchet, dir);
  assert.deepEqual(rr.open, ['a2']);
  assert.deepEqual(rr.closed, [{ id: 'a4', by: 'reason' }]);
  assert.throws(() => ingest({ schema: 'wrong', rows: [] }), (e) => e.outcome === 'RESULT_INVALID');
  assert.throws(() => ingest({ schema: 'attended-gate-result/1', rows: [{ row: 'zz', origin: 'plan' }] }, rows), (e) => e.outcome === 'RESULT_ROW_UNKNOWN');
  assert.throws(() => generate([{ id: 'x', origin: 'weird' }]));
});
