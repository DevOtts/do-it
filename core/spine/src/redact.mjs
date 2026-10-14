import fs from 'node:fs';
import path from 'node:path';

// G-7: values the process knows are secrets never reach a file or an output.
// The set lives for the process; every spine write and the final stdout pass through redactText.
export const REDACT_MIN_LENGTH = 6;
export const REDACT_VALUES = new Map();
export const REDACT_HITS = new Set();

export function redactAdd(name, value) {
  if (typeof value !== 'string' || value.length < REDACT_MIN_LENGTH) return;
  const forms = [value];
  const escaped = JSON.stringify(value).slice(1, -1);
  if (escaped !== value) forms.push(escaped);
  for (const form of forms) REDACT_VALUES.set(form, name);
}

export function redactReset() {
  REDACT_VALUES.clear();
  REDACT_HITS.clear();
}

export function redactText(text) {
  if (!REDACT_VALUES.size || typeof text !== 'string') return text;
  let out = text;
  const forms = Array.from(REDACT_VALUES.keys()).sort((a, b) => b.length - a.length);
  for (const form of forms) {
    if (!out.includes(form)) continue;
    const name = REDACT_VALUES.get(form);
    REDACT_HITS.add(name);
    out = out.split(form).join('[REDACTED:' + name + ']');
  }
  return out;
}

// Names the project declares: READINESS credentials and .env.example NAME= lines.
export function redactDeclaredNames(ctx) {
  const names = new Set();
  try {
    const r = JSON.parse(fs.readFileSync(path.join(ctx.home, 'plan', 'READINESS.json'), 'utf8'));
    for (const n of Array.isArray(r.credentials) ? r.credentials : []) if (typeof n === 'string' && n) names.add(n);
  } catch { /* no readiness yet */ }
  try {
    for (const line of fs.readFileSync(path.join(ctx.home, '.env.example'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (m) names.add(m[1]);
    }
  } catch { /* no example */ }
  return Array.from(names).sort();
}

// Cheap, side-effect free sources only: the file directory and the environment.
// Credentials behind a user CLI join the set in the process that resolves them.
export function redactInit(ctx) {
  redactReset();
  try {
    const dir = path.resolve(ctx.repo, '.secrets');
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      const st = fs.statSync(f);
      if (st.isFile() && st.size <= 65536) redactAdd(n, fs.readFileSync(f, 'utf8').replace(/\r?\n$/, ''));
    }
  } catch { /* no .secrets */ }
  for (const n of redactDeclaredNames(ctx)) redactAdd(n, ctx.env[n]);
}
