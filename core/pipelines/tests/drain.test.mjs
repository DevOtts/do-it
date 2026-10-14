import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PIPELINES, run, tmp } from './helpers.mjs';
import { parseYaml } from '../yaml-lite.mjs';
import { DISPOSITIONS, checkLedger, ownerPack, setDisposition } from '../drain-ledger.mjs';

const LEDGER = path.join(PIPELINES, 'drain-ledger.mjs');
const drainSteps = () => parseYaml(fs.readFileSync(path.join(PIPELINES, 'drain.yaml'), 'utf8')).steps;

test('T-P1-14 [REAL] drain discovery verifies before building', () => {
  const root = tmp('dit-root-'); const cards = tmp('dit-cards-');
  fs.writeFileSync(path.join(root, 'a.txt'), 'alpha beta');
  fs.writeFileSync(path.join(root, 'c.txt'), 'only gamma here');
  const w = (id, claims) => fs.writeFileSync(path.join(cards, id + '.json'), JSON.stringify({ id, claims }));
  w('A', [{ path: 'a.txt', contains: ['alpha', 'beta'] }]);
  w('B', [{ path: 'missing.txt', contains: ['x'] }]);
  w('C', [{ path: 'c.txt', contains: ['gamma', 'delta'] }]);
  const r = run(LEDGER, ['discover', '--cards', cards, '--root', root]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /A: already-implemented: full \(proof: a\.txt\) build: skipped/);
  assert.match(r.out, /B: already-implemented: none \(proof: missing\.txt\) build: scheduled/);
  assert.match(r.out, /C: already-implemented: partial \(proof: c\.txt\) build: scheduled/);
  const steps = drainSteps();
  assert.equal(steps[0].type, 'code');
  const firstPersona = steps.findIndex((s) => s.type === 'persona');
  assert.ok(steps.findIndex((s) => s.id === 'discover') < firstPersona);
});

test('T-P1-14 claim escaping the root is not proof', () => {
  const root = tmp('dit-root-'); const cards = tmp('dit-cards-');
  fs.writeFileSync(path.join(cards, 'E.json'), JSON.stringify({ id: 'E', claims: [{ path: '../../../etc/hosts' }] }));
  assert.match(run(LEDGER, ['discover', '--cards', cards, '--root', root]).out, /E: already-implemented: none/);
});

test('T-P1-15 one batched owner gate', () => {
  const cards = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, title: 't' + i }));
  const pack = ownerPack('run1', cards);
  assert.equal(pack.questions.length, 12);
  assert.ok(pack.pack_id);
  assert.deepEqual(pack.questions.map((q) => q.n), cards.map((_, i) => i + 1));
  assert.equal(drainSteps().filter((s) => s.gate === 'owner-gate').length, 1);
});

test('T-P1-16 conclude refuses an unaccounted card', () => {
  const d = tmp(); const f = path.join(d, 'ledger.json');
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, disposition: i < 4 ? 'drained' : undefined }));
  fs.writeFileSync(f, JSON.stringify({ cards }));
  const r = run(LEDGER, ['check', '--ledger', f]);
  assert.equal(r.code, 1);
  assert.match(r.out, /UNACCOUNTED_CARD e/);
  // parked without an unlock event is still unaccounted
  assert.equal(run(LEDGER, ['set', '--ledger', f, '--card', 'e', '--disposition', 'parked']).code, 0);
  assert.equal(run(LEDGER, ['check', '--ledger', f]).code, 1);
  assert.equal(run(LEDGER, ['set', '--ledger', f, '--card', 'e', '--disposition', 'parked', '--unlock', 'owner answers Q3']).code, 0);
  assert.equal(run(LEDGER, ['check', '--ledger', f]).code, 0);
});

test('T-P1-17 only five dispositions exist', () => {
  assert.deepEqual(DISPOSITIONS, ['drained', 'trimmed', 'promoted', 'attended', 'parked']);
  const ledger = { cards: DISPOSITIONS.map((_, i) => ({ id: 'k' + i })).concat([{ id: 'bad' }]) };
  DISPOSITIONS.forEach((d, i) => setDisposition(ledger, 'k' + i, d));
  assert.throws(() => setDisposition(ledger, 'bad', 'deleted'), (e) => e.outcome === 'DISPOSITION_INVALID' && e.exit === 1);
  assert.throws(() => setDisposition(ledger, 'k0', 'trimmed'), (e) => e.outcome === 'DISPOSITION_CONFLICT');
  assert.equal(ledger.cards.filter((c) => c.disposition).length, 5);
  assert.equal(checkLedger({ cards: [{ id: 'z', disposition: 'deleted' }] }).length, 1);
  const d = tmp(); const f = path.join(d, 'l.json');
  fs.writeFileSync(f, JSON.stringify({ cards: [{ id: 'q' }] }));
  const r = run(LEDGER, ['set', '--ledger', f, '--card', 'q', '--disposition', 'deleted']);
  assert.equal(r.code, 1);
  assert.match(r.out, /DISPOSITION_INVALID/);
});
