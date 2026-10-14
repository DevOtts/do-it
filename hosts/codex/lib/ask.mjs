// Ask channel for codex. native only when `codex features list` reports default_mode_request_user_input
// enabled (probed: under development, false); otherwise markdown. More than max questions goes to html
// (CONTRACT section 6, owner ruling D7).
import { execFileSync } from 'node:child_process';

export const FLAG = 'default_mode_request_user_input';
export const MAX_QUESTIONS = 4;

// Text of `codex features list` -> { name: boolean }.
export function parseFeatures(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^(\S+)\s+(?:stable|experimental|under development|removed|deprecated)\s+(true|false)\s*$/.exec(line.trim());
    if (m) out[m[1]] = m[2] === 'true';
  }
  return out;
}
export const requestUserInputEnabled = (text) => parseFeatures(text)[FLAG] === true;

export function detect(bin = 'codex') {
  return requestUserInputEnabled(execFileSync(bin, ['features', 'list'], { encoding: 'utf8', timeout: 30000 }));
}

export function chooseChannel(pack, nativeEnabled, maxQuestions = MAX_QUESTIONS) {
  const qs = pack && Array.isArray(pack.questions) ? pack.questions : [];
  if (qs.length === 0) return { channel: 'html', reason: 'questions<1' };
  if (qs.length > maxQuestions) return { channel: 'html', reason: `questions>${maxQuestions}` };
  if (!nativeEnabled) return { channel: 'markdown', reason: `${FLAG}=false` };
  return {
    channel: 'native',
    payload: { tool: 'request_user_input', input: { questions: qs.map((q) => ({ id: `q${q.n}`, question: q.text, options: (q.options || []).map((o) => (typeof o === 'string' ? { label: o } : o)) })) } },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  if (a.includes('--detect')) {
    try { console.log(`request_user_input:${detect(a.includes('--bin') ? a[a.indexOf('--bin') + 1] : 'codex')}`); } catch (e) { console.error(`detect failed: ${e.message}`); process.exit(2); }
  } else { console.error('usage: ask.mjs --detect [--bin NAME]'); process.exit(2); }
}
