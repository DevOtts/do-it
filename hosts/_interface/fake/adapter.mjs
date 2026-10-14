// Fake HostAdapter: every capability can be switched off. Never counts as evidence for a [REAL] case (G-3).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPABILITIES_PATH = join(HERE, 'capabilities.json');
export const MANIFEST_PATH = join(HERE, 'adapter.manifest.json');

// Switches that are not capabilities in capabilities.json.
export const EXTRA_SWITCHES = ['renderer.html', 'renderer.md'];

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p];
  o[parts.at(-1)] = value;
}
function hasBoolPath(obj, path) {
  let o = obj;
  for (const p of path.split('.')) { if (o == null || !(p in o)) return false; o = o[p]; }
  return typeof o === 'boolean';
}

export default function createAdapter(opts = {}) {
  const off = new Set(opts.off || []);
  const workdir = opts.workdir || mkdtempSync(join(tmpdir(), 'doit-fake-'));
  mkdirSync(workdir, { recursive: true });
  const capabilities = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  for (const k of off) {
    if (EXTRA_SWITCHES.includes(k)) continue;
    if (!hasBoolPath(capabilities, k)) throw new Error(`unknown capability switch: ${k}`);
    setPath(capabilities, k, false);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const stats = { nativeAsk: 0, children: 0, spawns: 0 };
  const secretValues = new Set();
  let seq = 0;

  const spawnsDir = join(workdir, 'spawns');
  const atomicWrite = (dir, data) => {
    const tmp = join(dir, 'result.json.tmp');
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, join(dir, 'result.json'));
  };
  const runSpawn = (id, req) => {
    const dir = join(spawnsDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'request.json'), JSON.stringify(req));
    stats.spawns += 1;
    const start = Date.now();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3); // keep spans distinguishable
    atomicWrite(dir, { id, role: req.role, tier: req.tier, start, end: Date.now(), mode: capabilities.spawn.native ? 'native' : 'sequential' });
    return { outcome: 'ok', spawn_id: id, result_path: join(dir, 'result.json') };
  };

  const adapter = {
    manifest, manifestPath: MANIFEST_PATH, capabilitiesPath: CAPABILITIES_PATH,
    capabilities, off: [...off], workdir, stats, testHooks: true,
    skips: opts.skips || [],

    spawn(req) {
      if (!req || !req.tier) return { outcome: 'UNTIERED_SPAWN' }; // G-4
      return runSpawn(`s${++seq}`, req);
    },
    // Test hook: a child process that dies by SIGKILL after writing the tmp file, before rename.
    spawnCrashing(req) {
      const id = `s${++seq}`;
      const dir = join(spawnsDir, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'request.json'), JSON.stringify(req));
      const code = `require('fs').writeFileSync(${JSON.stringify(join(dir, 'result.json.tmp'))},'{"partial":');process.kill(process.pid,'SIGKILL')`;
      const r = spawnSync(process.execPath, ['-e', code]);
      return { id, killed: r.signal === 'SIGKILL', signal: r.signal };
    },
    respawn(dir) {
      const req = JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8'));
      return runSpawn(dir.split(/[\\/]/).pop(), req);
    },
    ask(pack) {
      if (!capabilities.ask.native) return { outcome: 'NOT_SUPPORTED' };
      stats.nativeAsk += 1;
      return { outcome: 'ok', channel: 'native', answers: pack.questions.map((q) => ({ n: q.n, answer: q.default ?? 'default' })) };
    },
    render(channel, pack, path) {
      if (off.has(channel === 'html' ? 'renderer.html' : 'renderer.md')) return { outcome: 'NOT_SUPPORTED' };
      writeFileSync(path, channel === 'html' ? `<ol>${pack.questions.map((q) => `<li>${q.text}</li>`).join('')}</ol>` : pack.questions.map((q) => `${q.n}. ${q.text}`).join('\n'));
      return { outcome: 'ok', path };
    },
    collect() {
      const results = [], partial = [];
      if (existsSync(spawnsDir)) {
        for (const id of readdirSync(spawnsDir)) {
          const d = join(spawnsDir, id);
          if (existsSync(join(d, 'result.json'))) results.push(join(d, 'result.json'));
          else if (existsSync(join(d, 'result.json.tmp'))) partial.push(join(d, 'result.json.tmp'));
        }
      }
      return { outcome: 'ok', results, partial, answers: [] };
    },
    continue(handoff) {
      if (!capabilities.continue.headless) return { outcome: 'NOT_SUPPORTED' };
      stats.children += 1;
      const r = spawnSync(process.execPath, ['-e', `process.exit(${Number(opts.continueExit || 0)})`]);
      return r.status === 0 ? { outcome: 'ok', run_id: handoff.run_id } : { outcome: 'HANDOFF_FAILED', status: r.status };
    },
    wake(at, prompt) {
      if (!capabilities.wake.native) return { outcome: 'NOT_SUPPORTED' };
      const dir = join(workdir, 'timers');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `t${++seq}.json`), JSON.stringify({ at, prompt }));
      return { outcome: 'ok', at };
    },
    meter() {
      if (opts.meterNull || !capabilities.meter.provider_usage) return null;
      return { tokens_in: 120, tokens_out: 30, cache_read: 0, cache_write: 0 };
    },
    hooks: { stopGate: () => (capabilities.hooks.stop_gate ? { mode: 'hook' } : null) },

    drivers: {
      isolation: {
        create(name) { const d = join(workdir, 'iso', name); mkdirSync(d, { recursive: true }); return d; },
        remove(name) { rmSync(join(workdir, 'iso', name), { recursive: true, force: true }); },
      },
      secrets: {
        // The value is handed to fn and never returned, logged or stored in files.
        use(ref, fn) {
          const name = ref.replace(/^env:/, '');
          const v = process.env[name];
          if (v === undefined) return { present: false };
          secretValues.add(v);
          appendFileSync(join(workdir, 'secrets.log'), `used ${ref}\n`);
          fn(v);
          return { present: true };
        },
        redact(text) { let t = String(text); for (const v of secretValues) t = t.split(v).join('[REDACTED]'); return t; },
        describe(ref) { return { ref, present: process.env[ref.replace(/^env:/, '')] !== undefined }; },
      },
      stateStore: {
        put(key, value) { const p = join(workdir, 'runs', key); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(value)); },
        get(key) { const p = join(workdir, 'runs', key); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; },
        append(key, row) { const p = join(workdir, 'runs', key); mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, JSON.stringify(row) + '\n'); },
        list(prefix = '') { const d = join(workdir, 'runs', prefix); return existsSync(d) ? readdirSync(d) : []; },
      },
    },
  };
  return adapter;
}
