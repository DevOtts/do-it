// HostAdapter for the engine host (docs/03 s8; CONTRACT s3). Engine runs each role as a per-task k8s Job, so
// spawn and continue build Job requests (queued on the Engine, not executed in-process). ask fans the pack out to
// every linked channel through ask/channels.mjs; the sync `ask` here queues that fan-out for the async caller.
// Nothing here is Engine runtime code (D1): requests are files and API calls only.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../../core/renderers/html.mjs';
import { renderMarkdown } from '../../core/renderers/markdown.mjs';
import { ask as fanOut, CHANNELS } from './ask/channels.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPABILITIES_PATH = join(HERE, 'capabilities.json');
export const MANIFEST_PATH = join(HERE, 'adapter.manifest.json');
export const EXTRA_SWITCHES = ['renderer.html', 'renderer.md'];

function setPath(obj, path, value) { const p = path.split('.'); let o = obj; for (const k of p.slice(0, -1)) o = o[k]; o[p.at(-1)] = value; }
function hasBoolPath(obj, path) { let o = obj; for (const p of path.split('.')) { if (o == null || !(p in o)) return false; o = o[p]; } return typeof o === 'boolean'; }
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export default function createAdapter(opts = {}) {
  const off = new Set(opts.off || []);
  const workdir = opts.workdir || mkdtempSync(join(tmpdir(), 'doit-engine-'));
  mkdirSync(workdir, { recursive: true });
  const capabilities = readJson(CAPABILITIES_PATH);
  for (const k of off) {
    if (EXTRA_SWITCHES.includes(k)) continue;
    if (!hasBoolPath(capabilities, k)) throw new Error(`unknown capability switch: ${k}`);
    setPath(capabilities, k, false);
  }
  const manifest = readJson(MANIFEST_PATH);
  const tiers = opts.tiers || readJson(join(HERE, 'tiers.json')).tiers;
  const transports = opts.transports || {};
  const context = opts.context || process.env.DO_IT_CONTEXT || 'interactive';
  const stats = { nativeAsk: 0, children: 0, spawns: 0 };
  const secretValues = new Set();
  const spawnsDir = join(workdir, 'spawns');
  const continuesDir = join(workdir, 'continues');
  const outbox = [];
  let seq = 0;

  const buildSpawn = (req) => {
    if (!req || !tiers[req.tier]) return { outcome: 'UNTIERED_SPAWN', reason: 'spawn needs an explicit tier T1, T2 or T3 (G-5)' };
    return { outcome: 'ok', tier: req.tier, model_tier: tiers[req.tier], job: { kind: 'engine.job', role: req.role, model_tier: tiers[req.tier], brief: req.brief, runtime: 'k8s-job' } };
  };
  const writeSpawn = (id, req, built) => {
    const dir = join(spawnsDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'request.json'), JSON.stringify(req));
    stats.spawns += 1;
    const start = Date.now();
    const tmp = join(dir, 'result.json.tmp');
    writeFileSync(tmp, JSON.stringify({ id, role: req.role, tier: built.tier, model_tier: built.model_tier, job: built.job, start, end: Date.now(), mode: 'queued' }));
    renameSync(tmp, join(dir, 'result.json'));
    return { outcome: 'ok', spawn_id: id, tier: built.tier, model_tier: built.model_tier, job: built.job, result_path: join(dir, 'result.json') };
  };

  const adapter = {
    manifest, manifestPath: MANIFEST_PATH, capabilities, capabilitiesPath: CAPABILITIES_PATH,
    off: [...off], workdir, stats, testHooks: true, context, skips: opts.skips || [],
    channels: readJson(join(HERE, 'channels.json')).channels,

    spawn(req) {
      const built = buildSpawn(req);
      if (built.outcome !== 'ok') return { outcome: built.outcome, reason: built.reason };
      return writeSpawn(`s${++seq}`, req, built);
    },
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
      const req = readJson(join(dir, 'request.json'));
      return writeSpawn(dir.split(/[\\/]/).pop(), req, buildSpawn(req));
    },
    // Sync entry for the H0 interface: records the pack for fan-out and returns at once. `delivery` resolves
    // with { delivered, failed } once every linked channel was tried (use askAll for the async result).
    ask(pack) {
      if (!capabilities.ask.native) return { outcome: 'NOT_SUPPORTED', reason: 'ask.native=false' };
      stats.nativeAsk += 1;
      const delivery = Object.keys(transports).length ? fanOut(pack, transports) : Promise.resolve({ delivered: [], failed: [] });
      outbox.push(delivery);
      return { outcome: 'ok', channel: 'native', channels: Object.keys(transports).length ? Object.keys(transports) : CHANNELS, delivery, answers: [] };
    },
    askAll(pack) { stats.nativeAsk += 1; return fanOut(pack, transports); },
    render(channel, pack, path) {
      if (off.has(channel === 'html' ? 'renderer.html' : 'renderer.md')) return { outcome: 'NOT_SUPPORTED' };
      mkdirSync(dirname(path), { recursive: true });
      const withId = { pack_id: null, ...pack, questions: (pack.questions || []).map((q) => ({ options: [], recommendation: null, default: null, reversible: true, kind: 'default', ...q })) };
      writeFileSync(path, channel === 'html' ? renderHtml(withId) : renderMarkdown(withId));
      return { outcome: 'ok', path };
    },
    collect() {
      const results = [], partial = [];
      for (const root of [spawnsDir, continuesDir]) {
        if (!existsSync(root)) continue;
        for (const id of readdirSync(root).sort()) {
          const d = join(root, id);
          if (existsSync(join(d, 'result.json'))) results.push(join(d, 'result.json'));
          else if (existsSync(join(d, 'result.json.tmp'))) partial.push(join(d, 'result.json.tmp'));
        }
      }
      return { outcome: 'ok', results, partial, answers: [] };
    },
    // handoff: { run_id, path }. A cold Job starts from (git ref, previous result file) per D15/D17.
    continue(handoff) {
      if (!capabilities.continue.headless) return { outcome: 'NOT_SUPPORTED' };
      stats.children += 1;
      const id = `c${stats.children}`;
      const dir = join(continuesDir, id);
      mkdirSync(dir, { recursive: true });
      const job = { kind: 'engine.job', run_id: handoff.run_id, handoff: handoff.path, runtime: 'k8s-job', start: 'cold' };
      writeFileSync(join(dir, 'result.json'), JSON.stringify({ id, job, mode: 'queued' }));
      return { outcome: 'ok', run_id: handoff.run_id, continue_id: id, job, mode: 'queued' };
    },
    resume(handoff) { return adapter.continue(handoff); },
    wake() { return { outcome: 'NOT_SUPPORTED', reason: 'wake.native=false: the Engine dispatcher owns scheduling' }; },
    meter() { return null; },
    hooks: { stopGate: () => (capabilities.hooks.stop_gate ? { mode: 'hook' } : null) },
    flushAsks: () => Promise.all(outbox),

    drivers: {
      isolation: {
        create(name) { const d = join(workdir, 'iso', name); mkdirSync(d, { recursive: true }); return d; },
        remove(name) { rmSync(join(workdir, 'iso', name), { recursive: true, force: true }); },
      },
      secrets: {
        use(ref, fn) {
          const v = process.env[ref.replace(/^env:/, '')];
          if (v === undefined) return { present: false };
          secretValues.add(v);
          appendFileSync(join(workdir, 'secrets.log'), `used ${ref}\n`);
          fn(v);
          return { present: true };
        },
        redact(text) { let t = String(text); for (const v of secretValues) t = t.split(v).join('[REDACTED]'); return t; },
        describe(ref) { return { ref, present: process.env[ref.replace(/^env:/, '')] !== undefined }; },
      },
      stateStore: opts.stateStore || {
        put(key, value) { const p = join(workdir, 'runs', key); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(value)); },
        get(key) { const p = join(workdir, 'runs', key); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; },
        append(key, row) { const p = join(workdir, 'runs', key); mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, JSON.stringify(row) + '\n'); },
        list(prefix = '') { const d = join(workdir, 'runs', prefix); return existsSync(d) ? readdirSync(d) : []; },
      },
    },
  };
  return adapter;
}
