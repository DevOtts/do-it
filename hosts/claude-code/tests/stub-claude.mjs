// Stub `claude` for unit cases. Env: STUB_MODE = ok | fail | partial-then-ok ; STUB_LOG = file receiving one argv line per call.
import { appendFileSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const log = process.env.STUB_LOG;
if (log) appendFileSync(log, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), cfg: process.env.CLAUDE_CONFIG_DIR ?? null }) + '\n');
const mode = process.env.STUB_MODE || 'ok';
const args = process.argv.slice(2);
const sid = args[args.findIndex((a) => a === '--session-id' || a === '-r') + 1] || 'stub-session';
const okBody = JSON.stringify({ type: 'result', is_error: false, session_id: sid, result: 'ok', total_cost_usd: 0.01,
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 } });

if (mode === 'fail') process.exit(1);
if (mode === 'partial-then-ok') {
  const counter = process.env.STUB_LOG + '.count';
  const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
  writeFileSync(counter, String(n + 1));
  if (n === 0) {
    process.stdout.write('{"type":"result","session_id":"' + sid + '","resu', () => process.kill(process.pid, 'SIGKILL'));
  } else { process.stdout.write(okBody); }
} else process.stdout.write(okBody);
