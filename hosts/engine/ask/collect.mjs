// Reply collection (D6, D7, G-16): the spine parser, first valid reply per ID wins, default-accept-by-ID.
import { parseReply } from '../../../core/spine/src/reply.mjs';

export function createCollector(pack, { emit = () => {} } = {}) {
  const byN = new Map(pack.questions.map((q) => [q.n, q]));
  const answers = new Map(); // n -> { n, answer, source, channel, free_text }
  const events = [];
  const log = (row) => { events.push(row); emit(row); };

  function apply(row, channel) {
    if (answers.has(row.n)) { log({ event: 'answer_ignored_answered', n: row.n, channel, state: 'answered' }); return false; }
    answers.set(row.n, { ...row, channel });
    log({ event: 'answer_applied', n: row.n, channel, source: row.source });
    return true;
  }

  // Returns { applied:[n], ignored:[n], errors:[...] }. Same parse on every channel.
  function ingest({ channel, text }) {
    const parsed = parseReply(text, pack.questions);
    const res = { applied: [], ignored: [], errors: parsed.errors.slice() };
    const fresh = [];
    for (const it of parsed.items) {
      if (!byN.has(it.n)) { res.errors.push({ kind: 'unknown_question', n: it.n }); continue; }
      const q = byN.get(it.n);
      if (!it.free_text && q.options?.length && !q.options.includes(it.answer)) { res.errors.push({ kind: 'bad_option', n: it.n, given: it.answer }); continue; }
      fresh.push({ n: it.n, answer: it.answer, source: 'reply', free_text: it.free_text });
    }
    if (parsed.except) {
      const skip = new Set(parsed.except.numbers);
      const explicit = new Set(fresh.map((r) => r.n));
      for (const q of pack.questions) {
        if (skip.has(q.n) || explicit.has(q.n) || q.recommendation == null) continue;
        fresh.push({ n: q.n, answer: q.recommendation, source: 'recommendation', free_text: false });
      }
    }
    for (const r of fresh) (apply(r, channel) ? res.applied : res.ignored).push(r.n);
    return res;
  }

  // The pack closes: reversible questions with a default are accepted by ID; irreversible ones never are (G-8).
  function close() {
    for (const q of pack.questions) {
      if (answers.has(q.n)) continue;
      if (!q.reversible || q.kind === 'owner-gate' || q.default == null) continue;
      answers.set(q.n, { n: q.n, answer: q.default, source: 'accepted-by-default', channel: null, free_text: false });
      log({ event: 'accepted_by_default', n: q.n, value: q.default });
    }
    return snapshot();
  }

  function snapshot() {
    const pending = pack.questions.map((q) => q.n).filter((n) => !answers.has(n));
    const irreversible = pending.filter((n) => byN.get(n).reversible === false);
    const state = {};
    for (const q of pack.questions) state[q.n] = answers.has(q.n) ? (answers.get(q.n).source === 'accepted-by-default' ? 'accepted-by-default' : 'answered') : 'pending';
    const out = { answers: Object.fromEntries([...answers].sort((a, b) => a[0] - b[0]).map(([n, a]) => [n, a.answer])), state, pending, events };
    if (irreversible.length) return { ...out, status: 'blocked', reason: `IRREVERSIBLE_UNANSWERED: ${irreversible.join(', ')}`, exit: 3 };
    if (pending.length) return { ...out, status: 'needs_human', reason: `PENDING: ${pending.join(', ')}`, exit: 2 };
    return { ...out, status: 'ok', exit: 0 };
  }

  return { ingest, close, snapshot, events, rows: () => [...answers.values()] };
}
