// HostAdapter for the claude-code host (reference host). Shape: docs/03 s8, B7.
// spawn builds the Agent tool request (only the conductor model can call the tool); continue runs the
// real headless binary; ask builds the AskUserQuestion payload; meter reads the json result.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSpawn, loadTiers } from './lib/spawn.mjs';
import { createContinuer } from './lib/continue.mjs';
import { mapPack } from './lib/ask-map.mjs';
import { buildWake } from './lib/wake.mjs';
import { usageFromResult } from './lib/meter.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPABILITIES_PATH = join(HERE, 'capabilities.json');
export const MANIFEST_PATH = join(HERE, 'adapter.manifest.json');
export const EXTRA_SWITCHES = ['renderer.html', 'renderer.md'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  const workdir = opts.workdir || mkdtempSync(join(tmpdir(), 'doit-claude-'));
  mkdirSync(workdir, { recursive: true });
  const capabilities = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  for (const k of off) {
    if (EXTRA_SWITCHES.includes(k)) continue;
    if (!hasBoolPath(capabilities, k)) throw new Error(`unknown capability switch: ${k}`);
    setPath(capabilities, k, false);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const tiers = opts.tiers || loadTiers();
  const context = opts.context || process.env.DO_IT_CONTEXT || 'interactive';
  const stats = { nativeAsk: 0, children: 0, spawns: 0 };
  const secretValues = new Set();
  const spawnsDir = join(workdir, 'spawns');
  const continuesDir = join(workdir, 'continues');
  const runContinue = createContinuer();
  let seq = 0;
  let lastResult = null;

  const writeSpawn = (id, req, built) => {
    const dir = join(spawnsDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'request.json'), JSON.stringify(req));
    stats.spawns += 1;
    const start = Date.now();
    const tmp = join(dir, 'result.json.tmp');
    writeFileSync(tmp, JSON.stringify({ id, role: req.role, tier: built.tier, model: built.model, request: built.request, event: built.event, start, end: Date.now(), mode: 'native' }));
    renameSync(tmp, join(dir, 'result.json'));
    return { outcome: 'ok', spawn_id: id, tier: built.tier, model: built.model, request: built.request, event: built.event, result_path: join(dir, 'result.json') };
  };

  const adapter = {
    manifest, manifestPath: MANIFEST_PATH, capabilities, capabilitiesPath: CAPABILITIES_PATH,
    off: [...off], workdir, stats, testHooks: true, context,
    skips: opts.skips || [],

    spawn(req) {
      const built = buildSpawn(req || {}, tiers);
      if (built.outcome !== 'ok') return { outcome: built.outcome, reason: built.reason };
      return writeSpawn(`s${++seq}`, req, built);
    },
    // Test hook: a child that dies by SIGKILL after writing the tmp file, before the rename.
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
      const built = buildSpawn(req, tiers);
      return writeSpawn(dir.split(/[\\/]/).pop(), req, built);
    },
    ask(pack) {
      const m = capabilities.ask.native ? mapPack(pack, capabilities.ask.max_questions) : { channel: 'html', reason: 'ask.native=false' };
      if (m.channel !== 'native') return { outcome: 'NOT_SUPPORTED', reason: m.reason };
      stats.nativeAsk += 1;
      // The conductor model makes the AskUserQuestion call with this payload and feeds answers back.
      return { outcome: 'ok', channel: 'native', payload: m.payload, answers: [] };
    },
    render(channel, pack, path) {
      if (off.has(channel === 'html' ? 'renderer.html' : 'renderer.md')) return { outcome: 'NOT_SUPPORTED' };
      const qs = pack.questions || [];
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, channel === 'html'
        ? `<!doctype html><meta charset="utf-8"><ol>${qs.map((q) => `<li>${esc(q.text)}</li>`).join('')}</ol>`
        : qs.map((q) => `${q.n}. ${q.text}`).join('\n'));
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
    // handoff: { run_id, path, alias?, profileDir?, cwd?, session_id?, resume?, maxBudgetUsd?, timeoutMs?, prompt? }
    continue(handoff) {
      if (!capabilities.continue.headless) return { outcome: 'NOT_SUPPORTED' };
      stats.children += 1;
      const r = runContinue({
        runId: handoff.run_id, path: handoff.path, alias: handoff.alias, profileDir: handoff.profileDir, cwd: handoff.cwd,
        sessionId: handoff.session_id, resume: handoff.resume, maxBudgetUsd: handoff.maxBudgetUsd, timeoutMs: handoff.timeoutMs,
        prompt: handoff.prompt, outDir: continuesDir,
      });
      if (r.outcome === 'ok') lastResult = r.result;
      const { result, ...rest } = r;
      return { ...rest, ...(r.outcome === 'ok' ? { run_id: handoff.run_id } : {}) };
    },
    // Re-issue a continuation for a session whose child died: `-r` with the same id.
    resume(handoff) {
      return adapter.continue({ ...handoff, resume: true });
    },
    wake(at, prompt) {
      if (!capabilities.wake.native) return { outcome: 'NOT_SUPPORTED' };
      return buildWake(at, prompt, context);
    },
    // Usage of the given json result, else of the last successful continuation; null when none.
    meter(result) {
      return usageFromResult(result ?? lastResult);
    },
    hooks: { stopGate: () => (capabilities.hooks.stop_gate ? { mode: 'hook' } : null) },

    drivers: {
      isolation: {
        // With opts.repo the isolation is a git worktree; otherwise a scratch directory.
        create(name) {
          const d = join(workdir, 'iso', name);
          if (opts.repo) {
            mkdirSync(dirname(d), { recursive: true });
            const r = spawnSync('git', ['-C', opts.repo, 'worktree', 'add', '-b', name, d], { encoding: 'utf8' });
            if (r.status !== 0) throw new Error(`worktree add failed: ${r.stderr.trim()}`);
          } else mkdirSync(d, { recursive: true });
          return d;
        },
        remove(name) {
          const d = join(workdir, 'iso', name);
          if (opts.repo) spawnSync('git', ['-C', opts.repo, 'worktree', 'remove', '--force', d]);
          rmSync(d, { recursive: true, force: true });
        },
      },
      secrets: {
        // The value is handed to fn and never returned, logged or stored (G-7).
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
