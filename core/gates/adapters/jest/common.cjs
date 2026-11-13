'use strict';
// Shared plumbing of the jest adapter (resumable test gates, epic A1; PRD-3 D1, D2, D6, D10, D11, D18).
// Standalone CommonJS: only node: built-ins; never imports the spine (it keeps its own copies of canonical JSON, the row
// CRC and the rtg-key/1 composer, bound to the spine by the golden-vector tests).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const ROW_SCHEMA = 'do-it-gate-result/1';
const MANIFEST_SCHEMA = 'rtg-manifest/1';
const ROW_MAX_JSON = 4094;
const FAILURE_CAP = 1024 * 1024;
const NODE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

function rowCrc(rowWithoutCrc) {
  return sha256(canonicalJson(rowWithoutCrc)).slice(0, 16);
}

// The line on disk is exactly canonicalJson(row with crc), without the LF.
function rowLine(row) {
  const r = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined && k !== 'crc') r[k] = v;
  return canonicalJson({ ...r, crc: rowCrc(r) });
}

// One O_APPEND write per row (D1). Opened per row so a compaction that renames the active file is never written through
// a stale descriptor. Throws on an oversized row or a short write; the caller turns that into ROW_WRITE_FAILED.
function appendRow(storeDir, row) {
  const line = rowLine(row);
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length > ROW_MAX_JSON) throw new Error('row too large: ' + bytes.length);
  const buf = Buffer.concat([bytes, Buffer.from('\n')]);
  fs.mkdirSync(storeDir, { recursive: true });
  const fd = fs.openSync(path.join(storeDir, 'results.jsonl'), 'a');
  try {
    const n = fs.writeSync(fd, buf, 0, buf.length);
    if (n !== buf.length) throw new Error('short write');
  } finally {
    fs.closeSync(fd);
  }
  return line;
}

function readJson(file, cap) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > (cap || 64 * 1024 * 1024)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

// Content-addressed, write-once side file under {store}/failures (D11). Returns the store-relative ref.
function writeFailure(storeDir, text) {
  let bytes = Buffer.from(text, 'utf8');
  if (bytes.length > FAILURE_CAP) bytes = bytes.subarray(0, FAILURE_CAP);
  const sha = sha256(bytes);
  const dir = path.join(storeDir, 'failures');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, sha + '.txt'), bytes, { flag: 'wx', mode: 0o644 });
  } catch (e) {
    if (!e || e.code !== 'EEXIST') throw e;
  }
  return 'failures/' + sha + '.txt';
}

// == manifest ==
// The run directory comes from the do-it-internal env var (jest rejects unknown argv). Any problem returns null and the
// adapter does nothing (CONTRACT §6, G-1).
function loadManifest(env) {
  const file = (env || process.env).DO_IT_GATE_MANIFEST;
  if (!file) return null;
  const m = readJson(file);
  if (!m || typeof m !== 'object' || m.schema !== MANIFEST_SCHEMA) return null;
  if (typeof m.run_id !== 'string' || !Array.isArray(m.lines)) return null;
  return { manifest: m, dir: path.dirname(file), file };
}

// == repo paths and hashing (CONTRACT §2.2, D6) ==
const rootCache = new Map();
function repoRootOf(cwd) {
  const key = cwd || process.cwd();
  if (rootCache.has(key)) return rootCache.get(key);
  let root = null;
  try {
    root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: key, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    root = null;
  }
  const real = fs.realpathSync(root || key);
  rootCache.set(key, real);
  return real;
}

// Repo-relative realpath of a member (symlinks hashed through the target); outside the repo => @outside/{sha256(abs)}.
function realRel(repo, abs) {
  const root = fs.realpathSync(repo);
  const full0 = path.resolve(root, abs);
  let base = full0;
  const rest = [];
  let real = null;
  for (;;) {
    try { real = fs.realpathSync(base); break; } catch { /* walk up */ }
    const parent = path.dirname(base);
    if (parent === base) break;
    rest.unshift(path.basename(base));
    base = parent;
  }
  const full = real ? path.join(real, ...rest) : full0;
  const r = path.relative(root, full);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return { rel: '@outside/' + sha256(full), abs: full };
  return { rel: r.split(path.sep).join('/'), abs: full };
}

function hashFileBytes(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return { sha: '-' };
    const bytes = fs.readFileSync(abs);
    return { sha: sha256(bytes), bytes };
  } catch {
    return { sha: '-' };
  }
}

// A declared env file in a closure is keyed by its HMAC token, never by a plain hash of its bytes (G-6).
function envFileTokens(manifest) {
  const m = new Map();
  for (const l of manifest.lines || []) {
    const f = String(l).split('\t');
    if (f[0] === 'env' && f.length === 3 && f[1].startsWith('file:')) m.set(f[1].slice(5), f[2]);
  }
  return m;
}

function depHash(repo, absOrRel, tokens) {
  const rr = realRel(repo, absOrRel);
  if (tokens && tokens.has(rr.rel)) return { path: rr.rel, sha256: tokens.get(rr.rel) };
  return { path: rr.rel, sha256: hashFileBytes(rr.abs).sha };
}

function wideRegex(manifest) {
  const p = manifest && manifest.wide_patterns && manifest.wide_patterns.node;
  try { return p ? new RegExp(p) : null; } catch { return null; }
}

// == rtg-key/1 composer (CONTRACT §2.2; port of the spine's, parity-tested against F1's golden manifest) ==
const RUNNER_DESC = {
  drop: ['--filter', '--runTestsByPath', '--json', '--outputFile', '--reporters', '--testPathPattern'],
  dropValue: ['--filter', '--outputFile', '--reporters', '--testPathPattern'],
  bool: ['--ci', '--runInBand', '-i', '--silent', '--verbose', '--json', '--runTestsByPath', '--detectOpenHandles', '--forceExit', '--passWithNoTests', '--coverage', '--no-cache', '--watchAll=false'],
};

function runnerLine(name, version, argv) {
  const dropSet = new Set(RUNNER_DESC.drop);
  const dropValue = new Set(RUNNER_DESC.dropValue);
  const bool = new Set(RUNNER_DESC.bool);
  const kept = [];
  const args = argv || [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a.startsWith('-')) {
      const flag = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
      if (dropSet.has(flag)) {
        if (!a.includes('=') && dropValue.has(flag) && i + 1 < args.length && !String(args[i + 1]).startsWith('-')) i++;
        continue;
      }
      kept.push(a);
      continue;
    }
    const prev = i > 0 ? String(args[i - 1]) : '';
    const prevTakesValue = prev.startsWith('-') && !prev.includes('=') && !bool.has(prev) && !dropSet.has(prev);
    if (!prevTakesValue) continue;
    kept.push(a);
  }
  return ['runner', name + '@' + version, sha256(Buffer.from(kept.join('\0'), 'utf8'))];
}

function sortTexts(texts) {
  return texts.slice().sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
}

function encodable(fields) {
  return fields.every((f) => typeof f === 'string' && !/[\t\n\r]/.test(f) && f.isWellFormed());
}

// spineTexts: tab-joined lines (manifest.lines); adapterLines: field arrays. => {key, manifest, lines} or {key: null}.
function composeKey(spineTexts, adapterLines) {
  for (const l of adapterLines) if (!encodable(l.map(String))) return { key: null, manifest: null, lines: [] };
  const texts = sortTexts([...spineTexts.map(String), ...adapterLines.map((l) => l.map(String).join('\t'))]);
  const manifest = 'rtg-key/1\n' + texts.map((t) => t + '\n').join('');
  return { key: sha256(Buffer.from(manifest, 'utf8')), manifest, lines: texts };
}

// Port of gateFpComponents over tab-joined lines.
function componentsOf(texts) {
  const lines = texts.map((t) => t.split('\t'));
  const by = (tag) => lines.filter((l) => l[0] === tag);
  const one = (tag) => by(tag)[0] || null;
  const out = {};
  if (one('gate')) out.gate = one('gate')[1];
  if (one('runner')) out.runner = sha256(one('runner').join('\t'));
  if (one('core')) out.core = one('core')[1];
  if (one('installed')) out.installed = one('installed')[1];
  out.env = sha256(sortTexts(by('env').map((l) => l.join('\t'))).map((t) => t + '\n').join(''));
  if (one('platform')) out.platform = sha256(one('platform').join('\t'));
  if (one('class')) out.class = one('class')[1];
  if (one('tree')) out.tree = one('tree')[1];
  out.deps = sha256(sortTexts(by('dep').map((l) => l.join('\t'))).map((t) => t + '\n').join(''));
  return out;
}

// The adapter-side lines of one file: runner, class, tree (WIDE only), one dep per member (the file itself included).
function adapterLinesOf(manifest, runner, entry) {
  const lines = [runner];
  lines.push(['class', entry.class]);
  if (entry.class === 'WIDE') lines.push(['tree', manifest.tree]);
  const seen = new Map();
  for (const d of entry.deps || []) seen.set(d.path, ['dep', d.path, d.sha256]);
  for (const l of seen.values()) lines.push(l);
  return lines;
}

// == redaction (G-6, D11) ==
function parseEnvFile(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out.push([m[1], v]);
  }
  return out;
}

// [{name, value}] for every declared env name that is set and every KEY=VALUE of every declared env file; values shorter
// than 4 characters are not redacted (they would shred ordinary text).
function redactionSet(manifest, env, repo) {
  const out = [];
  for (const n of manifest.env_names || []) {
    const v = (env || process.env)[n];
    if (typeof v === 'string' && v.length >= 4) out.push({ name: n, value: v });
  }
  for (const f of manifest.env_files || []) {
    try {
      const text = fs.readFileSync(path.join(repo, String(f)), 'utf8');
      for (const [k, v] of parseEnvFile(text)) if (v.length >= 4) out.push({ name: k, value: v });
    } catch { /* an unreadable env file redacts nothing */ }
  }
  out.sort((a, b) => b.value.length - a.value.length);
  return out;
}

function redact(text, set) {
  let t = String(text);
  for (const r of set) t = t.split(r.value).join('[env:' + r.name + ']');
  return t;
}

// == decide invocation (CONTRACT §11 A1) ==
// DO_IT_GATE_DECIDE names the do-it entry to run as `<entry> gate decide --run-dir D`: a script path (.mjs/.cjs/.js runs
// under node) or an executable. Unset: the bundle next to the adapter (plugin or repo layout), else `do-it` on PATH.
function decideCommand(env) {
  const e = env || process.env;
  const v = e.DO_IT_GATE_DECIDE;
  if (v) return /\.(mjs|cjs|js)$/.test(v) ? [process.execPath, v] : [v];
  for (const rel of [['..', '..', '..', 'scripts', 'do-it.mjs'], ['..', '..', '..', 'spine', 'do-it.mjs']]) {
    const cand = path.join(__dirname, ...rel);
    if (fs.existsSync(cand)) return [process.execPath, cand];
  }
  return ['do-it'];
}

module.exports = {
  ROW_SCHEMA, MANIFEST_SCHEMA, ROW_MAX_JSON, NODE_EXT,
  sha256, canonicalJson, rowCrc, rowLine, appendRow, readJson, writeJsonAtomic, writeFailure,
  loadManifest, repoRootOf, realRel, hashFileBytes, envFileTokens, depHash, wideRegex,
  runnerLine, composeKey, componentsOf, adapterLinesOf, sortTexts,
  redactionSet, redact, decideCommand,
};
