#!/usr/bin/env node
// Derives expected.json for a fixture from the fixture's own content. Never from a run.
// usage: node scripts/measure-fixture.mjs <fixture> [--write | --check] [--fixtures-dir DIR]
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURES = path.resolve(HERE, '..', 'tests', 'fixtures');

export function canonical(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'true') v = true; else if (v === 'false') v = false;
    out[k] = v;
  }
  return out;
}

export function dispositionFor(card, rules) {
  for (const r of rules.order) {
    if (r.when === 'otherwise') return r.disposition;
    if (r.when.startsWith('kind=')) { if (card.kind === r.when.slice(5)) return r.disposition; continue; }
    if (card[r.when] === true) return r.disposition;
  }
  return null;
}

export function reviewOutcome(variant) {
  const rounds = variant.rounds.map((r) => {
    const n = (sev) => r.findings.filter((f) => f.sev === sev).length;
    return { round: r.round, blockers: n('blocker'), majors: n('major'), minors: n('minor'), blocking: n('blocker') + n('major'), cost_tokens: r.cost_tokens, fingerprint: r.fingerprint, blocker_ids: r.findings.filter((f) => f.sev === 'blocker').map((f) => f.id) };
  });
  let exit = null;
  let used = 0;
  let spent = 0;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (variant.token_ceiling !== undefined && spent + r.cost_tokens > variant.token_ceiling) { exit = 'OVER_BUDGET'; used = r.round; break; }
    spent += r.cost_tokens;
    used = r.round;
    const prev = rounds[i - 1];
    if (prev && prev.fingerprint === r.fingerprint && r.blocker_ids.length && r.blocker_ids.every((id) => prev.blocker_ids.includes(id))) { exit = 'STALLED'; break; }
    if (r.blocking === 0) { exit = r.minors > 0 ? 'CONVERGED_WITH_MINORS' : 'CONVERGED'; break; }
  }
  return { rounds, exit, rounds_used: used, minors_written: exit === 'CONVERGED_WITH_MINORS' ? rounds[used - 1].minors : 0, blocking_per_round: rounds.map((r) => r.blocking) };
}

function sh(cmd, cwd) {
  return cp.spawnSync('sh', ['-c', cmd], { cwd, encoding: 'utf8' });
}

const MEASURES = {
  async 'feature-overnight'(dir) {
    const dod = JSON.parse(fs.readFileSync(path.join(dir, 'dod.json'), 'utf8'));
    const request = fs.readFileSync(path.join(dir, 'request.md'), 'utf8');
    return { fixture: 'feature-overnight', dod_count: dod.rows.length, dod_ids: dod.rows.map((r) => r.id), checks: dod.rows.map((r) => r.check), request_words: request.split(/\s+/).filter(Boolean).length };
  },
  async 'investigate-fix'(dir) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
    const seeded = fs.readFileSync(path.join(dir, meta.defect_file), 'utf8').includes('SEEDED-DEFECT');
    const red = sh('node ' + meta.failing_check, dir);
    return { fixture: 'investigate-fix', defect_file: meta.defect_file, failing_check: meta.failing_check, regression_row: meta.regression_row, defect_marked: seeded, red_before: red.status !== 0, failing_checks: red.status !== 0 ? 1 : 0 };
  },
  async 'weekly-drain'(dir) {
    const rules = JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8'));
    const files = fs.readdirSync(path.join(dir, 'backlog')).filter((f) => f.endsWith('.md')).sort();
    const cards = files.map((f) => parseFrontmatter(fs.readFileSync(path.join(dir, 'backlog', f), 'utf8')));
    const dispositions = {};
    const per_card = {};
    for (const c of cards) {
      const d = dispositionFor(c, rules);
      per_card[c.id] = d;
      dispositions[d] = (dispositions[d] || 0) + 1;
    }
    return {
      fixture: 'weekly-drain',
      card_count: cards.length,
      needs_build_count: cards.filter((c) => c.needs_build === true).length,
      needs_decision_count: cards.filter((c) => c.needs_decision === true).length,
      overdue_count: cards.filter((c) => c.due < rules.reference_date).length,
      dispositions,
      disposition_sum: Object.values(dispositions).reduce((a, b) => a + b, 0),
      per_card,
    };
  },
  async 'review-loop'(dir) {
    const out = { fixture: 'review-loop', variants: {} };
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'expected.json').sort()) {
      const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const o = reviewOutcome(v);
      out.variants[v.variant] = { exit: o.exit, rounds_used: o.rounds_used, blocking_per_round: o.blocking_per_round, minors_written: o.minors_written, minors_per_round: o.rounds.map((r) => r.minors) };
    }
    return out;
  },
  async reconcile(dir) {
    const { buildReconcileWorkspace, BRANCH_LABELS, WORKTREES } = await import(pathToFileURL(path.join(dir, 'build.mjs')).href);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dit-measure-rc-'));
    try {
      const env = { HOME: root, GIT_CONFIG_GLOBAL: path.join(root, '.gitconfig'), GIT_CONFIG_SYSTEM: '/dev/null' };
      const ws = buildReconcileWorkspace(path.join(root, 'ws'), env);
      let branches = 0;
      let worktrees = 0;
      for (const repo of Object.values(ws.repos)) {
        const g = (a) => cp.execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...env } });
        branches += g(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter((b) => b && b !== 'main').length;
        worktrees += g(['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length - 1;
      }
      const labels = {};
      for (const m of Object.values(BRANCH_LABELS)) for (const l of Object.values(m)) labels[l] = (labels[l] || 0) + 1;
      return { fixture: 'reconcile', repos: Object.keys(ws.repos).length, branches, worktrees, labels, labelled_worktrees: Object.values(WORKTREES).flat().length };
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  async deploy(dir) {
    const ad = JSON.parse(fs.readFileSync(path.join(dir, '.deploy-it', 'adapter.json'), 'utf8'));
    const sha = (f) => cp.execFileSync(process.execPath, ['-e', "const c=require('crypto'),fs=require('fs');process.stdout.write(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))", f], { encoding: 'utf8' });
    return {
      fixture: 'deploy',
      leg_count: ad.legs.length,
      legs: ad.legs.map((l) => l.leg),
      reverse_leg_order: ad.legs.map((l) => l.leg).reverse(),
      pre_deploy_sha256: sha(path.join(dir, ad.target)),
      release_sha256: sha(path.join(dir, 'release', 'app.txt')),
    };
  },
};

export async function measureFixture(name, fixturesDir) {
  const dir = path.join(fixturesDir || DEFAULT_FIXTURES, name);
  if (!MEASURES[name]) throw new Error('unknown fixture: ' + name);
  if (!fs.existsSync(dir)) throw new Error('fixture dir missing: ' + dir);
  return MEASURES[name](dir);
}

export const FIXTURE_NAMES = Object.keys(MEASURES);

async function main(argv) {
  const dirIdx = argv.indexOf('--fixtures-dir');
  const dirArg = dirIdx !== -1 ? argv[dirIdx + 1] : null;
  const fixturesDir = dirArg ? path.resolve(dirArg) : DEFAULT_FIXTURES;
  const name = argv.find((a) => !a.startsWith('--') && a !== dirArg);
  if (!name) { console.error('usage: measure-fixture.mjs <fixture> [--write|--check]'); return 1; }
  let text;
  try { text = canonical(await measureFixture(name, fixturesDir)); } catch (e) { console.error(e.message); return 1; }
  const stored = path.join(fixturesDir, name, 'expected.json');
  if (argv.includes('--write')) { fs.writeFileSync(stored, text); console.log('wrote ' + stored); return 0; }
  if (argv.includes('--check')) {
    let cur = null;
    try { cur = fs.readFileSync(stored, 'utf8'); } catch { /* missing */ }
    if (cur === text) { console.log('expected.json matches for ' + name); return 0; }
    console.error('expected.json differs or is missing for ' + name);
    return 1;
  }
  process.stdout.write(text);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
