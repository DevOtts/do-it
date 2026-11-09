#!/usr/bin/env node
// Stop hook (G-9): a thin mapper over spine `gate stop`. Exit 2 with the reason and board on stderr
// refuses the stop; exit 0 allows it.
//   STOP_REFUSED          -> exit 2
//   PARKED, STOP_ALLOWED  -> exit 0
// The spine alone decides when patience is reached: it counts refusals per run, resets that count when the
// run's rows changed (progress), and parks each run on its own (CONTRACT 3.1). This hook keeps no counter
// and never calls `park` (CP-03 R3-S1-H5: a host-side counter ignored progress and parked the wrong run).
// A `stop-refusals.json` left by an older hook is never read or written again; it is harmless.
// The gate is scoped to this session: the hook passes its session id and cwd, and the spine looks in every
// home the session's runs were started in, not only the cwd's (R3-S1-H7).
// An unreachable or unintelligible spine fails open: a broken gate must not trap the session.
// The spine is spawned from the plugin root, never from the host's cwd: that folder may be gone (a removed
// worktree) or not enterable, and the spine must still gate the session's runs through its registry
// (CP-03 R5-S1-M11). The host's cwd reaches the spine only as --cwd.
import { PLUGIN_ROOT, callSpine, readStdinJson } from './_spine.mjs';

const input = readStdinJson();
// a blank or whitespace session id is no session (CP-03 S1-L2)
const sessionId = typeof input.session_id === 'string' && input.session_id.trim() ? input.session_id.trim() : null;
let cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : null;
if (!cwd) { try { cwd = process.cwd(); } catch { cwd = null; } }
// with neither a session nor a cwd there is nothing to scope the gate to (the spine would read the plugin's own folder)
if (!sessionId && !cwd) process.exit(0);

const { json, overflow } = callSpine(['gate', 'stop', ...(sessionId ? ['--session', sessionId] : []), ...(cwd ? ['--cwd', cwd] : []), '--json'], PLUGIN_ROOT);
const outcome = json && json.outcome;

if (outcome === 'STOP_REFUSED') {
  const count = Number.isFinite(Number(json.stop_refusals)) ? Number(json.stop_refusals) : null;
  const patience = Number.isFinite(Number(json.patience)) ? Number(json.patience) : null;
  const tally = count !== null && patience !== null ? ` (${count} of ${patience} without progress)` : '';
  process.stderr.write(`${json.reason || 'Finish-line rows are still open.'}\n${json.board ? json.board + '\n' : ''}Keep working; stop is refused${tally}.\n`);
  process.exit(2);
}
// CP-03 R6-S1-L2: only an answer that lists open rows is longer than the spine's 64 MiB buffer: a refusal, or a
// park (the next stop then finds the run PARKED, which does not gate)
if (overflow) {
  process.stderr.write('do-it stop gate: the spine\'s answer was too large to read, which only a refusal with a very large board can be. Keep working; stop is refused.\n');
  process.exit(2);
}
// CP-03 R5-S1-M10: a spine that gave no answer (timeout, crash) still fails open, but says so
if (!outcome) process.stderr.write('do-it stop gate: the spine gave no answer, so this stop is allowed unchecked.\n');
// CP-03 R7-S1-L5: a stop allowed because a run's refusal could not be written says so
const lost = json && Array.isArray(json.unwritable) ? json.unwritable.filter((u) => u && !u.refused) : [];
if (outcome === 'STOP_ALLOWED' && lost.length) {
  process.stderr.write('do-it stop gate: this stop is allowed because the refusal could not be written for: ' + lost.map((u) => String(u.run_id) + ' (' + String(u.error) + ')').join('; ') + '\n');
}
process.exit(0);
