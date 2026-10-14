// Documented fallbacks (CONTRACT section 6). Capability checks are adapter data, so this module
// lives under hosts/ and the spine calls it through the adapter (amendment A2).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { meterRow } from './estimate.mjs';

export const HANDOFF_CAP = 5;

// spawn.native=false: roles run as separate sequential passes. Returns the mode and recorded spans.
export function spawnRoles(adapter, roles) {
  const mode = adapter.capabilities.spawn.native ? 'native' : 'sequential';
  const spans = [];
  const results = [];
  const runOne = (r) => {
    const start = Date.now();
    const res = adapter.spawn(r);
    spans.push({ role: r.role, start, end: Date.now() });
    results.push(res);
  };
  // Both modes run one after another here; native hosts may overlap in production.
  for (const r of roles) runOne(r);
  return { mode, spans, results };
}

// ask chain: native (<= max_questions) then html then markdown.
export function askChain(adapter, pack, dir) {
  const caps = adapter.capabilities;
  const attempted = [];
  if (caps.ask.native && pack.questions.length <= caps.ask.max_questions) {
    attempted.push('native');
    const r = adapter.ask(pack);
    if (r.outcome === 'ok') return { channel: 'native', attempted, answers: r.answers };
  }
  for (const [channel, file] of [['html', 'owner-pack.html'], ['markdown', 'owner-pack.md']]) {
    attempted.push(channel);
    const r = adapter.render(channel, pack, join(dir, file));
    if (r.outcome === 'ok') return { channel, attempted, path: r.path };
  }
  return { channel: null, attempted, outcome: 'NOT_SUPPORTED' };
}

// continue.headless=false: handoff.mode ask plus a one-line command; nothing is spawned.
export function continueOrAsk(adapter, handoff) {
  if (!adapter.capabilities.continue.headless) {
    const command = `do-it resume --run ${String(handoff.run_id).replace(/\s+/g, '_')} --handoff ${String(handoff.path).replace(/\s+/g, '_')}`;
    return { outcome: 'handoff.mode:ask', mode: 'ask', command };
  }
  return adapter.continue(handoff);
}

// Attempt counter for headless starts (CONTRACT M3): HANDOFF_FAILED x4, ESCALATED at the cap, then refused.
export function createAttemptCounter(cap = HANDOFF_CAP) {
  return { cap, attempts: 0, escalated: false };
}
export function handoffAttempt(counter, run) {
  if (counter.escalated) return { outcome: 'ESCALATED', attempts: counter.attempts, refused: true };
  counter.attempts += 1;
  const r = run();
  if (r && r.ok) return { outcome: 'ok', attempts: counter.attempts };
  if (counter.attempts >= counter.cap) {
    counter.escalated = true;
    return { outcome: 'ESCALATED', attempts: counter.attempts };
  }
  return { outcome: 'HANDOFF_FAILED', attempts: counter.attempts };
}
// A real child process that exits non-zero, for failure-path tests.
export function failingStart() {
  const r = spawnSync(process.execPath, ['-e', 'process.exit(1)']);
  return { ok: r.status === 0, status: r.status };
}

// wake.native=false: park and say so. Writes nothing.
export function wakeOrPark(adapter, at, prompt) {
  if (!adapter.capabilities.wake.native) {
    return { outcome: 'PARKED', reason: 'wake.native=false', message: `No wake-up available on this host: run parked at ${at}; resume manually.` };
  }
  return adapter.wake(at, prompt);
}

// hooks.stop_gate=false: conductor checklist (default R5).
export const STOP_GATE_CHECKLIST = [
  'Run `do-it gate stop` and read its exit code before ending the turn.',
  'If any finish-line row is OPEN and no owner question is pending, continue the run.',
  'After 3 refusals without progress, park the run and ask the owner (G-9).',
];
export function stopGate(adapter) {
  if (adapter.capabilities.hooks.stop_gate) return { mode: 'hook' };
  return { mode: 'checklist', items: STOP_GATE_CHECKLIST.slice() };
}

// No provider usage: estimate from text and flag it (owner ruling D5).
export function meterFor(adapter, text) {
  return meterRow(adapter.meter(), text);
}

// Recovery: a host killed mid-spawn leaves result.json.tmp; never read it, re-run the spawn once.
export function resumePartials(adapter) {
  const col = adapter.collect();
  const rerun = [];
  for (const p of col.partial) {
    const dir = p.replace(/[\\/][^\\/]+$/, '');
    rmSync(p, { force: true });
    rerun.push(adapter.respawn(dir));
  }
  return { rerun };
}
export function listTmp(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.tmp')) : [];
}
