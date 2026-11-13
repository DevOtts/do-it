// Epic E1 (T-E1-05, G-4): the host table is generated from hosts/*/adapter.manifest.json and checked against it.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as chk from '../../scripts/check-readme.mjs';
import { readHosts, renderReadmeTable, renderSkillTable } from '../../scripts/hosts-table.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const CHECKER = path.join(ROOT, 'scripts', 'check-readme.mjs');
const LABEL = 'Experimental: server side declined (PR #727, 2026-10-29)';
const HOST = ['eng', 'ine'].join('');
const run = (args) => cp.spawnSync(process.execPath, [CHECKER, ...args], { cwd: ROOT, encoding: 'utf8' });

// A scratch root: the README given, plus the host folders (manifest and README) of this repo.
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
function scratch(readme, tweak) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'e1-readme-'));
  made.push(d);
  fs.writeFileSync(path.join(d, 'README.md'), readme);
  for (const h of fs.readdirSync(path.join(ROOT, 'hosts'), { withFileTypes: true })) {
    if (!h.isDirectory() || h.name.startsWith('_')) continue;
    for (const f of ['adapter.manifest.json', 'README.md']) {
      const src = path.join(ROOT, 'hosts', h.name, f);
      if (fs.existsSync(src)) { fs.mkdirSync(path.join(d, 'hosts', h.name), { recursive: true }); fs.copyFileSync(src, path.join(d, 'hosts', h.name, f)); }
    }
  }
  if (tweak) tweak(d);
  return d;
}
const manifestOf = (d, host) => path.join(d, 'hosts', host, 'adapter.manifest.json');
const editManifest = (d, host, fn) => { const f = manifestOf(d, host); const m = JSON.parse(fs.readFileSync(f, 'utf8')); fn(m); fs.writeFileSync(f, JSON.stringify(m, null, 2)); };

test('T-E1-05 the host check passes on the repo and the Engine row reads Experimental', () => {
  const r = run(['--hosts']);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(chk.checkHosts(README, { root: ROOT }), []);
  const row = README.split('\n').find((l) => l.startsWith('| Engine |'));
  assert.ok(row && row.includes(LABEL), row);
  assert.doesNotMatch(row, /\bSupported\b/);
  const hero = /<img src="assets\/do-it-hero\.svg"[^>]*alt="([^"]*)"/.exec(README)[1];
  assert.ok(hero.includes(LABEL), hero);
  assert.ok(fs.readFileSync(path.join(ROOT, 'hosts', HOST, 'README.md'), 'utf8').includes(LABEL));
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'hosts', HOST, 'adapter.manifest.json'), 'utf8'));
  assert.deepEqual([m.level, m.server_side, m.status_label], ['experimental', 'declined', LABEL]);
  assert.equal(run(['--all']).status, 0, run(['--all']).stdout);
});

test('T-E1-05 the README table and the SKILL table are the generated ones', () => {
  const hosts = readHosts(ROOT);
  assert.deepEqual(hosts.map((h) => h.id), ['claude-code', 'codex', 'opencode', HOST]);
  assert.ok(README.includes(renderReadmeTable(hosts)));
  assert.ok(fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8').includes(renderSkillTable(hosts)));
  assert.match(renderSkillTable(hosts), new RegExp(`\\| ${HOST} +\\| Experimental +\\|`));
  assert.doesNotMatch(renderSkillTable(hosts), new RegExp(`${HOST} +\\| Supported`));
  const stale = scratch(README.replace('| Codex | Supported |', '| Codex | Supported, mostly |'));
  assert.match(run(['--hosts', '--root', stale]).stdout, /hosts block is stale/);
});

test('T-E1-05 a declined host listed as Supported fails the check (G-4)', () => {
  const bad = scratch(README.replace(`| Engine | ${LABEL} |`, '| Engine | Supported |'));
  const r = run(['--hosts', '--root', bad]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Engine is listed as Supported but its manifest says server_side: declined \(G-4\)/);
  const native = scratch(README.replace(`| Engine | ${LABEL} |`, '| Engine | Native |'));
  assert.match(run(['--hosts', '--root', native]).stdout, /server_side: declined \(G-4\)/);
  const plain = scratch(README.replace(`| Engine | ${LABEL} |`, '| Engine | Experimental |'));
  assert.match(run(['--hosts', '--root', plain]).stdout, /row does not show "Experimental: server side declined/);
});

test('T-E1-05 a manifest that says declined but also supported is itself refused', () => {
  const d = scratch(README, (root) => editManifest(root, HOST, (m) => { m.level = 'supported'; }));
  const r = run(['--hosts', '--root', d]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /server_side: declined but level supported \(G-4\)/);
});

test('T-E1-05 a host folder without a row fails the check', () => {
  const d = scratch(README, (root) => {
    fs.mkdirSync(path.join(root, 'hosts', 'zeta'), { recursive: true });
    fs.writeFileSync(manifestOf(root, 'zeta'), JSON.stringify({ host: 'zeta', version: '1.0.0', display: 'Zeta', level: 'supported', note: 'x' }));
  });
  const r = run(['--hosts', '--root', d]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /host folder hosts\/zeta has no row in Platform compatibility/);
  // a folder with no manifest at all is named too
  const bare = scratch(README, (root) => fs.mkdirSync(path.join(root, 'hosts', 'bare'), { recursive: true }));
  assert.match(run(['--hosts', '--root', bare]).stdout, /hosts\/bare has no readable adapter\.manifest\.json/);
  // and a row without a folder
  const ghost = scratch(README.replace('<!-- hosts:end -->', '| Ghost | Supported | none |\n<!-- hosts:end -->'));
  assert.match(run(['--hosts', '--root', ghost]).stdout, /row "Ghost" has no host folder/);
});

test('T-E1-05 the hero alt text and the host README must show the host status', () => {
  const alt = scratch(README.replace(/alt="do-it hero:[^"]*"/, 'alt="do-it hero: one message enters a router and a deterministic spine, and runs on four hosts, all of them supported"'));
  assert.match(run(['--hosts', '--root', alt]).stdout, /hero alt text does not show/);
  const own = scratch(README, (root) => fs.writeFileSync(path.join(root, 'hosts', HOST, 'README.md'), '# do-it on a host\n'));
  assert.match(run(['--hosts', '--root', own]).stdout, /hosts\/[^/]+\/README\.md does not show/);
});

test('T-E1-05 the tone check accepts a status sentence that comes from a manifest, and still rejects other dates', () => {
  assert.deepEqual(chk.checkTone(README, ROOT), []);
  assert.match(chk.checkTone(README.replace('## Status', '## Status\n\nShipped 2026-11 for sure.\n'), ROOT).join(), /tone/);
});

test('T-E1-05 generate-skill writes the host table from the manifests', () => {
  const d = scratch(README, (root) => {
    fs.mkdirSync(path.join(root, 'plugins/do-it/skill-src'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'plugins/do-it/skill-src', fs.readdirSync(path.join(ROOT, 'plugins/do-it/skill-src'))[0]), path.join(root, 'plugins/do-it/skill-src/10-a.md'));
    fs.mkdirSync(path.join(root, 'hosts', 'zeta'), { recursive: true });
    fs.writeFileSync(manifestOf(root, 'zeta'), JSON.stringify({ host: 'zeta', version: '1', display: 'Zeta', level: 'experimental', server_side: 'declined' }));
  });
  const out = path.join(d, 'SKILL.out.md');
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-skill.mjs'), '--root', d, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(out, 'utf8');
  assert.match(text, /\| zeta +\| Experimental +\|/);
  assert.match(text, new RegExp(`\\| ${HOST} +\\| Experimental +\\|`));
  assert.doesNotMatch(text, new RegExp(`${HOST} +\\| Supported`));
});
