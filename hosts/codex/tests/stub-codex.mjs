// Stub `codex` for unit cases. Env: STUB_MODE = ok | fail | partial-then-ok ; STUB_LOG = file receiving one JSON line per call ;
// STUB_FEATURES = file whose text `features list` prints (default: request_user_input false).
import { appendFileSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const log = process.env.STUB_LOG;
if (log) appendFileSync(log, JSON.stringify({ argv: args, cwd: process.cwd() }) + '\n');
const mode = process.env.STUB_MODE || 'ok';

if (args[0] === 'features') {
  process.stdout.write(process.env.STUB_FEATURES ? readFileSync(process.env.STUB_FEATURES, 'utf8')
    : 'default_mode_request_user_input       under development  false\ngoals                                    stable             true\n');
  process.exit(0);
}
if (mode === 'fail') process.exit(1);
const rIdx = args.indexOf('resume');
const tid = rIdx >= 0 && args[rIdx + 1] && !args[rIdx + 1].startsWith('-') ? args[rIdx + 1] : 'thr-stub';
const body = JSON.stringify({ type: 'thread.started', thread_id: tid }) + '\n' + JSON.stringify({ type: 'turn.started' }) + '\n'
  + JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'ok' } }) + '\n'
  + JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 3, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 1 } }) + '\n';
if (mode === 'partial-then-ok') {
  const counter = process.env.STUB_LOG + '.count';
  const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
  writeFileSync(counter, String(n + 1));
  if (n === 0) {
    process.stdout.write('{"type":"thread.started","thread_id":"thr-15"}\n{"type":"turn.comp', () => process.kill(process.pid, 'SIGKILL'));
  } else process.stdout.write(body);
} else process.stdout.write(body);
