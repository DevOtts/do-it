// Deterministic-first routing (D9): an ordered rule table. A request that
// matches no rule, or ties between presets at the best priority, goes to the
// single logged model fallback (ROUTE_MODEL) which `next` requests once.
export const PRESET_NAMES = ['feature', 'investigate-fix', 'drain', 'review-loop', 'reconcile'];

function routeWords(list) {
  return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + list.join('|') + ')(?![\\p{L}\\p{N}_])', 'iu');
}

export const ROUTE_RULES = [
  { id: 'R-DRAIN', preset: 'drain', priority: 1, re: routeWords(['drain', 'backlog', 'burn ?down', 'work through the (?:cards|tickets|issues)']) },
  { id: 'R-RECONCILE', preset: 'reconcile', priority: 1, re: routeWords(['reconcile', 'stray branches', 'worktrees?', 'clean ?up (?:the )?branches', 'branch(?:es)? inventory']) },
  { id: 'R-REVIEW', preset: 'review-loop', priority: 2, re: routeWords(['review', 'roteiro', 'audit', 'walk ?through', 'attended gate']) },
  {
    id: 'R-BUG',
    preset: 'investigate-fix',
    priority: 3,
    re: routeWords([
      'bugs?', 'fix(?:es|ed)?', 'broken', 'crash(?:es|ed|ing)?', 'fail(?:s|ed|ing|ure)?', 'regress(?:ion)?', 'exception', 'stack ?trace',
      'not working', "doesn'?t work", 'does not work', "can'?t", 'cannot', 'incomplete', 'wrong',
      'n[aã]o (?:recebe|funciona|abre|carrega|envia|salva|chega|aparece|responde)', 'erro', 'falha', 'quebrad[oa]', 'travou', 'incompleta?s?',
    ]),
  },
  { id: 'R-FEATURE', preset: 'feature', priority: 3, re: routeWords(['ship', 'build', 'add', 'implement', 'create', 'features?', 'w\\d+(?:\\s*(?:-|to|a)\\s*w?\\d+)?', 'waves?', 'epics?', 'prds?', 'release', 'launch', 'integrate', 'support']) },
];

// First integer in the request: the size hint for drain-shaped work.
export function routeSizeHint(text) {
  const m = /(?<![\p{L}\p{N}_.])(\d{1,6})(?![\p{L}\p{N}_.])/u.exec(text);
  return m ? Number(m[1]) : null;
}

export function route(text) {
  const request = String(text || '');
  const hits = ROUTE_RULES.filter((r) => r.re.test(request));
  if (!hits.length) return { preset: null, rule: null, model_call: false, ambiguous: true, reason: 'no_rule_matched' };
  const best = Math.min(...hits.map((h) => h.priority));
  const top = hits.filter((h) => h.priority === best);
  const presets = Array.from(new Set(top.map((h) => h.preset)));
  if (presets.length > 1) return { preset: null, rule: null, model_call: false, ambiguous: true, reason: 'tie:' + presets.join(',') };
  const out = { preset: top[0].preset, rule: top[0].id, model_call: false, ambiguous: false, size: null };
  if (out.preset === 'drain') out.size = routeSizeHint(request);
  return out;
}
