// Card intake (D9, G-17): card, ticket, web and reply text is data. Tools, repo and host come from the
// compiled definition and settings only. Detection only records an event; no decision reads the card.
import { compileSquad } from './squad-to-definition.mjs';
import { canonicalJson } from './canon.mjs';

const INJECTION = [
  /ignore (the|all|any|previous)[^.]{0,40}(squad|instructions?|rules?)/i,
  /\buse repo\b/i, /\bhost\s+\S+/i, /\bcall (a |the )?(new )?tool\b/i, /\bpublish to\b/i, /\bdeploy\b/i,
];

export function toolsOf(definition) {
  return [...new Set(definition.steps.filter((s) => s.type === 'publish' || s.type === 'render').map((s) => s.type))].sort();
}

export function intakeCard(card, { squad, settings }) {
  const definition = compileSquad(squad); // never sees the card
  const body = [card?.title, card?.body, ...(card?.comments || [])].filter((x) => typeof x === 'string').join('\n');
  const events = [];
  const hits = INJECTION.filter((re) => re.test(body)).map((re) => re.source);
  if (hits.length) events.push({ event: 'untrusted_instruction_ignored', card_id: card?.id ?? null, patterns: hits.length });
  return {
    definition, definition_json: canonicalJson(definition),
    repo: settings.repo, host: settings.host, tools: toolsOf(definition),
    persona_publish: definition.steps.some((s) => s.type !== 'publish' && s.type !== 'render' && (s.x_do_it?.capabilities || []).includes('publish')),
    events,
  };
}
