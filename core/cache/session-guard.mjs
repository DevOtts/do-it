import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fail, runCli } from '../routing/errors.mjs';
import { canonicalTools } from './canonical.mjs';

const ser = (v) => (typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v));

// prev, next: {model, tools, system}. User/tool messages may change freely (rule updates-in-messages).
export function guard(prev, next) {
  const flags = [];
  if (prev.model !== next.model) flags.push('MODEL_CHANGED');
  if (JSON.stringify(canonicalTools(prev.tools)) !== JSON.stringify(canonicalTools(next.tools))) flags.push('TOOLS_CHANGED');
  if (ser(prev.system) !== ser(next.system)) flags.push('SYSTEM_CHANGED');
  if (!flags.length) return { outcome: 'SESSION_OK', flags };
  const advice = [];
  if (flags.includes('MODEL_CHANGED')) advice.push('start a new session at a spawn boundary with a written brief (rule no-model-change)');
  if (flags.includes('TOOLS_CHANGED')) advice.push('mask tools through tool_choice or state messages instead (rule no-tool-change)');
  if (flags.includes('SYSTEM_CHANGED')) advice.push('move the update into the next user message (rule updates-in-messages)');
  return { outcome: flags[0], flags, advice };
}

export function checkSession(prev, next) {
  const r = guard(prev, next);
  if (r.outcome === 'SESSION_OK') return r;
  const { outcome, ...rest } = r;
  throw fail(outcome, 1, rest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(() => {
    const [fa, fb] = process.argv.slice(2);
    if (!fa || !fb) throw fail('USAGE', 1, { message: 'session-guard <turn-a.json> <turn-b.json>' });
    return checkSession(JSON.parse(fs.readFileSync(fa, 'utf8')), JSON.parse(fs.readFileSync(fb, 'utf8')));
  });
}
