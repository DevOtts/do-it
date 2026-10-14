// HostAdapter for the codex host. Shape: docs/03 s8, B7.
// spawn runs a separate `codex exec --json` per call (sequential); continue resumes by thread id;
// ask is markdown unless the feature flag is on; wake parks; the stop-gate is a conductor checklist.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSpawn, loadTiers, runCodex } from './lib/spawn.mjs';
import { createContinuer } from './lib/continue.mjs';
import { chooseChannel, requestUserInputEnabled } from './lib/ask.mjs';
import { usageFromEvents, loadPrices } from './lib/meter.mjs';
import { parseJsonl, threadIdOf, hasTurnCompleted } from './lib/jsonl.mjs';
import { createDrivers } from '../_interface/lib/drivers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPABILITIES_PATH = join(HERE, 'capabilities.json');
export const MANIFEST_PATH = join(HERE, 'adapter.manifest.json');
export const EXTRA_SWITCHES = ['renderer.html', 'renderer.md'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function setPath(obj, path, value) { const p = path.split('.'); let o = obj; for (const k of p.slice(0, -1)) o = o[k]; o[p.at(-1)] = value; }
function hasBoolPath(obj, path) { let o = obj; for (const p of path.split('.')) { if (o == null || !(p in o)) return false; o = o[p]; } return typeof o === 'boolean'; }

export default function createAdapter(opts = {}) {
  const off = new Set(opts.off || []);
  const workdir = opts.workdir || mkdtempSync(join(tmpdir(), 'doit-codex-'));
  mkdirSync(workdir, { recursive: true });
  const capabilities = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  for (const k of off) {
    if (EXTRA_SWITCHES.includes(k)) continue;
    if (!hasBoolPath(capabilities, k)) throw new Error(`unknown capability switch: ${k}`);
    setPath(capabilities, k, false);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const tiers = opts.tiers ? { tiers: opts.tiers } : loadTiers();
  const prices = opts.prices !== undefined ? opts.prices : loadPrices();
  const stats = { nativeAsk: 0, children: 0, spawns: 0 };
  const spawnsDir = join(workdir, 'spawns');
  const continuesDir = join(workdir, 'continues');
  const runContinue = createContinuer();
  let seq = 0;
  let lastRow = null;

  // Feature flag: opts.featuresText (tests) else the real `codex features list`, read once.
  let nativeFlag;
  const askNative = () => {
    if (nativeFlag === undefined) {
      try { nativeFlag = requestUserInputEnabled(opts.featuresText ?? execFileSync('codex', ['features', 'list'], { encoding: 'utf8', timeout: 30000 })); } catch { nativeFlag = false; }
    }
    return nativeFlag;
  };

  // Run one spawn into spawns/<id>/. A complete run (exit 0 and turn.completed) gets result.json; anything else
  // leaves the raw stdout as result.json.tmp and a session.json so a resume can reuse the thread id.
  const runSpawn = (id, req, built) => {
    const dir = join(spawnsDir, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'request.json'), JSON.stringify(req));
    stats.spawns += 1;
    const start = Date.now();
    const prior = existsSync(join(dir, 'session.json')) ? JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).thread_id : null;
    const argv = prior ? ['codex', 'exec', 'resume', prior, '--json'] : built.argv;
    const r = runCodex(argv, { stdin: built.stdin, cwd: built.cwd, timeoutMs: req.timeoutMs });
    const { events } = parseJsonl(r.stdout);
    const sid = threadIdOf(events) || prior;
    if (sid) writeFileSync(join(dir, 'session.json'), JSON.stringify({ thread_id: sid }));
    const ok = !r.error && r.status === 0 && hasTurnCompleted(events);
    if (!ok) {
      writeFileSync(join(dir, 'result.json.tmp'), r.stdout);
      return { outcome: 'HANDOFF_FAILED', spawn_id: id, session_id: sid, reason: r.error || (r.signal ? `killed by ${r.signal}` : r.status !== 0 ? `exit ${r.status}` : 'no turn.completed event') };
    }
    writeFileSync(join(dir, 'events.jsonl'), r.stdout);
    const row = usageFromEvents(events, { prices, model: built.model });
    lastRow = row;
    const tmp = join(dir, 'result.json.tmp');
    writeFileSync(tmp, JSON.stringify({ id, role: req.role, tier: built.tier, model: built.model, session_id: sid, argv, usage: row, event: built.event, start, end: Date.now(), mode: 'exec' }));
    renameSync(tmp, join(dir, 'result.json'));
    return { outcome: 'ok', spawn_id: id, session_id: sid, tier: built.tier, model: built.model, argv, event: built.event, usage: row, result_path: join(dir, 'result.json'), events_path: join(dir, 'events.jsonl') };
  };

  const adapter = {
    manifest, manifestPath: MANIFEST_PATH, capabilities, capabilitiesPath: CAPABILITIES_PATH,
    off: [...off], workdir, stats, testHooks: true,
    skips: opts.skips || [],

    // req: { role, tier, brief, dir?, reason?, dryRun?, timeoutMs? }
    spawn(req) {
      const built = buildSpawn(req || {}, tiers);
      if (built.outcome !== 'ok') return { outcome: built.outcome, reason: built.reason };
      if (req.dryRun) return { outcome: 'ok', dry_run: true, argv: built.argv, stdin: built.stdin, cwd: built.cwd, model: built.model, sandbox: built.sandbox };
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
    // Re-run a spawn whose child died: one `exec resume` when a thread id was captured, else a fresh run.
    respawn(dir) {
      const req = JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8'));
      const built = buildSpawn(req, tiers);
      const r = runSpawn(dir.split(/[\\/]/).pop(), req, built);
      if (r.outcome === 'ok') rmSync(join(dir, 'result.json.tmp'), { force: true });
      return r;
    },
    ask(pack) {
      const m = chooseChannel(pack, askNative(), capabilities.ask.max_questions);
      if (m.channel !== 'native') return { outcome: 'NOT_SUPPORTED', channel: m.channel, reason: m.reason };
      stats.nativeAsk += 1;
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
    // handoff: { run_id, path, session_id?, resume?, allow_last?, dir?, tier?, model?, role?, timeoutMs?, prompt? }
    continue(handoff) {
      if (!capabilities.continue.headless) return { outcome: 'NOT_SUPPORTED' };
      stats.children += 1;
      const model = handoff.model || (handoff.tier ? (tiers.tiers || {})[handoff.tier] : undefined);
      const r = runContinue({
        runId: handoff.run_id, path: handoff.path, sessionId: handoff.session_id, resume: handoff.resume, allowLast: handoff.allow_last,
        dir: handoff.dir, cwd: handoff.cwd, model, role: handoff.role, timeoutMs: handoff.timeoutMs, prompt: handoff.prompt, outDir: continuesDir,
      });
      if (r.outcome === 'ok' && r.events) lastRow = usageFromEvents(r.events, { prices, model });
      const { events, ...rest } = r;
      return { ...rest, ...(r.outcome === 'ok' ? { run_id: handoff.run_id } : {}) };
    },
    resume(handoff) { return adapter.continue({ ...handoff, resume: true }); },
    // No wake mechanism seen (goals and queue semantics unknown): park. Writes nothing.
    wake(at, prompt) {
      return { outcome: 'PARKED', reason: 'wake.native=false', at, message: `No wake-up available on codex: run parked at ${at}; resume manually.` };
    },
    // Usage of the given events/JSONL, else of the last successful run; null when none.
    meter(sample) {
      if (sample !== undefined && sample !== null) {
        const events = Array.isArray(sample) ? sample : parseJsonl(typeof sample === 'string' ? sample : '').events;
        return usageFromEvents(events, { prices });
      }
      return lastRow;
    },
    hooks: { stopGate: () => (capabilities.hooks.stop_gate ? { mode: 'hook' } : null) },
    drivers: createDrivers({ workdir, repo: opts.repo }),
  };
  return adapter;
}
