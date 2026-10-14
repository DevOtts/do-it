// Generate tiers.json from `opencode models`. Nothing is assumed about which providers are configured:
// a tier maps only to a model that the listing contains; a preferred provider (e.g. deepseek) is used only when listed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Ordered rules per tier; first rule that matches a listed model wins (first listed model within the rule).
export const RULES = {
  T1: [/\/claude-opus[^/]*$/, /\/gpt-\d+(\.\d+)?-pro$/, /\/gemini-[\d.]+-pro[^/]*$/],
  T2: [/\/claude-sonnet[^/]*$/, /\/gpt-\d+(\.\d+)?$/, /\/gemini-[\d.]+-flash$/],
  T3: [/\/claude-haiku[^/]*$/, /\/gpt-\d+(\.\d+)?-mini$/, /\/gemini-[\d.]+-flash-lite[^/]*$/, /-free$/],
};
export const parseModels = (text) => String(text).split('\n').map((l) => l.trim()).filter((l) => /^[^/\s]+\/\S+$/.test(l));

// prefer: { T3: 'deepseek' } -> that tier maps only to the first model under that provider, else stays unmapped.
export function generate(models, prefer = {}) {
  const tiers = {};
  const unknown = [];
  for (const t of ['T1', 'T2', 'T3']) {
    let pick = null;
    if (prefer[t]) {
      pick = models.find((m) => m.startsWith(`${prefer[t]}/`)) || null;
      if (!pick) unknown.push(`${prefer[t]}-not-listed`);
    } else {
      for (const re of RULES[t]) { pick = models.find((m) => re.test(m)) || null; if (pick) break; }
      if (!pick) unknown.push(`tier-${t}-unmapped`);
    }
    if (pick) tiers[t] = pick;
  }
  return { schema: 'do-it-tiers/1', host: 'opencode', source: 'generated', generated_from: 'opencode models', asked_at_init: false, tiers, unknown: [...new Set(unknown)] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const out = get('--out');
  if (!a.includes('--generate') || !out) { console.error('usage: tiers.mjs --generate --out FILE [--models FILE] [--prefer T3=deepseek]'); process.exit(2); }
  const prefer = {};
  a.forEach((x, i) => { if (x === '--prefer') { const [t, p] = a[i + 1].split('='); prefer[t] = p; } });
  let text;
  // `opencode models` can print nothing on a cold background service: retry once, never write an empty mapping.
  let models = [];
  for (let i = 0; i < 2 && !models.length; i++) {
    try { text = get('--models') ? readFileSync(get('--models'), 'utf8') : execFileSync('opencode', ['models'], { encoding: 'utf8', timeout: 60000 }); } catch (e) { console.error(`opencode models failed: ${e.message}`); process.exit(2); }
    models = parseModels(text);
  }
  if (!models.length) { console.error('opencode models listed no models'); process.exit(2); }
  const doc = generate(models, prefer);
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(JSON.stringify({ out, tiers: doc.tiers, unknown: doc.unknown }));
}
