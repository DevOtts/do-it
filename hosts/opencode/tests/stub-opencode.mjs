// Stub `opencode` for unit cases. Env: STUB_MODE = ok | fail | partial-then-ok ; STUB_LOG = file receiving one JSON line per call.
import { appendFileSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const log = process.env.STUB_LOG;
if (log) appendFileSync(log, JSON.stringify({ argv: args, cwd: process.cwd() }) + '\n');
const mode = process.env.STUB_MODE || 'ok';

if (args[0] === 'models') { process.stdout.write('testprov/testmodel\nopencode/stub-free\n'); process.exit(0); }
if (args[0] === 'session' && args[1] === 'export') {
  process.stdout.write(JSON.stringify({ info: { id: args[2], cost: 0, tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 3, write: 0 } } }, messages: [] }));
  process.exit(0);
}
if (args[0] === 'stats') { process.stdout.write(JSON.stringify({ sessions: 1, cost: 0.05, tokens: { input: 1, output: 1 } })); process.exit(0); }
if (args[0] !== 'run') process.exit(0);
if (mode === 'fail') process.exit(1);
const sIdx = args.indexOf('-s');
const sid = sIdx >= 0 ? args[sIdx + 1] : 'ses-stub';
const body = JSON.stringify({ type: 'step_start', sessionID: sid, part: { type: 'step-start' } }) + '\n'
  + JSON.stringify({ type: 'text', sessionID: sid, part: { type: 'text', text: 'ok' } }) + '\n';
if (mode === 'partial-then-ok') {
  const counter = process.env.STUB_LOG + '.count';
  const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
  writeFileSync(counter, String(n + 1));
  if (n === 0) process.stdout.write('{"type":"step_start","sessionID":"ses-16"}\n{"type":"te', () => process.kill(process.pid, 'SIGKILL'));
  else process.stdout.write(body);
} else process.stdout.write(body);
