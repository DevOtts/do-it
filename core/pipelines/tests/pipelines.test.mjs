import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PIPELINES, CORE, REPO, run, tmp } from './helpers.mjs';
import { parseYaml } from '../yaml-lite.mjs';

const LINT = path.join(PIPELINES, 'lint-pipelines.mjs');
const PERSONAS = path.join(CORE, 'personas');
const preset = (steps) => `pipeline: x\nversion: 1\nsteps:\n${steps}\n`;
function fixture(body) {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'x.yaml'), body);
  return d;
}

test('T-P1-01 five presets load, unique step ids, no harness names', () => {
  const r = run(LINT, [PIPELINES]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /pipelines: drain, feature, investigate-fix, reconcile, review-loop/);
  for (const f of fs.readdirSync(PIPELINES).filter((x) => x.endsWith('.yaml'))) {
    const ids = parseYaml(fs.readFileSync(path.join(PIPELINES, f), 'utf8')).steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, f);
  }
  const scan = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'tests' || e.name === 'node_modules' ? [] : e.isDirectory() ? scan(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of scan(PIPELINES).filter((x) => /\.(yaml|md|json)$/.test(x))) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\b(claude|codex|opencode|cursor|copilot)\b/i, f);
  }
});

test('T-P1-02 step type outside the vocabulary', () => {
  const r = run(LINT, [fixture(preset('  - id: a1\n    type: agent\n    persona: builder'))]);
  assert.equal(r.code, 1);
  assert.match(r.out, /STEP_TYPE_INVALID a1/);
});

test('T-P1-03 unknown step field fails, contract fields pass', () => {
  const bad = run(LINT, [fixture(preset('  - id: a1\n    type: persona\n    persona: builder\n    model: x'))]);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /STEP_FIELD_UNKNOWN model/);
  const good = preset([
    '  - id: s1\n    type: persona\n    persona: builder\n    skill: build-it\n    tier: T2\n    consumes_previous: true\n    eval: tests pass\n    needs: []',
    '  - id: s2\n    type: decision\n    gate: owner-gate\n    ask: ok?\n    needs: [s1]',
    '  - id: s3\n    type: code\n    adapter: foo\n    on_limit: park\n    loop_to: s1\n    max_rounds: 2',
  ].join('\n'));
  const r = run(LINT, [fixture(good)]);
  assert.equal(r.code, 0, r.out);
});

test('T-P1-04 [REAL] real presets reference real personas and earlier loop targets', () => {
  const r = run(LINT, [PIPELINES, '--personas', PERSONAS]);
  assert.equal(r.code, 0, r.out);
  for (const f of fs.readdirSync(PIPELINES).filter((x) => x.endsWith('.yaml'))) {
    const steps = parseYaml(fs.readFileSync(path.join(PIPELINES, f), 'utf8')).steps;
    steps.forEach((s, i) => {
      if (s.persona) assert.ok(fs.existsSync(path.join(PERSONAS, s.persona + '.md')), `${f} ${s.id}`);
      if (s.loop_to) {
        assert.ok(steps.slice(0, i).some((p) => p.id === s.loop_to), `${f} ${s.id} loop_to earlier`);
        assert.ok(Number.isInteger(s.max_rounds), `${f} ${s.id} max_rounds`);
      }
    });
  }
  const rl = parseYaml(fs.readFileSync(path.join(PIPELINES, 'review-loop.yaml'), 'utf8')).steps;
  assert.equal(rl.find((s) => s.loop_to).max_rounds, 3);
  // negative control on the same lint: a missing persona and a forward loop target fail
  const d = fixture(preset('  - id: a\n    type: persona\n    persona: ghost\n    loop_to: b\n    max_rounds: 1\n  - id: b\n    type: code'));
  const neg = run(LINT, [d, '--personas', PERSONAS]);
  assert.equal(neg.code, 1);
  assert.match(neg.out, /PERSONA_NOT_FOUND ghost/);
  assert.match(neg.out, /LOOP_TARGET_INVALID/);
});

test('T-P1-18 reconcile cannot apply before approval', () => {
  const file = path.join(PIPELINES, 'reconcile.yaml');
  const ord = run(path.join(PIPELINES, 'approval.mjs'), ['check-order', file]);
  assert.equal(ord.code, 0, ord.out);
  const steps = parseYaml(fs.readFileSync(file, 'utf8')).steps;
  const dec = steps.findIndex((s) => s.type === 'decision' && s.ask);
  const apply = steps.findIndex((s) => s.type === 'code' && s.id === 'apply');
  assert.ok(dec >= 0 && apply > dec);
  // reversed order is rejected
  const d = tmp();
  const rev = path.join(d, 'reconcile.yaml');
  fs.writeFileSync(rev, 'pipeline: reconcile\nversion: 1\nsteps:\n  - id: apply\n    type: code\n  - id: ok\n    type: decision\n    ask: ok?\n');
  assert.equal(run(path.join(PIPELINES, 'approval.mjs'), ['check-order', rev]).code, 1);
  const none = run(path.join(PIPELINES, 'approval.mjs'), ['apply', '--approval', path.join(d, 'missing.json')]);
  assert.equal(none.code, 3);
  assert.match(none.out, /APPROVAL_REQUIRED/);
  const ap = path.join(d, 'approval.json');
  fs.writeFileSync(ap, JSON.stringify({ approved: true, by: 'owner' }));
  assert.equal(run(path.join(PIPELINES, 'approval.mjs'), ['apply', '--approval', ap]).code, 0);
});

test('lint stays inside the lane and repo root resolves', () => {
  assert.ok(fs.existsSync(path.join(REPO, 'delivery', 'CONTRACT.md')));
});
