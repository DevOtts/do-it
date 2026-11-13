import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { BULK_READ_CAP, atomicWriteJson, readRegularFile, writeFileOnce } from './fs-atomic.mjs';
import { canonicalJson, sha256Bytes } from './hash.mjs';
import { loadSchemaFile, validateSchema } from './schema.mjs';
import { gateStoreMemoAppend, gateStoreMemoRead, gateStoreSalt } from './gate-results.mjs';

// Fingerprint and invalidation (resumable test gates, epic F1; PRD-1 D16-D24, CONTRACT §2.2-§2.3, §4.6, §11 A1, A5, A6).
// Builds the rtg-key/1 manifest of a test file. Every unknown input yields key null (the file runs, G-1). Env values never
// leave this module except as salted HMACs (G-6).

export const GATE_FP_NODE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
export const GATE_FP_RESOLVE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
// CONTRACT §4.6 Node pattern, written in two pieces so the spine's raw-read source lint does not flag the literal.
export const GATE_FP_WIDE_NODE = 'read' + 'FileSync|readdirSync|glob|execSync|spawnSync|execFileSync|child_process|git ';
export const GATE_FP_WIDE_PY = 'open\\(|subprocess|Path\\(|glob|os\\.listdir';
export const GATE_FP_WIDE_DIGEST = sha256Bytes('rtg-wide/1\n' + GATE_FP_WIDE_NODE + '\n' + GATE_FP_WIDE_PY + '\n').slice(0, 16);
export const GATE_FP_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'uv.lock', 'Pipfile.lock'];
export const GATE_FP_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Per-runner descriptor table (D19 config files, D24 selection-only flags dropped from the runner line).
export const GATE_FP_RUNNERS = {
  jest: {
    runtime: 'node',
    configs: [/^jest\.config\.(js|ts|cjs|mjs|json)$/, /^package\.json$/, /^babel\.config\.[^/]+$/, /^\.babelrc[^/]*$/, /^\.swcrc$/],
    drop: ['--filter', '--runTestsByPath', '--json', '--outputFile', '--reporters', '--testPathPattern'],
    dropValue: ['--filter', '--outputFile', '--reporters', '--testPathPattern'],
    bool: ['--ci', '--runInBand', '-i', '--silent', '--verbose', '--json', '--runTestsByPath', '--detectOpenHandles', '--forceExit', '--passWithNoTests', '--coverage', '--no-cache', '--watchAll=false'],
  },
  vitest: {
    runtime: 'node',
    configs: [/^vitest\.config\.[^/]+$/, /^vite\.config\.[^/]+$/, /^vitest\.workspace\.[^/]+$/, /^package\.json$/],
    drop: ['--reporter', '--outputFile', '--run'],
    dropValue: ['--reporter', '--outputFile'],
    bool: ['--run', '--silent', '--coverage', '--no-threads', '--passWithNoTests'],
  },
  pytest: {
    runtime: 'python',
    configs: [/^pyproject\.toml$/, /^pytest\.ini$/, /^setup\.cfg$/, /^tox\.ini$/],
    drop: ['--do-it-manifest', '--json-report', '--json-report-file', '-q', '-v'],
    dropValue: ['--do-it-manifest', '--json-report-file'],
    bool: ['-q', '-v', '-x', '-s', '--json-report'],
  },
};

function gateFpLog(opts) {
  return (opts && opts.log) || ((m) => process.stderr.write(m + '\n'));
}

function gateFpGit(repo, args, env) {
  return cp.execFileSync('git', args, {
    cwd: repo, env: { ...(env || process.env), GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function gateFpSplitZ(buf) {
  return buf.toString('utf8').split('\0').filter((s) => s !== '');
}

// == manifest assembly (D16) ==
export function gateFpSortLines(lines) {
  return lines.slice().sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
}

export function gateFpLineText(fields) {
  return fields.map(String).join('\t');
}

function gateFpEncodable(fields) {
  return fields.every((f) => typeof f === 'string' && !/[\t\n\r]/.test(f) && f.isWellFormed());
}

// gateKeyAssemble(spineLines, adapterLines): each line is an array of fields. Returns {key, manifest, lines} or
// {key: null, reason: 'path-unencodable'}.
export function gateKeyAssemble(spineLines, adapterLines) {
  const all = [...(spineLines || []), ...(adapterLines || [])];
  for (const l of all) if (!Array.isArray(l) || !gateFpEncodable(l.map(String))) return { key: null, reason: 'path-unencodable', manifest: null };
  const texts = gateFpSortLines(all.map(gateFpLineText));
  const manifest = 'rtg-key/1\n' + texts.map((t) => t + '\n').join('');
  return { key: sha256Bytes(Buffer.from(manifest, 'utf8')), manifest, lines: texts };
}

// argv minus selection-only flags, in original order, joined by NUL, hashed (D24, research table #19).
export function gateFpRunnerLine(name, version, argv, drop) {
  const d = drop || GATE_FP_RUNNERS[name] || { drop: [], dropValue: [], bool: [] };
  const dropSet = new Set(d.drop || []);
  const dropValue = new Set(d.dropValue || []);
  const bool = new Set(d.bool || []);
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
    // positional: a test path when it does not follow a flag that may take a value (unknown flags keep their value)
    const prev = i > 0 ? String(args[i - 1]) : '';
    const prevTakesValue = prev.startsWith('-') && !prev.includes('=') && !bool.has(prev) && !dropSet.has(prev);
    if (!prevTakesValue) continue;
    kept.push(a);
  }
  return ['runner', name + '@' + version, sha256Bytes(Buffer.from(kept.join('\0'), 'utf8'))];
}

export function gateFpComponents(lines) {
  const texts = lines.map(gateFpLineText);
  const by = (tag) => lines.filter((l) => l[0] === tag);
  const one = (tag) => { const l = by(tag)[0]; return l ? l : null; };
  const out = {};
  if (one('gate')) out.gate = one('gate')[1];
  if (one('runner')) out.runner = sha256Bytes(gateFpLineText(one('runner')));
  if (one('core')) out.core = one('core')[1];
  if (one('installed')) out.installed = one('installed')[1];
  out.env = sha256Bytes(gateFpSortLines(by('env').map(gateFpLineText)).map((t) => t + '\n').join(''));
  if (one('platform')) out.platform = sha256Bytes(gateFpLineText(one('platform')));
  if (one('class')) out.class = one('class')[1];
  if (one('tree')) out.tree = one('tree')[1];
  out.deps = sha256Bytes(gateFpSortLines(by('dep').map(gateFpLineText)).map((t) => t + '\n').join(''));
  void texts;
  return out;
}

// == file hashing (D18) ==
const gateFpStatCache = new Map();

function gateFpWideBits(rel, bytes) {
  const ext = path.extname(rel).toLowerCase();
  const text = GATE_FP_NODE_EXT.includes(ext) || ext === '.py' ? bytes.toString('utf8') : '';
  const nodeHit = GATE_FP_NODE_EXT.includes(ext) && new RegExp(GATE_FP_WIDE_NODE).test(text);
  const pyHit = ext === '.py' && new RegExp(GATE_FP_WIDE_PY).test(text);
  return [nodeHit ? 1 : 0, pyHit ? 1 : 0];
}

// Hash of the on-disk bytes (through symlinks) with the in-process stat cache. Returns {sha, wide} or {sha: '-'}.
export function gateFpHashDisk(abs, rel) {
  let st;
  try { st = fs.statSync(abs, { bigint: true }); } catch { return { sha: '-', wide: [0, 0] }; }
  if (!st.isFile()) return { sha: '-', wide: [0, 0], notFile: true };
  const ck = [st.dev, st.ino, st.size, st.mtimeNs, st.ctimeNs].join(':');
  const hit = gateFpStatCache.get(ck);
  if (hit && hit.rel === rel) return { sha: hit.sha, wide: hit.wide };
  let bytes;
  try { bytes = readRegularFile(abs, BULK_READ_CAP); } catch { return { sha: '-', wide: [0, 0], unreadable: true }; }
  const out = { sha: sha256Bytes(bytes), wide: gateFpWideBits(rel, bytes) };
  gateFpStatCache.set(ck, { ...out, rel });
  return out;
}

export function gateFpStatCacheClear() {
  gateFpStatCache.clear();
}

// Repo-relative realpath of a member (D18): symlinks resolved; outside the repository => @outside/{sha256(abs)};
// a missing tail is resolved through its deepest existing ancestor.
export function gateFpRealRel(repo, rel) {
  const root = fs.realpathSync(repo);
  const abs = path.resolve(root, rel);
  let base = abs;
  const rest = [];
  let real = null;
  for (;;) {
    try { real = fs.realpathSync(base); break; } catch { /* walk up */ }
    const parent = path.dirname(base);
    if (parent === base) break;
    rest.unshift(path.basename(base));
    base = parent;
  }
  const full = real ? path.join(real, ...rest) : abs;
  const r = path.relative(root, full);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return { rel: '@outside/' + sha256Bytes(full), abs: full, outside: true };
  return { rel: r.split(path.sep).join('/'), abs: full, outside: false };
}

export function gateFpHashPath(repo, rel, table) {
  const rr = gateFpRealRel(repo, rel);
  if (!rr.outside && table && table.hashes && Object.prototype.hasOwnProperty.call(table.hashes, rr.rel)) {
    return { path: rr.rel, sha: table.hashes[rr.rel], wide: (table.wide && table.wide[rr.rel]) || [0, 0] };
  }
  const h = gateFpHashDisk(rr.abs, rr.rel);
  return { path: rr.rel, sha: h.sha, wide: h.wide || [0, 0] };
}

export function gateFpMemoDisabled(repo, env, tracked) {
  if ((tracked || []).some((p) => p === '.gitattributes' || p.endsWith('/.gitattributes'))) return 'gitattributes';
  try { if (fs.existsSync(path.join(repo, '.gitattributes'))) return 'gitattributes'; } catch { /* ignore */ }
  try {
    const common = gateFpGit(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'], env).toString('utf8').trim();
    if (fs.existsSync(path.join(common, 'info', 'attributes'))) return 'info-attributes';
  } catch { /* ignore */ }
  let autocrlf = '';
  try { autocrlf = gateFpGit(repo, ['config', '--get', 'core.autocrlf'], env).toString('utf8').trim(); } catch { autocrlf = ''; }
  if (autocrlf && autocrlf !== 'false') return 'autocrlf';
  let filters = '';
  try { filters = gateFpGit(repo, ['config', '--get-regexp', '^filter\\.'], env).toString('utf8').trim(); } catch { filters = ''; }
  if (filters) return 'filter';
  return null;
}

function gateFpMemoSample(hits, fault) {
  if (!hits.length) return [];
  if (fault === 'memo_verify_all') return hits.slice();
  const n = Math.max(1, Math.ceil(hits.length / 100));
  const pick = new Set();
  while (pick.size < n) pick.add(hits[crypto.randomInt(hits.length)]);
  return Array.from(pick);
}

// {hashes: {path: sha|-}, wide: {path: [node, py]}, tracked, untracked, dirty, memoHits, memoDisabled, links}
export function gateFpHashTable(repo, store, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const log = gateFpLog(o);
  const fault = env.DO_IT_FAULT || '';
  const ls = gateFpSplitZ(gateFpGit(repo, ['ls-files', '-s', '-v', '-z'], env));
  const entries = [];
  for (const rec of ls) {
    const m = /^(\S+) ([0-7]+) ([0-9a-f]+) ([0-9]+)\t([\s\S]*)$/.exec(rec);
    if (!m) continue;
    if (m[4] !== '0' && entries.some((e) => e.path === m[5])) continue;
    entries.push({ tag: m[1], mode: m[2], blob: m[3], path: m[5] });
  }
  const untracked = gateFpSplitZ(gateFpGit(repo, ['ls-files', '-o', '--exclude-standard', '-z'], env));
  const dirty = new Set(gateFpSplitZ(gateFpGit(repo, ['diff-files', '-z', '--name-only'], env)));
  // declared env files are keyed by salted HMAC only (G-6): never plain-hashed into the table, the tree or the memo
  const exclude = new Set(o.exclude || []);
  for (let i = entries.length - 1; i >= 0; i--) if (exclude.has(entries[i].path)) entries.splice(i, 1);
  for (let i = untracked.length - 1; i >= 0; i--) if (exclude.has(untracked[i])) untracked.splice(i, 1);
  const tracked = entries.map((e) => e.path);
  const memoDisabled = store ? gateFpMemoDisabled(repo, env, tracked) : 'no-store';
  const memoFile = store ? path.join(store.dir, 'blobmemo.jsonl') : null;
  let memo = memoDisabled ? new Map() : gateStoreMemoRead(store);
  const hashes = {};
  const wide = {};
  const hits = [];
  const fresh = [];
  const links = {};
  const pd = GATE_FP_WIDE_DIGEST;
  const fromDisk = (e) => {
    const h = gateFpHashDisk(path.join(repo, e.path), e.path);
    hashes[e.path] = h.sha;
    wide[e.path] = h.wide || [0, 0];
    return h;
  };
  for (const e of entries) {
    if (e.mode === '120000') {
      const rr = gateFpRealRel(repo, e.path);
      links[e.path] = rr.rel;
      const h = gateFpHashDisk(rr.abs, rr.rel);
      hashes[e.path] = h.sha;
      wide[e.path] = h.wide || [0, 0];
      continue;
    }
    if (e.mode === '160000') { hashes[e.path] = sha256Bytes('gitlink ' + e.blob); wide[e.path] = [0, 0]; continue; }
    const bypass = /^[a-z]$/.test(e.tag) || e.tag === 'S' || dirty.has(e.path);
    const m = !memoDisabled && !bypass ? memo.get(e.blob) : undefined;
    if (m && m.w && Array.isArray(m.w[pd])) {
      hashes[e.path] = m.s;
      wide[e.path] = m.w[pd];
      hits.push(e);
      continue;
    }
    const h = fromDisk(e);
    if (!memoDisabled && !bypass && h.sha !== '-') fresh.push({ b: e.blob, s: h.sha, w: { [pd]: h.wide } });
  }
  // adversarial verification of memo hits (1%, at least 1; all under DO_IT_FAULT=memo_verify_all)
  const sample = gateFpMemoSample(hits, fault); // MEMO-VERIFY
  let mismatch = false;
  for (const e of sample) {
    const h = gateFpHashDisk(path.join(repo, e.path), e.path);
    if (h.sha !== hashes[e.path]) { mismatch = true; break; }
  }
  let memoHits = hits.length;
  if (mismatch) {
    log('[gate-fingerprint] blob memo mismatch: memo discarded');
    try { fs.renameSync(memoFile, memoFile + '.bad-' + Date.now()); } catch { /* already moved */ }
    memo = new Map();
    for (const e of hits) {
      const h = fromDisk(e);
      if (h.sha !== '-') fresh.push({ b: e.blob, s: h.sha, w: { [pd]: h.wide } });
    }
    memoHits = 0;
  }
  if (!memoDisabled && fresh.length) { try { gateStoreMemoAppend(store, fresh); } catch { /* memo is an optimisation */ } }
  for (const rel of untracked) {
    const h = gateFpHashDisk(path.join(repo, rel), rel);
    hashes[rel] = h.sha;
    wide[rel] = h.wide || [0, 0];
  }
  return { hashes, wide, tracked, untracked, dirty: Array.from(dirty).sort(), memoHits, memoDisabled, links };
}

export function gateFpTree(table) {
  const lines = Object.keys(table.hashes).map((p) => 't\t' + p + '\t' + table.hashes[p]);
  return sha256Bytes('rtg-tree/1\n' + gateFpSortLines(lines).map((l) => l + '\n').join(''));
}

// == globs and the NEVER set (D23) ==
export function gateGlobRe(pattern) {
  const p = String(pattern);
  const conv = (s, allowBrace) => {
    let re = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '*') {
        if (s[i + 1] === '*') {
          i++;
          if (s[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
        } else re += '[^/]*';
      } else if (c === '?') re += '[^/]';
      else if (c === '[') {
        const j = s.indexOf(']', i + 2);
        if (j < 0) throw new Error('unclosed [');
        let body = s.slice(i + 1, j);
        if (body.startsWith('!')) body = '^' + body.slice(1);
        re += '[' + body.replace(/\\/g, '\\\\') + ']';
        i = j;
      } else if (c === '{') {
        if (!allowBrace) throw new Error('nested {');
        const j = s.indexOf('}', i + 1);
        if (j < 0) throw new Error('unclosed {');
        const body = s.slice(i + 1, j);
        if (body.includes('{')) throw new Error('nested {');
        re += '(?:' + body.split(',').map((alt) => conv(alt, false)).join('|') + ')';
        i = j;
      } else if (c === ']' || c === '}') {
        throw new Error('unbalanced ' + c);
      } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
    }
    return re;
  };
  return new RegExp('^' + conv(p.replace(/^\.?\//, ''), true) + '$');
}

export function gateGlobMatch(file, pattern, compiled) {
  const re = compiled || gateGlobRe(pattern);
  const target = String(pattern).includes('/') ? file : file.split('/').pop();
  return re.test(target);
}

// {match(file) => {never, pattern}, invalid: [patterns]}; an unparsable pattern makes every file NEVER, printed once.
export function gateNeverCompile(globs, opts) {
  const log = gateFpLog(opts);
  const list = [];
  const invalid = [];
  for (const g of globs || []) {
    try { list.push({ pattern: g, re: gateGlobRe(g) }); } catch { invalid.push(g); }
  }
  for (const g of invalid) log('[gate-fingerprint] invalid reuse glob: ' + g);
  return {
    invalid,
    match(file) {
      if (invalid.length) return { never: true, pattern: invalid[0] };
      for (const x of list) if (gateGlobMatch(file, x.pattern, x.re)) return { never: true, pattern: x.pattern };
      return { never: false, pattern: null };
    },
  };
}

export function gateNeverMatch(file, globs, opts) {
  return gateNeverCompile(globs, opts).match(file);
}

// NEVER precedence lives here only (G-16): V1 must call this for every file.
export function gateReuseDecision(input) {
  const fold = (input && input.fold) || {};
  const never = input && input.never;
  if (never && never.never) return { reuse: false, reason: 'never-set', pattern: never.pattern };
  return { reuse: fold.reuse || false, reason: fold.reason || 'no-row', pattern: null };
}

// == CORE sub-manifest (D19) ==
function gateFpTsPaths(repo) {
  try {
    const raw = readRegularFile(path.join(repo, 'tsconfig.json'), 1024 * 1024).toString('utf8');
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
    const j = JSON.parse(stripped);
    const co = (j && j.compilerOptions) || {};
    return { baseUrl: co.baseUrl || null, paths: co.paths || {} };
  } catch {
    return { baseUrl: null, paths: {} };
  }
}

function gateFpIsFile(abs) {
  try { return fs.statSync(abs).isFile(); } catch { return false; }
}

function gateFpResolveFile(repo, relBase) {
  const abs = path.join(repo, relBase);
  if (gateFpIsFile(abs)) return relBase;
  for (const ext of GATE_FP_RESOLVE_EXT) if (gateFpIsFile(abs + ext)) return relBase + ext;
  for (const ext of GATE_FP_RESOLVE_EXT) if (gateFpIsFile(path.join(abs, 'index' + ext))) return relBase + '/index' + ext;
  return null;
}

// resolve a specifier from a repo-relative directory: {rel} | {unresolved: true} | {pkg: true}
export function gateFpResolveSpec(repo, fromDir, spec, ts) {
  const norm = (p) => path.posix.normalize(p);
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
    const rel = norm(path.posix.join(fromDir || '.', spec));
    if (rel.startsWith('..')) return { unresolved: true };
    const r = gateFpResolveFile(repo, rel);
    return r ? { rel: r } : { unresolved: true };
  }
  if (spec.startsWith('/')) return { unresolved: true };
  const tsc = ts || { baseUrl: null, paths: {} };
  for (const [pat, targets] of Object.entries(tsc.paths || {})) {
    const star = pat.indexOf('*');
    let tail = null;
    if (star < 0) { if (spec === pat) tail = ''; } else if (spec.startsWith(pat.slice(0, star)) && spec.endsWith(pat.slice(star + 1))) {
      tail = spec.slice(star, spec.length - (pat.length - star - 1));
    }
    if (tail === null) continue;
    for (const t of Array.isArray(targets) ? targets : []) {
      const rel = norm(path.posix.join(tsc.baseUrl || '.', String(t).replace('*', tail)));
      const r = rel.startsWith('..') ? null : gateFpResolveFile(repo, rel);
      if (r) return { rel: r };
    }
    return { unresolved: true };
  }
  if (tsc.baseUrl) {
    const rel = norm(path.posix.join(tsc.baseUrl, spec));
    const r = rel.startsWith('..') ? null : gateFpResolveFile(repo, rel);
    if (r && !r.startsWith('node_modules/')) return { rel: r };
  }
  return { pkg: true };
}

export function gateFpSpecifiers(text) {
  const out = [];
  const res = [
    /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+)?from\s+['"]([^'"\n]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  for (const re of res) { let m; while ((m = re.exec(text))) out.push(m[1]); }
  return Array.from(new Set(out));
}

function gateFpLiterals(text) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] === '`' && m[2].includes('${')) continue;
    if (m[2].includes('\\')) continue;
    out.push(m[2]);
  }
  return out;
}

// gateFpCore(repo, runner, table, {reuseCore, gateDigest, env}) => {lines, text, digest, wideAll, unresolved}
export function gateFpCore(repo, runner, table, opts) {
  const o = opts || {};
  const desc = GATE_FP_RUNNERS[runner] || { configs: [] };
  const ts = gateFpTsPaths(repo);
  const all = Object.keys(table.hashes);
  const members = new Map();
  const unresolved = [];
  let wideAll = false;
  const addMember = (rel) => {
    if (members.has(rel)) return false;
    const h = gateFpHashPath(repo, rel, table);
    members.set(h.path, h.sha);
    return true;
  };
  const configs = all.filter((p) => !p.includes('/') && desc.configs.some((re) => re.test(p))).sort();
  const queue = [];
  for (const cfg of configs) {
    addMember(cfg);
    let text = '';
    try { text = readRegularFile(path.join(repo, cfg), 16 * 1024 * 1024).toString('utf8'); } catch { continue; }
    if (runner === 'vitest' && /forceRerunTriggers/.test(text)) {
      const fm = /forceRerunTriggers\s*:\s*\[([^\]]*)\]/.exec(text);
      const body = fm ? fm[1].trim() : null;
      if (body === null || !/^(\s*(['"])[^'"\n]*\2\s*,?)*\s*$/.test(body)) wideAll = true;
      else for (const lit of gateFpLiterals(body)) {
        let re = null;
        try { re = gateGlobRe(lit.replace(/^\*\*\//, '**/')); } catch { wideAll = true; continue; }
        for (const p of all) if (gateGlobMatch(p, lit, re)) addMember(p);
      }
    }
    for (const lit0 of gateFpLiterals(text)) {
      let lit = lit0;
      if (lit.startsWith('<rootDir>')) lit = '.' + lit.slice('<rootDir>'.length);
      if (/[*?$^|()[\]{}]/.test(lit)) continue;
      if (!(lit.startsWith('./') || lit.startsWith('../'))) {
        // CP-01 F-1: a bare literal that names a repo file (vitest `setupFiles: ['test/setup.ts']`) is CORE too.
        // Only a hit counts; a bare string that resolves to nothing (a package name, a pattern) never widens.
        if (lit.startsWith('/') || !lit.length) continue;
        const rel = path.posix.normalize(path.posix.join(path.posix.dirname(cfg), lit));
        const hit = rel.startsWith('..') ? null : gateFpResolveFile(repo, rel);
        if (hit && Object.prototype.hasOwnProperty.call(table.hashes, hit)) { if (addMember(hit)) queue.push(hit); }
        continue;
      }
      const r = gateFpResolveSpec(repo, path.posix.dirname(cfg), lit, ts);
      if (r.rel) { if (addMember(r.rel)) queue.push(r.rel); continue; }
      const ext = path.posix.extname(lit).toLowerCase();
      if (GATE_FP_RESOLVE_EXT.includes(ext) || ext === '.py') unresolved.push([cfg, lit0]);
    }
  }
  // static closure of config-referenced modules
  const seen = new Set();
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!GATE_FP_NODE_EXT.includes(path.posix.extname(rel).toLowerCase())) continue;
    if (rel.startsWith('node_modules/') || rel.includes('/node_modules/')) continue;
    let text = '';
    try { text = readRegularFile(path.join(repo, rel), 16 * 1024 * 1024).toString('utf8'); } catch { continue; }
    for (const spec of gateFpSpecifiers(text)) {
      const r = gateFpResolveSpec(repo, path.posix.dirname(rel), spec, ts);
      if (r.pkg) continue;
      if (r.unresolved) { unresolved.push([rel, spec]); continue; }
      if (r.rel.startsWith('node_modules/') || r.rel.includes('/node_modules/')) continue;
      if (addMember(r.rel)) queue.push(r.rel);
    }
  }
  for (const p of all) {
    const base = p.split('/').pop();
    if (/^tsconfig.*\.json$/.test(base) || base === 'conftest.py' || p.split('/').slice(0, -1).includes('__mocks__')) addMember(p);
  }
  // gates.reuse.core globs: the hash table plus a direct walk under each literal prefix (reaches ignored files)
  for (const g of o.reuseCore || []) {
    let re;
    try { re = gateGlobRe(g); } catch { wideAll = true; continue; }
    for (const p of all) if (gateGlobMatch(p, g, re)) addMember(p);
    const segs = String(g).replace(/^\.?\//, '').split('/');
    const literalDir = [];
    for (let i = 0; i < segs.length - 1; i++) { if (/[*?[{]/.test(segs[i])) break; literalDir.push(segs[i]); }
    const start = path.join(repo, ...literalDir);
    const walk = (dir, depth) => {
      if (depth > 32) return;
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const abs = path.join(dir, e.name);
        const rel = path.relative(repo, abs).split(path.sep).join('/');
        if (e.isDirectory()) walk(abs, depth + 1);
        else if (gateGlobMatch(rel, g, re)) addMember(rel);
      }
    };
    if (literalDir.length) walk(start, 0);
  }
  if (unresolved.length) wideAll = true;
  const lines = [];
  for (const [p, s] of members) lines.push(['c', p, s]);
  for (const [from, lit] of unresolved) lines.push(['c-unresolved', from, lit]);
  if (o.gateDigest) lines.push(['c-gate', o.gateDigest]);
  const okLines = lines.filter((l) => gateFpEncodable(l));
  if (okLines.length !== lines.length) wideAll = true;
  const text = 'rtg-core/1\n' + gateFpSortLines(okLines.map(gateFpLineText)).map((t) => t + '\n').join('');
  return { lines: okLines, text, digest: sha256Bytes(text), wideAll, unresolved };
}

// == installed, env, platform (D20) ==
const GATE_FP_PY_PROBE = [
  'import hashlib, os, site, sys, sysconfig',
  'from importlib import metadata',
  'out = set()',
  'for d in metadata.distributions():',
  '    n = d.metadata.get("Name")',
  '    v = d.version',
  '    if n and v and "\\t" not in n + v and "\\n" not in n + v:',
  '        out.add("py\\t%s==%s" % (n, v))',
  'dirs = set()',
  'for k in ("purelib", "platlib"):',
  '    p = sysconfig.get_paths().get(k)',
  '    if p: dirs.add(p)',
  'try:',
  '    dirs.update(site.getsitepackages())',
  'except Exception:',
  '    pass',
  'for d in sorted(dirs):',
  '    try:',
  '        names = sorted(os.listdir(d))',
  '    except OSError:',
  '        continue',
  '    for f in names:',
  '        if f.endswith(".pth"):',
  '            with open(os.path.join(d, f), "rb") as fh:',
  '                out.add("pth\\t%s\\t%s" % (f, hashlib.sha256(fh.read()).hexdigest()))',
  'sys.stdout.write("\\n".join(sorted(out)) + "\\n")',
].join('\n');

export function gateFpPython(repo, opts) {
  const o = opts || {};
  if (o.python) return o.python;
  const argv0 = o.argv && o.argv[0] ? String(o.argv[0]) : '';
  if (/(^|\/)python[0-9.]*$/.test(argv0)) return argv0;
  const venv = path.join(repo, '.venv', 'bin', 'python');
  if (gateFpIsFile(venv)) return venv;
  return 'python3';
}

export function gateFpPyProbe(python, env) {
  const r = cp.spawnSync(python, ['-I', '-c', GATE_FP_PY_PROBE], { env: env || process.env, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 });
  if (r.error || r.status !== 0) return null;
  const lines = r.stdout.split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (!lines.every((l) => (l[0] === 'py' && l.length === 2 && /^[^\t]+==[^\t]+$/.test(l[1])) || (l[0] === 'pth' && l.length === 3))) return null;
  return lines;
}

// gateFpInstalled(repo, runner, {env, python, argv}) => {lines, text, digest} | {unknown: true, reason: 'installed-unknown'}
export function gateFpInstalled(repo, runner, opts) {
  const o = opts || {};
  const lines = [];
  const rootFiles = (() => { try { return fs.readdirSync(repo); } catch { return []; } })();
  for (const name of rootFiles.slice().sort()) {
    if (GATE_FP_LOCKS.includes(name) || /^requirements.*\.txt$/.test(name)) {
      const h = gateFpHashDisk(path.join(repo, name), name);
      if (!h.notFile) lines.push(['lock', name, h.sha]);
    }
  }
  const nmDirs = ['node_modules'];
  try {
    for (const p of fs.readdirSync(path.join(repo, 'packages')).sort()) {
      if (fs.existsSync(path.join(repo, 'packages', p, 'node_modules'))) nmDirs.push('packages/' + p + '/node_modules');
    }
  } catch { /* no packages/ */ }
  for (const d of nmDirs) {
    const rel = d + '/.package-lock.json';
    lines.push(['node-installed', rel, gateFpHashDisk(path.join(repo, rel), rel).sha]);
  }
  const nm = path.join(repo, 'node_modules');
  const linkLine = (relName) => {
    const rr = gateFpRealRel(repo, 'node_modules/' + relName);
    lines.push(['link', 'node_modules/' + relName, rr.rel]);
  };
  let top = [];
  try { top = fs.readdirSync(nm, { withFileTypes: true }); } catch { top = []; }
  for (const e of top.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isSymbolicLink()) { linkLine(e.name); continue; }
    if (e.isDirectory() && e.name.startsWith('@')) {
      let sub = [];
      try { sub = fs.readdirSync(path.join(nm, e.name), { withFileTypes: true }); } catch { sub = []; }
      for (const s of sub.sort((a, b) => (a.name < b.name ? -1 : 1))) if (s.isSymbolicLink()) linkLine(e.name + '/' + s.name);
    }
  }
  if (runner === 'pytest') {
    const py = gateFpPyProbe(gateFpPython(repo, o), o.env);
    if (!py) return { unknown: true, reason: 'installed-unknown', lines: null, text: null, digest: null };
    for (const l of py) lines.push(l);
  }
  const okLines = lines.filter((l) => gateFpEncodable(l));
  if (okLines.length !== lines.length) return { unknown: true, reason: 'installed-unknown', lines: null, text: null, digest: null };
  const text = 'rtg-installed/1\n' + gateFpSortLines(okLines.map(gateFpLineText)).map((t) => t + '\n').join('');
  return { lines: okLines, text, digest: sha256Bytes(text) };
}

function gateFpHmac(salt, bytes) {
  return crypto.createHmac('sha256', salt).update(bytes).digest('hex');
}

// gateFpEnv({repo, names, files, env, salt}) => {lines, text, digest, unhashable}
export function gateFpEnv(input) {
  const { repo, salt } = input;
  const env = input.env || {};
  const lines = [];
  let unhashable = false;
  for (const name of input.names || []) {
    const n = String(name);
    if (!GATE_FP_ENV_NAME.test(n)) { lines.push(['env', gateFpEncodable([n]) ? n : sha256Bytes(n).slice(0, 16), '*']); unhashable = true; continue; }
    const v = env[n];
    lines.push(['env', n, v === undefined ? '-' : gateFpHmac(salt, Buffer.from(String(v), 'utf8'))]);
  }
  for (const f of input.files || []) {
    const rel = String(f);
    if (!gateFpEncodable([rel]) || path.isAbsolute(rel) || rel.split('/').includes('..')) { lines.push(['env', 'file:' + sha256Bytes(rel).slice(0, 16), '*']); unhashable = true; continue; }
    let tok;
    try {
      tok = gateFpHmac(salt, readRegularFile(path.join(repo, rel), 16 * 1024 * 1024));
    } catch (e) {
      tok = e && e.code === 'ENOENT' ? '-' : '*';
    }
    if (tok === '*') unhashable = true;
    lines.push(['env', 'file:' + rel, tok]);
  }
  const text = gateFpSortLines(lines.map(gateFpLineText)).map((t) => t + '\n').join('');
  return { lines, text, digest: sha256Bytes(text), unhashable };
}

// {NAME: value} for every declared name that is set and every KEY=VALUE of every declared env file (D8 redaction set).
export function gateFpRedactValues(input) {
  const out = {};
  const env = input.env || {};
  for (const n of input.names || []) if (typeof env[n] === 'string') out[n] = env[n];
  for (const f of input.files || []) {
    let text = '';
    try { text = readRegularFile(path.join(input.repo, String(f)), 16 * 1024 * 1024).toString('utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) out[m[1]] = v;
    }
  }
  return out;
}

const GATE_FP_NODE_PROBE = "const os=require('os');process.stdout.write(JSON.stringify(['node',process.version,String(process.versions.icu||'-'),os.platform(),os.release(),os.arch(),String(os.cpus().length)]))";
const GATE_FP_PY_PLATFORM = 'import json, os, platform, sys; sys.stdout.write(json.dumps(["python", platform.python_version(), "-", sys.platform, platform.release(), platform.machine(), str(os.cpu_count() or 0)]))';

// gateFpPlatform({runtime: 'node'|'python', bin, env}) => ['platform', 7 fields] or null (probe failed)
export function gateFpPlatform(input) {
  const o = input || {};
  const runtime = o.runtime || 'node';
  const bin = o.bin || (runtime === 'node' ? 'node' : 'python3');
  const args = runtime === 'node' ? ['-e', GATE_FP_NODE_PROBE] : ['-I', '-c', GATE_FP_PY_PLATFORM];
  const r = cp.spawnSync(bin, args, { env: o.env || process.env, encoding: 'utf8', timeout: 60000 });
  if (r.error || r.status !== 0) return null;
  let f;
  try { f = JSON.parse(r.stdout); } catch { return null; }
  if (!Array.isArray(f) || f.length !== 7 || !f.every((x) => typeof x === 'string' && x.length && !/[\t\n\r]/.test(x))) return null;
  return ['platform', ...f];
}

// == gate component (D21) ==
function gateFpBundleSection(text, name) {
  const marker = '// ---- ' + name + ' ----\n';
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const j = text.indexOf('\n// ---- ', i + marker.length);
  return text.slice(i, j < 0 ? text.length : j);
}

function gateFpFilesUnder(dir) {
  const out = [];
  const go = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) go(path.join(d, e.name), r); else out.push(r);
    }
  };
  go(dir, '');
  return out.sort();
}

// gateFpGateDigest(runner, {bundle, adaptersDir}) => {digest, text}
export function gateFpGateDigest(runner, opts) {
  const o = opts || {};
  const self = fileURLToPath(import.meta.url);
  const bundled = typeof EMBEDDED_SCHEMAS !== 'undefined';
  const bundle = o.bundle || (bundled ? self : null);
  const lines = [];
  const adaptersRoot = o.adaptersDir || (bundle ? path.join(path.dirname(bundle), '..', 'gates', 'adapters') : path.join(path.dirname(self), '..', '..', 'gates', 'adapters'));
  const adir = path.join(adaptersRoot, runner);
  for (const rel of gateFpFilesUnder(adir)) {
    let bytes;
    try { bytes = readRegularFile(path.join(adir, rel), BULK_READ_CAP); } catch { bytes = Buffer.from('-'); }
    lines.push('adapter:' + rel + '\t' + sha256Bytes(bytes));
  }
  if (bundle) {
    const text = readRegularFile(bundle, BULK_READ_CAP).toString('utf8');
    const a = gateFpBundleSection(text, 'gate-results.mjs');
    const b = gateFpBundleSection(text, 'gate-fingerprint.mjs');
    if (a === null || b === null) lines.push('bundle\t' + sha256Bytes(text));
    else { lines.push('section:gate-results.mjs\t' + sha256Bytes(a)); lines.push('section:gate-fingerprint.mjs\t' + sha256Bytes(b)); }
    const m = /^const EMBEDDED_SCHEMAS = (.*);$/m.exec(text);
    let schema = null;
    try { schema = m ? JSON.parse(m[1])['gate-result.1.schema.json'] : null; } catch { schema = null; }
    lines.push('schema:gate-result.1.schema.json\t' + sha256Bytes(schema ? canonicalJson(schema) : '-'));
  } else {
    const dir = path.dirname(self);
    for (const n of ['gate-results.mjs', 'gate-fingerprint.mjs']) {
      lines.push('source:' + n + '\t' + sha256Bytes(readRegularFile(path.join(dir, n), BULK_READ_CAP)));
    }
    lines.push('schema:gate-result.1.schema.json\t' + sha256Bytes(canonicalJson(loadSchemaFile('gate-result.1.schema.json'))));
  }
  const text = 'rtg-gate/1\n' + gateFpSortLines(lines).map((l) => l + '\n').join('');
  return { digest: sha256Bytes(text), text };
}

// == class (D22) ==
export function gateClassify(input) {
  const o = input || {};
  if (o.wideAll || (o.unresolved || 0) > 0) return 'WIDE';
  for (const m of o.members || []) if (o.wideHits && o.wideHits.has(m)) return 'WIDE';
  return 'NARROW';
}

// == spine components for one runner (D16-D23) ==
// gateFpSpine({repo, runner, store, env, reuse: {core, env, env_files, always_run, never_reuse}, python, nodeBin,
//   bundle, adaptersDir, argv, log}) => spine (pass to gateKeyFor). spine.reason is set when a component is unknown.
export function gateFpSpine(opts) {
  try {
    return gateFpSpineBuild(opts);
  } catch (e) {
    // a resolver or probe crash is an unknown component: every key is null and every file runs (G-1, CONTRACT §6)
    return { reason: 'fingerprint-error', error: (e && (e.outcome || e.code || e.message)) || 'error', lines: [], runner: opts && opts.runner };
  }
}

function gateFpSpineBuild(opts) {
  const o = opts || {};
  const repo = fs.realpathSync(o.repo);
  const env = o.env || process.env;
  const runner = o.runner;
  const reuse = o.reuse || {};
  const desc = GATE_FP_RUNNERS[runner] || { runtime: 'node' };
  const log = gateFpLog(o);
  const table = gateFpHashTable(repo, o.store || null, { env, log, exclude: (reuse.env_files || []).map(String) });
  const gate = gateFpGateDigest(runner, { bundle: o.bundle, adaptersDir: o.adaptersDir });
  const core = gateFpCore(repo, runner, table, { reuseCore: reuse.core || [], gateDigest: gate.digest, env });
  const installed = gateFpInstalled(repo, runner, { env, python: o.python, argv: o.argv });
  const salt = o.store ? gateStoreSalt(o.store, { log }) : crypto.randomBytes(32);
  const envc = gateFpEnv({ repo, names: reuse.env || [], files: reuse.env_files || [], env, salt });
  const platform = gateFpPlatform({ runtime: desc.runtime, bin: desc.runtime === 'node' ? o.nodeBin : gateFpPython(repo, o), env });
  const wideHits = new Set();
  for (const [p, w] of Object.entries(table.wide)) if (w && (w[0] || w[1])) wideHits.add(p);
  let reason = null;
  if (installed.unknown) reason = 'installed-unknown';
  else if (!platform) reason = 'platform-unknown';
  else if (envc.unhashable) reason = 'env-unhashable';
  const lines = [['gate', gate.digest], ['core', core.digest], ...envc.lines];
  if (!installed.unknown) lines.push(['installed', installed.digest]);
  if (platform) lines.push(platform);
  const spine = {
    repo, runner, reason, table, wideHits, wideAll: core.wideAll, tree: gateFpTree(table), lines,
    gate, core, installed, env: envc, platform, never: gateNeverCompile([...(reuse.always_run || []), ...(reuse.never_reuse || [])], { log }),
    envFileTokens: new Map(envc.lines.filter((l) => l[1].startsWith('file:')).map((l) => [l[1].slice(5), l[2]])),
    neverGlobs: [...(reuse.always_run || []), ...(reuse.never_reuse || [])], envNames: reuse.env || [], envFiles: reuse.env_files || [],
  };
  return spine;
}

// gateKeyFor(spine, {file, runner: {name, version, argv}, deps: [path | [path, sha]], unresolved, wide})
//   => {key, components, manifest, lines, reason}
export function gateKeyFor(spine, entry) {
  if (!spine || spine.reason) return { key: null, reason: (spine && spine.reason) || 'no-spine', components: null };
  const e = entry || {};
  const file = String(e.file || '');
  if (!file || !gateFpEncodable([file])) return { key: null, reason: 'path-unencodable', components: null };
  const r = e.runner || {};
  const runnerLine = gateFpRunnerLine(r.name || spine.runner, r.version || '-', r.argv || []);
  const depLines = new Map();
  const members = [];
  let wideMember = false;
  for (const d of [file, ...(e.deps || [])]) {
    if (Array.isArray(d)) {
      depLines.set(String(d[0]), ['dep', String(d[0]), String(d[1])]);
      members.push(String(d[0]));
      continue;
    }
    const h = gateFpHashPath(spine.repo, String(d), spine.table);
    if (spine.envFileTokens && spine.envFileTokens.has(h.path)) {
      // a declared env file in a closure is keyed by its HMAC token, never by a plain SHA-256 of its bytes (G-6)
      const tok = spine.envFileTokens.get(h.path);
      if (tok === '*') return { key: null, reason: 'env-unhashable', components: null };
      depLines.set(h.path, ['dep', h.path, tok]);
      members.push(h.path);
      continue;
    }
    depLines.set(h.path, ['dep', h.path, h.sha]);
    members.push(h.path);
    if (h.wide && (h.wide[0] || h.wide[1])) wideMember = true;
  }
  const cls = wideMember || e.wide ? 'WIDE' : gateClassify({ members, unresolved: e.unresolved || 0, wideHits: spine.wideHits, wideAll: spine.wideAll });
  const adapterLines = [runnerLine, ['class', cls], ...(cls === 'WIDE' ? [['tree', spine.tree]] : []), ...depLines.values()];
  const spineLines = spine.lines.filter((l) => l[0] !== 'core');
  spineLines.push(['core', spine.core.digest]); // CORE-LINE
  const a = gateKeyAssemble(spineLines, adapterLines);
  if (!a.key) return { key: null, reason: a.reason, components: null };
  const all = [...spineLines, ...adapterLines];
  return { key: a.key, components: gateFpComponents(all), manifest: a.manifest, lines: a.lines, class: cls, reason: null };
}

// == components files, run manifest, --why (D17, D24) ==
export function gateFpComponentsWrite(store, spine) {
  if (!store || !store.dir || !spine) return [];
  const out = [];
  for (const text of [spine.gate && spine.gate.text, spine.core && spine.core.text, spine.installed && spine.installed.text, spine.env && spine.env.text]) {
    if (typeof text !== 'string') continue;
    const sha = sha256Bytes(text);
    writeFileOnce(path.join(store.dir, 'components', sha + '.txt'), Buffer.from(text, 'utf8'), 0o644);
    out.push(sha);
  }
  return out;
}

function gateFpComponentText(store, digest) {
  if (!store || !store.dir || !/^[0-9a-f]{64}$/.test(String(digest || ''))) return null;
  try { return readRegularFile(path.join(store.dir, 'components', digest + '.txt'), 16 * 1024 * 1024).toString('utf8'); } catch { return null; }
}

function gateFpLineMap(text, tag) {
  const m = new Map();
  for (const l of String(text || '').split('\n')) {
    const f = l.split('\t');
    if (f[0] === tag && f.length >= 3) m.set(f[1], f.slice(2).join('\t'));
  }
  return m;
}

// gateWhy(prev, now, {store, nowText: {core, env}}) => lines like "invalidated: core (c jest.config.js changed)".
// Env lines name the variable, never a value or an HMAC. A class change subsumes the deps and tree lines it implies.
export function gateWhy(prev, now, opts) {
  const o = opts || {};
  const p = prev || {};
  const n = now || {};
  const order = ['gate', 'runner', 'core', 'installed', 'env', 'platform', 'class', 'tree', 'deps'];
  const val = (x, k) => (x[k] === undefined ? null : x[k]);
  const differs = (k) => val(p, k) !== val(n, k);
  const out = [];
  for (const k of order) {
    if (!differs(k)) continue;
    if ((k === 'deps' || k === 'tree') && differs('class')) continue;
    if (k === 'core') {
      const a = gateFpComponentText(o.store, p.core);
      const b = (o.nowText && o.nowText.core) || gateFpComponentText(o.store, n.core);
      if (a && b) {
        const ma = gateFpLineMap(a, 'c');
        const mb = gateFpLineMap(b, 'c');
        const det = [];
        for (const [path0, s] of mb) { if (!ma.has(path0)) det.push('c ' + path0 + ' added'); else if (ma.get(path0) !== s) det.push('c ' + path0 + ' changed'); }
        for (const path0 of ma.keys()) if (!mb.has(path0)) det.push('c ' + path0 + ' removed');
        if (gateFpLineMap(a, 'c-unresolved').size !== gateFpLineMap(b, 'c-unresolved').size) det.push('unresolved CORE references changed');
        if (!det.length && a !== b) det.push('gate code changed');
        out.push('invalidated: core' + (det.length ? ' (' + det.sort().join(', ') + ')' : ''));
      } else out.push('invalidated: core');
      continue;
    }
    if (k === 'env') {
      const a = gateFpComponentText(o.store, p.env);
      const b = (o.nowText && o.nowText.env) || gateFpComponentText(o.store, n.env);
      if (a !== null && b !== null) {
        const ma = gateFpLineMap(a, 'env');
        const mb = gateFpLineMap(b, 'env');
        const names = new Set();
        for (const [nm, t] of mb) if (ma.get(nm) !== t) names.add(nm);
        for (const nm of ma.keys()) if (!mb.has(nm)) names.add(nm);
        out.push('invalidated: env' + (names.size ? ' (' + Array.from(names).sort().join(', ') + ')' : ''));
      } else out.push('invalidated: env');
      continue;
    }
    if (k === 'class') { out.push('invalidated: class (' + (val(p, 'class') || '-') + ' to ' + (val(n, 'class') || '-') + ')'); continue; }
    out.push('invalidated: ' + k);
  }
  return out;
}

export function gateFpRunDir(runId) {
  return path.join(os.tmpdir(), 'do-it-gate-' + runId);
}

// The rtg-manifest/1 object for adapters (names, paths, digests and HMACs only; no value, G-6).
export function gateFpManifestBuild(spine, run) {
  const r = run || {};
  const wideHits = Array.from(spine.wideHits || []).sort();
  return {
    schema: 'rtg-manifest/1',
    run_id: r.run_id,
    scope: r.scope || 'push',
    leg: r.leg || 'unit',
    clean: !!r.clean,
    runner: spine.runner,
    lines: gateFpSortLines(spine.lines.map(gateFpLineText)),
    argv_sha: sha256Bytes(Buffer.from((r.argv || []).join('\0'), 'utf8')),
    components: { gate: spine.gate.digest, core: spine.core.digest, installed: spine.installed.digest || null, env: spine.env.digest, platform: spine.platform ? sha256Bytes(gateFpLineText(spine.platform)) : null },
    hashes: spine.table.hashes,
    wide_patterns: { node: GATE_FP_WIDE_NODE, python: GATE_FP_WIDE_PY },
    wide_hits: wideHits,
    wide_all: !!spine.wideAll,
    tree: spine.tree,
    dirty: spine.table.dirty,
    never: spine.neverGlobs || [],
    env_names: spine.envNames || [],
    env_files: spine.envFiles || [],
    platform_expect: spine.platform ? spine.platform.slice(1) : null,
    store_dir: r.store_dir || null,
    reason: spine.reason || null,
  };
}

export function gateFpManifestWrite(runDir, manifest) {
  const errors = validateSchema(loadSchemaFile('gate-manifest.1.schema.json'), manifest);
  if (errors.length) throw fail('GATE_MANIFEST_INVALID', 1, { errors: errors.map((e) => e.pointer + ' ' + e.message) });
  const file = path.join(runDir, 'manifest.json');
  atomicWriteJson(file, manifest, { cap: BULK_READ_CAP });
  return file;
}
