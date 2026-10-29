#!/usr/bin/env node
// Stop hook (G-9). Exit 2 with a reason on stderr refuses the stop; exit 0 allows it.
// After `patience` refusals without progress it calls spine `park` and allows the stop.
// The gate is scoped to this session and cwd: it only ever refuses the run they own.
// The refusal counter is a host-side file (the spine alone writes state.json, G-1).
// An unreachable or unintelligible spine fails open: a broken gate must not trap the session.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callSpine, readStdinJson } from './_spine.mjs';

const input = readStdinJson();
const cwd = input.cwd || process.cwd();
const dir = join(process.env.DO_IT_HOME || cwd, '.do-it', 'host-claude-code');
const file = join(dir, 'stop-refusals.json');
const key = input.session_id || 'session';

const load = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
const save = (n) => { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ ...load(), [key]: n })); };

const { json } = callSpine(['gate', 'stop', '--session', key, '--cwd', cwd, '--json'], cwd);
const outcome = json && json.outcome;
const patience = Number(json?.patience ?? process.env.DO_IT_STOP_PATIENCE ?? 3);

if (outcome === 'STOP_REFUSED') {
  const count = json.progress === true ? 0 : (Number(load()[key]) || 0);
  if (count >= patience) {
    callSpine(['park', ...(json.run_id ? ['--run', json.run_id] : []), '--reason', 'stop-gate patience reached without progress', '--json'], cwd);
    process.exit(0);
  }
  save(count + 1);
  process.stderr.write(`${json.reason || 'Finish-line rows are still open.'}\n${json.board ? json.board + '\n' : ''}Keep working; stop is refused (${count + 1} of ${patience}).\n`);
  process.exit(2);
}
if (outcome === 'STOP_ALLOWED') save(0);
process.exit(0);
