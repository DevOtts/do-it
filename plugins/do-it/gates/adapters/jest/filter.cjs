'use strict';
// jest `--filter` module (epic A1, PRD-3 D7, D16; CONTRACT §11 A1). Runs inside jest after discovery: builds the closure
// context from the project's own jest packages, writes keys.json, calls `do-it gate decide --run-dir D` once, and returns
// exactly the run-list.json files plus every file whose closure is unknown. Any failure returns every path (G-1).
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const common = require('./common.cjs');
const closure = require('./closure.cjs');

const DEFAULT_DECIDE_TIMEOUT_MS = 120000;

// Resolve one of the project's jest packages; falls back to a sibling of jest-cli for strict (non-hoisted) layouts.
function projectRequire(name, root) {
  try {
    return require(require.resolve(name, { paths: [root] }));
  } catch (first) {
    for (const via of ['jest', 'jest-cli', '@jest/core']) {
      try {
        const base = path.dirname(require.resolve(via + '/package.json', { paths: [root] }));
        return require(require.resolve(name, { paths: [base] }));
      } catch { /* try the next anchor */ }
    }
    throw first;
  }
}

function projectVersion(root) {
  for (const name of ['jest', 'jest-cli', '@jest/core']) {
    try {
      const j = JSON.parse(fs.readFileSync(require.resolve(name + '/package.json', { paths: [root] }), 'utf8'));
      if (j && j.version) return String(j.version);
    } catch { /* next */ }
  }
  return '-';
}

function argValue(argv, names) {
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    for (const n of names) {
      if (a === n && i + 1 < argv.length) return String(argv[i + 1]);
      if (a.startsWith(n + '=')) return a.slice(n.length + 1);
    }
  }
  return null;
}

// The jest context of the project (config, resolver, haste fs) built from jest's public entry points.
async function buildContext(root, argv) {
  const { readConfigs } = projectRequire('jest-config', root);
  const rt = projectRequire('jest-runtime', root);
  const Runtime = rt.default || rt;
  const flags = { _: [], $0: 'jest' };
  const cfg = argValue(argv, ['--config', '-c']);
  const rootDir = argValue(argv, ['--rootDir']);
  if (cfg) flags.config = cfg;
  if (rootDir) flags.rootDir = rootDir;
  const { configs } = await readConfigs(flags, [root]);
  if (!configs || configs.length !== 1) throw new Error('multi-project jest config');
  const config = configs[0];
  const context = await Runtime.createContext(config, { maxWorkers: 1, watchman: false });
  const out = { resolver: context.resolver, config, hasteFS: context.hasteFS, version: projectVersion(root) };
  try {
    const { DependencyResolver } = projectRequire('jest-resolve-dependencies', root);
    const snap = projectRequire('jest-snapshot', root);
    const snapshotResolver = await snap.buildSnapshotResolver(config);
    out.depResolver = new DependencyResolver(context.resolver, context.hasteFS, snapshotResolver);
    out.snapshotPath = (p) => snapshotResolver.resolveSnapshotPath(p);
  } catch { /* the closure's own extractor still runs; the snapshot path falls back to jest's default layout */ }
  return out;
}

// => Map(repo-relative file -> entry) or null when run-list.json is not a list of files.
function parseRunList(json, repo) {
  const list = Array.isArray(json) ? json : json && Array.isArray(json.files) ? json.files : null;
  if (!list) return null;
  const out = new Map();
  for (const item of list) {
    const e = typeof item === 'string' ? { file: item } : item;
    const f = e && (e.file !== undefined ? e.file : e.path);
    if (typeof f !== 'string' || f === '') return null;
    const rel = path.isAbsolute(f) ? common.realRel(repo, f).rel : path.posix.normalize(f.split(path.sep).join('/'));
    out.set(rel, e);
  }
  return out;
}

function writeSelected(dir, sent, files, decide) {
  try { common.writeJsonAtomic(path.join(dir, 'selected.json'), { schema: 'rtg-selected/1', sent, files, decide }); } catch { /* the count check is skipped */ }
}

// opts (tests): {env, cwd, log, context, argv}
async function filterPaths(paths, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const log = o.log || ((m) => process.stderr.write(m + '\n'));
  const everyFile = () => ({ filtered: paths.map((test) => ({ test })) });
  const loaded = common.loadManifest(env);
  if (!loaded) {
    log('[do-it-gate] manifest unreadable');
    return everyFile();
  }
  const { manifest, dir } = loaded;
  const root = o.cwd || process.cwd();
  const argv = o.argv || process.argv.slice(2);
  let repo;
  let keys;
  try {
    repo = common.repoRootOf(root);
    const ctx = o.context || (await buildContext(root, argv));
    keys = closure.buildKeys({
      paths, repo, manifest, resolver: ctx.resolver, config: ctx.config, depResolver: ctx.depResolver,
      snapshotPath: ctx.snapshotPath, argv, version: ctx.version,
    });
    common.writeJsonAtomic(path.join(dir, 'keys.json'), keys);
  } catch (e) {
    log('[do-it-gate] closure unavailable (' + ((e && e.message) || e) + '): running every file');
    writeSelected(dir, paths.length, [], 'closure-failed');
    return everyFile();
  }
  const runListFile = path.join(dir, 'run-list.json');
  try { fs.unlinkSync(runListFile); } catch { /* no stale list */ }
  const cmd = common.decideCommand(env);
  const timeout = Number(env.DO_IT_GATE_DECIDE_TIMEOUT_MS) || DEFAULT_DECIDE_TIMEOUT_MS;
  const r = cp.spawnSync(cmd[0], [...cmd.slice(1), '--run-dir', dir], {
    cwd: root, env, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26,
  });
  const list = !r.error && r.status === 0 ? parseRunList(common.readJson(runListFile), repo) : null;
  if (!list) {
    log('[do-it-gate] decide failed: running every file');
    writeSelected(dir, paths.length, [], 'failed');
    return everyFile();
  }
  const run = new Set(list.keys());
  for (const f of keys.files) if (f.unknown) run.add(f.file);
  writeSelected(dir, run.size, Array.from(run).sort(), 'ok');
  return { filtered: paths.filter((p) => run.has(common.realRel(repo, p).rel)).map((test) => ({ test })) };
}

module.exports = (paths) => filterPaths(paths);
module.exports.filterPaths = filterPaths;
module.exports.buildContext = buildContext;
module.exports.parseRunList = parseRunList;
