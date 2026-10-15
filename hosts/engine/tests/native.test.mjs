// Offline cases for the do-it <-> Engine native definition mapping (the live read-back is T-N1-18).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../../../core/pipelines/yaml-lite.mjs';
import { readFileSync } from 'node:fs';
import { compileSquad } from '../compile/squad-to-definition.mjs';
import { toNativeDefinition, fromNativeDefinition } from '../compile/native.mjs';
import { canonicalHash } from '../compile/canon.mjs';
import { toEnginePack } from '../ask/channels.mjs';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const def = compileSquad(parseYaml(readFileSync(path.join(FIX, 'lifecycle-squad.yaml'), 'utf8')));

test('native steps carry only Engine fields plus x_do_it, numbered from 1', () => {
  const n = toNativeDefinition(def);
  const allowed = new Set(['n', 'type', 'question', 'persona', 'label', 'model_tier', 'consumes_previous', 'decision', 'x_do_it']);
  n.steps.forEach((s, i) => { assert.equal(s.n, i + 1); for (const k of Object.keys(s)) assert.ok(allowed.has(k), k); });
  assert.deepEqual(Object.keys(n), ['steps', 'x_do_it']);
});

test('read-back survives Engine default-filling and is lossless', () => {
  const n = toNativeDefinition(def);
  const served = { ...n, steps: n.steps.map((s) => ({ consumes_previous: false, ...s })) };
  assert.equal(canonicalHash(fromNativeDefinition(served)), canonicalHash(def));
});

test('engine pack drops the channel key and null optionals', () => {
  const p = toEnginePack({ channel: 'chatP2p', pack_id: 'p1', run_id: null, questions: [{ n: 1, text: 'q', options: [], recommendation: null, default: 'yes' }] });
  assert.deepEqual(p, { pack_id: 'p1', questions: [{ n: 1, text: 'q', default: 'yes' }] });
});
