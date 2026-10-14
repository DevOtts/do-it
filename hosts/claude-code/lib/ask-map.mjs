// Map a do-it owner pack to an AskUserQuestion payload (at most 4 questions, 2 to 4 options each);
// anything else goes down the fallback chain html then markdown (CONTRACT section 6, D7).
import { askChain } from '../../_interface/lib/fallbacks.mjs';

export const MAX_QUESTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
// A question with no options is free-form; native needs options, so it gets two neutral ones
// (the tool always offers "Other" for typed answers).
const FREE_FORM = [{ label: 'Use the default', description: 'Proceed with the recommended default' }, { label: 'Hold', description: 'Do not proceed yet' }];

const optionOf = (o) => (typeof o === 'string' ? { label: o, description: o } : { label: o.label, description: o.description ?? o.label });

export function mapPack(pack, maxQuestions = MAX_QUESTIONS) {
  const qs = pack && Array.isArray(pack.questions) ? pack.questions : [];
  if (qs.length === 0) return { channel: 'html', reason: 'questions<1' };
  if (qs.length > maxQuestions) return { channel: 'html', reason: `questions>${maxQuestions}` };
  for (const q of qs) {
    if (Array.isArray(q.options) && q.options.length > MAX_OPTIONS) return { channel: 'html', reason: `options>${MAX_OPTIONS}`, question: q.n };
    if (Array.isArray(q.options) && q.options.length < MIN_OPTIONS) return { channel: 'html', reason: `options<${MIN_OPTIONS}`, question: q.n };
  }
  const questions = qs.map((q) => ({
    question: q.text,
    header: String(q.header ?? `Q${q.n}`).slice(0, 12),
    multiSelect: false,
    options: (Array.isArray(q.options) ? q.options : FREE_FORM).map(optionOf),
  }));
  return { channel: 'native', payload: { tool: 'AskUserQuestion', input: { questions } } };
}

// Full chain through the adapter: native when it maps, else html, else markdown.
export function askPack(adapter, pack, dir) {
  const m = mapPack(pack, adapter.capabilities.ask.max_questions);
  const r = askChain(adapter, pack, dir);
  return m.channel === 'native' ? { ...r, payload: m.payload } : { ...r, reason: m.reason };
}
