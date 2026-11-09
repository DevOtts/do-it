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
import { callSpine, readStdinJson } from './_spine.mjs';

const input = readStdinJson();
// a blank or whitespace session id is no session (CP-03 S1-L2)
const sessionId = typeof input.session_id === 'string' && input.session_id.trim() ? input.session_id.trim() : null;
const cwd = input.cwd || process.cwd();

const { json } = callSpine(['gate', 'stop', ...(sessionId ? ['--session', sessionId] : []), '--cwd', cwd, '--json'], cwd);
const outcome = json && json.outcome;

if (outcome === 'STOP_REFUSED') {
  const count = Number.isFinite(Number(json.stop_refusals)) ? Number(json.stop_refusals) : null;
  const patience = Number.isFinite(Number(json.patience)) ? Number(json.patience) : null;
  const tally = count !== null && patience !== null ? ` (${count} of ${patience} without progress)` : '';
  process.stderr.write(`${json.reason || 'Finish-line rows are still open.'}\n${json.board ? json.board + '\n' : ''}Keep working; stop is refused${tally}.\n`);
  process.exit(2);
}
// CP-03 R5-S1-M10: a spine that gave no answer (timeout, crash) still fails open, but says so
if (!outcome) process.stderr.write('do-it stop gate: the spine gave no answer, so this stop is allowed unchecked.\n');
process.exit(0);
