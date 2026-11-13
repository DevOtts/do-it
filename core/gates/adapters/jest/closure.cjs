'use strict';
// Forward closure of a jest test file and the keys.json writer (epic A1, PRD-3 D6, D10, D17).
// The closure is a superset of jest's own `--findRelatedTests` set: it keeps `import type` edges, adds the literals of
// jest.mock / doMock / unmock / requireActual, and the snapshot path. Anything it cannot see fails toward WIDE
// (unresolved repo-local specifier, template or variable require) or toward running (a resolver crash is `unknown`).
const fs = require('node:fs');
const path = require('node:path');
const nodeModule = require('node:module');
const common = require('./common.cjs');

const SPEC_RES = [
  /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
  /\bexport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+)?from\s+['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*`([^`$\n]+)`\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bjest\s*\.\s*(?:mock|doMock|unmock|dontMock|requireActual|requireMock|setMock|createMockFromModule|genMockFromModule)\s*\(\s*['"]([^'"\n]+)['"]/g,
];
const DYNAMIC_RE = /\b(?:require|import)\s*\(\s*([^)\n]*)/g;

// => {specs: [string], dynamic: number}. `dynamic` counts require/import calls whose argument is not a plain literal.
function extractSpecifiers(text) {
  const specs = new Set();
  for (const re of SPEC_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) specs.add(m[1]);
  }
  let dynamic = 0;
  DYNAMIC_RE.lastIndex = 0;
  let d;
  while ((d = DYNAMIC_RE.exec(text))) {
    const arg = d[1].trim();
    if (arg === '') continue;
    const lit = /^(['"])[^'"\n]*\1$/.test(arg.replace(/\s*,.*$/, '')) || /^`[^`$]*`$/.test(arg.replace(/\s*,.*$/, ''));
    if (!lit) dynamic++;
  }
  return { specs: Array.from(specs), dynamic };
}

function localLooking(spec, config) {
  if (spec.startsWith('.') || spec.startsWith('/')) return true;
  const mapper = (config && config.moduleNameMapper) || [];
  const entries = Array.isArray(mapper) ? mapper : Object.keys(mapper).map((k) => [k]);
  for (const e of entries) {
    try {
      const re = e[0] instanceof RegExp ? e[0] : new RegExp(String(e[0]));
      if (re.test(spec)) return true;
    } catch { /* a bad pattern maps nothing */ }
  }
  return false;
}

// => {abs} | {unresolved: true} | {skip: true} | {unknown: true, error}
function resolveSpec(resolver, from, spec, config) {
  if (nodeModule.isBuiltin(spec)) return { skip: true };
  try {
    if (resolver.isCoreModule && resolver.isCoreModule(spec)) return { skip: true };
  } catch { /* fall through to resolution */ }
  try {
    return { abs: resolver.resolveModule(from, spec) };
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      try {
        const m = resolver.getMockModule && resolver.getMockModule(from, spec);
        if (m) return { abs: m };
      } catch { /* no mock either */ }
      return localLooking(spec, config) ? { unresolved: true } : { skip: true };
    }
    return { unknown: true, error: e };
  }
}

function snapshotDefault(testPath) {
  return path.join(path.dirname(testPath), '__snapshots__', path.basename(testPath) + '.snap');
}

// o: {repo, resolver, config, manifest, depResolver, snapshotPath(fn), cache(Map)}
// => {members: [abs], unresolved: n, wide: bool, unknown: bool, error?}
function closureOf(testPath, o) {
  const cache = o.cache || new Map();
  const wideRe = common.wideRegex(o.manifest || {});
  const wideHits = new Set((o.manifest && o.manifest.wide_hits) || []);
  const read = (abs) => {
    if (cache.has(abs)) return cache.get(abs);
    const rr = common.realRel(o.repo, abs);
    const h = common.hashFileBytes(rr.abs);
    const e = { rel: rr.rel, sha: h.sha, text: h.bytes ? h.bytes.toString('utf8') : null };
    cache.set(abs, e);
    return e;
  };
  const out = { members: [], unresolved: 0, wide: !!(o.manifest && o.manifest.wide_all), unknown: false };
  const seen = new Set([testPath]);
  const queue = [testPath];
  const add = (abs) => {
    if (abs.includes(path.sep + 'node_modules' + path.sep) || seen.has(abs)) return;
    seen.add(abs);
    out.members.push(abs);
    queue.push(abs);
  };
  try {
    while (queue.length) {
      const f = queue.shift();
      const e = read(f);
      if (e.text === null) {
        if (f === testPath) throw new Error('test file unreadable');
        continue;
      }
      const ext = path.extname(f).toLowerCase();
      if (!common.NODE_EXT.includes(ext)) continue;
      if (wideHits.has(e.rel) || (wideRe && wideRe.test(e.text))) out.wide = true;
      const x = extractSpecifiers(e.text);
      out.unresolved += x.dynamic;
      for (const spec of x.specs) {
        const r = resolveSpec(o.resolver, f, spec, o.config);
        if (r.unknown) throw r.error || new Error('resolver failed');
        if (r.unresolved) out.unresolved++;
        else if (r.abs) add(r.abs);
      }
      if (o.depResolver) {
        for (const abs of o.depResolver.resolve(f)) add(abs);
      }
    }
    const tr = read(testPath);
    const snap = (o.snapshotPath || snapshotDefault)(testPath);
    if (snap && (/Snapshot/.test(tr.text || '') || fs.existsSync(snap)) && !seen.has(snap)) {
      seen.add(snap);
      out.members.push(snap);
    }
  } catch (e) {
    out.unknown = true;
    out.error = (e && e.message) || String(e);
  }
  if (out.unresolved > 0) out.wide = true;
  return out;
}

// o: {paths, repo, manifest, resolver, config, depResolver, snapshotPath, argv, version, env}
// => the keys.json object: {schema, run_id, runner, files: [{file, class, deps, unknown, unresolved}], errors}
function buildKeys(o) {
  const tokens = common.envFileTokens(o.manifest);
  const cache = new Map();
  const files = [];
  const errors = [];
  for (const testPath of o.paths) {
    const rel = common.realRel(o.repo, testPath).rel;
    const c = closureOf(testPath, { ...o, cache });
    if (c.unknown) {
      files.push({ file: rel, class: 'WIDE', deps: [], unknown: true, unresolved: c.unresolved });
      errors.push({ file: rel, error: c.error || 'closure unavailable' });
      continue;
    }
    const deps = [common.depHash(o.repo, testPath, tokens)];
    for (const m of c.members) deps.push(common.depHash(o.repo, m, tokens));
    files.push({ file: rel, class: c.wide ? 'WIDE' : 'NARROW', deps, unknown: false, unresolved: c.unresolved });
  }
  return {
    schema: 'rtg-keys/1',
    run_id: o.manifest.run_id,
    runner: { name: 'jest', version: o.version || '-', argv: o.argv || [] },
    files,
    errors,
  };
}

// The closure sidecar of one finished file (D10). Never authoritative: a missing or stale sidecar only costs a re-run.
function sidecarOf(manifest, entry, key) {
  const members = entry.deps.map((d) => d.path).filter((p, i, a) => a.indexOf(p) === i);
  return {
    schema: 'rtg-closure/1', file: entry.file, leg: manifest.leg, key, members, unresolved: entry.unresolved || 0,
    deps: entry.deps,
  };
}

function sidecarName(manifest, file) {
  return common.sha256(manifest.leg + ':' + file) + '.json';
}

module.exports = { extractSpecifiers, resolveSpec, closureOf, buildKeys, sidecarOf, sidecarName, snapshotDefault };
