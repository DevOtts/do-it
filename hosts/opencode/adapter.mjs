// HostAdapter for the opencode host. Shape: docs/03 s8, B7.
// spawn runs a separate `opencode run --format json` per call (sequential, cwd = slice dir); continue resumes by
// session id; ask is markdown; wake parks; the stop-gate and ceiling are a conductor checklist.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSpawn, loadTiers, runOpencode, listModels } from './lib/spawn.mjs';
import { createContinuer } from './lib/continue.mjs';
import { combine, readExport } from './lib/meter.mjs';
import { parseEvents, sessionIdOf, errorOf } from './lib/events.mjs';
import { createDrivers } from '../_interface/lib/drivers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPABILITIES_PATH = join(HERE, 'capabilities.json');
export const MANIFEST_PATH = join(HERE, 'adapter.manifest.json');
export const EXTRA_SWITCHES = ['renderer.html', 'renderer.md'];
export const MAX_QUESTIONS = 4;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function setPath(obj, path, value) { const p = path.split('.'); let o = obj; for (const k of p.slice(0, -1)) o = o[k]; o[p.at(-1)] = value; }
function hasBoolPath(obj, path) { let o = obj; for (const p of path.split('.')) { if (o == null || !(p in o)) return false; o = o[p]; } return typeof o === 'boolean'; }

export default function createAdapter(opts = {}) {
  const off = new Set(opts.off || []);
  const workdir = opts.workdir || mkdtempSync(join(tmpdir(), 'doit-opencode-'));
  mkdirSync(workdir, { recursive: true });
  const capabilities = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  for (const k of off) {
    if (EXTRA_SWITCHES.includes(k)) continue;
    if (!hasBoolPath(capabilities, k)) throw new Error(`unknown capability switch: ${k}`);
    setPath(capabilities, k, false);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const tiers = opts.tiers ? { tiers: opts.tiers } : loadTiers();
  const stats = { nativeAsk: 0, children: 0, spawns: 0 };
  const spawnsDir = join(workdir, 'spawns');
  const continuesDir = join(workdir, 'continues');
  const runContinue = createContinuer();
  let seq = 0;
  let last = null; // { sessionId, cwd }

  const runSpawn = (id, req, built) => {
    const dir = join(spawnsDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'request.json'), JSON.stringify(req));
    stats.spawns += 1;
    const start = Date.now();
    const prior = existsSync(join(dir, 'session.json')) ? JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).session_id : null;
    const argv = prior ? ['opencode', 'run', '-s', prior, ...built.argv.slice(2)] : built.argv;
    const r = runOpencode(argv, { cwd: built.cwd, timeoutMs: req.timeoutMs });
    const { events } = parseEvents(r.stdout);
    const sid = sessionIdOf(events) || prior;
    if (sid) writeFileSync(join(dir, 'session.json'), JSON.stringify({ session_id: sid, cwd: built.cwd }));
    const err = errorOf(events);
    if (r.error || r.status !== 0 || err || !sid) {
      writeFileSync(join(dir, 'result.json.tmp'), r.stdout);
      return { outcome: 'HANDOFF_FAILED', spawn_id: id, session_id: sid, reason: r.error || err || (r.signal ? `killed by ${r.signal}` : r.status !== 0 ? `exit ${r.status}` : 'no sessionID in output') };
    }
    writeFileSync(join(dir, 'events.jsonl'), r.stdout);
    last = { sessionId: sid, cwd: built.cwd };
    const tmp = join(dir, 'result.json.tmp');
    writeFileSync(tmp, JSON.stringify({ id, role: req.role, tier: built.tier, model: built.model, session_id: sid, argv: argv.slice(0, -1), event: built.event, start, end: Date.now(), mode: 'run' }));
    renameSync(tmp, join(dir, 'result.json'));
    return { outcome: 'ok', spawn_id: id, session_id: sid, tier: built.tier, model: built.model, argv, event: built.event, result_path: join(dir, 'result.json'), events_path: join(dir, 'events.jsonl') };
  };

  const adapter = {
    manifest, manifestPath: MANIFEST_PATH, capabilities, capabilitiesPath: CAPABILITIES_PATH,
    off: [...off], workdir, stats, testHooks: true,
    skips: opts.skips || [],

    // req: { role, tier, brief, dir?, reason?, provider?, dryRun?, timeoutMs? }
    spawn(req) {
      const models = req && req.provider ? (opts.models || listModels()) : null;
      const built = buildSpawn(req || {}, tiers, models);
      if (built.outcome !== 'ok') return { outcome: built.outcome, reason: built.reason };
      if (req.dryRun) return { outcome: 'ok', dry_run: true, argv: built.argv, cwd: built.cwd, model: built.model };
      return runSpawn(`s${++seq}`, req, built);
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
    // Re-run a spawn whose child died: one `run -s SESSION` when a session id was captured, else a fresh run.
    respawn(dir) {
      const req = JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8'));
      const models = req.provider ? (opts.models || listModels()) : null;
      const built = buildSpawn(req, tiers, models);
      const r = runSpawn(dir.split(/[\\/]/).pop(), req, built);
      if (r.outcome === 'ok') rmSync(join(dir, 'result.json.tmp'), { force: true });
      return r;
    },
    // Native ask is not available (the question tool is unconfirmed): markdown, or html past max questions.
    ask(pack) {
      const n = pack && Array.isArray(pack.questions) ? pack.questions.length : 0;
      const channel = n === 0 || n > MAX_QUESTIONS ? 'html' : 'markdown';
      return { outcome: 'NOT_SUPPORTED', channel, reason: n > MAX_QUESTIONS ? `questions>${MAX_QUESTIONS}` : 'ask.native=false' };
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
    // handoff: { run_id, path, session_id?, resume?, cwd?, tier?, model?, timeoutMs?, prompt? }
    continue(handoff) {
      if (!capabilities.continue.headless) return { outcome: 'NOT_SUPPORTED' };
      stats.children += 1;
      const model = handoff.model || (handoff.tier ? (tiers.tiers || {})[handoff.tier] : undefined);
      const r = runContinue({
        runId: handoff.run_id, path: handoff.path, sessionId: handoff.session_id, resume: handoff.resume,
        cwd: handoff.cwd, model, timeoutMs: handoff.timeoutMs, prompt: handoff.prompt, outDir: continuesDir,
      });
      if (r.outcome === 'ok') last = { sessionId: r.session_id, cwd: handoff.cwd || process.cwd() };
      return { ...r, ...(r.outcome === 'ok' ? { run_id: handoff.run_id } : {}) };
    },
    resume(handoff) { return adapter.continue({ ...handoff, resume: true }); },
    // No scheduler on opencode: park. Writes nothing.
    wake(at) {
      return { outcome: 'PARKED', reason: 'wake.native=false', at, message: `No wake-up available on opencode: run parked at ${at}; resume manually.` };
    },
    // meter({ exported, stats, text }) combines given data; meter() exports the last session. Unknown, never zero.
    meter(sample) {
      if (sample && typeof sample === 'object') return combine(sample);
      if (!last) return null;
      try { return combine({ exported: readExport(last.sessionId, { cwd: last.cwd }) }); } catch { return combine({}); }
    },
    hooks: { stopGate: () => (capabilities.hooks.stop_gate ? { mode: 'hook' } : null) },
    drivers: createDrivers({ workdir, repo: opts.repo }),
  };
  return adapter;
}
