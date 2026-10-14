// Drain preset code steps (PRD D6): verify-before-build discovery, one batched owner pack, dispositions, ledger check.
// Usage: node drain-ledger.mjs discover --cards <dir> --root <dir>
//        node drain-ledger.mjs check --ledger <file>
//        node drain-ledger.mjs set --ledger <file> --card <id> --disposition <d> [--unlock <event>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISPOSITIONS = ['drained', 'trimmed', 'promoted', 'attended', 'parked'];

export class DrainError extends Error {
  constructor(outcome, exit, extra) { super(outcome); this.outcome = outcome; this.exit = exit; this.extra = extra || {}; }
}

// Card file: JSON { id, title, claims: [{ path, contains?: [string] }] }. Claims resolve inside root only.
export function discoverCard(card, root) {
  const realRoot = fs.realpathSync(root);
  let total = 0; let held = 0; let proof = null;
  for (const claim of card.claims || []) {
    const p = path.resolve(realRoot, claim.path);
    proof = proof || claim.path;
    total++;
    if (!p.startsWith(realRoot + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { total += (claim.contains || []).length; continue; }
    held++;
    const body = fs.readFileSync(p, 'utf8');
    for (const s of claim.contains || []) { total++; if (body.includes(s)) held++; }
  }
  const status = total === 0 || held === 0 ? 'none' : held === total ? 'full' : 'partial';
  return { id: card.id, status, proof, build: status !== 'full' };
}

export function discover(cardsDir, root) {
  const cards = fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(cardsDir, f), 'utf8')));
  return cards.map((c) => discoverCard(c, root));
}

// One pack for the whole backlog, one question per card that needs a decision.
export function ownerPack(runId, cards) {
  const needs = cards.filter((c) => c.needs_decision !== false);
  const pack_id = 'pack-' + crypto.createHash('sha256').update(runId + ':' + needs.map((c) => c.id).join(',')).digest('hex').slice(0, 12);
  return {
    pack_id, run_id: runId,
    questions: needs.map((c, i) => ({ n: i + 1, kind: 'drain-disposition', text: `Card ${c.id}: ${c.title || ''}`.trim(), options: DISPOSITIONS, recommendation: c.recommendation || 'drained', default: c.recommendation || 'drained', reversible: true })),
  };
}

export function readLedger(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function setDisposition(ledger, id, disposition, unlockEvent) {
  if (!DISPOSITIONS.includes(disposition)) throw new DrainError('DISPOSITION_INVALID', 1, { card: id, disposition });
  const card = ledger.cards.find((c) => c.id === id);
  if (!card) throw new DrainError('CARD_UNKNOWN', 1, { card: id });
  if (card.disposition && card.disposition !== disposition) throw new DrainError('DISPOSITION_CONFLICT', 1, { card: id, had: card.disposition });
  card.disposition = disposition;
  if (unlockEvent) card.unlock_event = unlockEvent;
  return card;
}

// G-13: conclude cannot close while any card is unaccounted (no disposition, or parked without an unlock event).
export function checkLedger(ledger) {
  const bad = [];
  for (const c of ledger.cards) {
    if (!c.disposition) bad.push({ id: c.id, why: 'no disposition' });
    else if (!DISPOSITIONS.includes(c.disposition)) bad.push({ id: c.id, why: 'DISPOSITION_INVALID' });
    else if (c.disposition === 'parked' && !c.unlock_event) bad.push({ id: c.id, why: 'parked without unlock event' });
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
  try {
    if (a[0] === 'discover') {
      for (const r of discover(opt('cards'), opt('root'))) console.log(`${r.id}: already-implemented: ${r.status} (proof: ${r.proof}) build: ${r.build ? 'scheduled' : 'skipped'}`);
    } else if (a[0] === 'check') {
      const bad = checkLedger(readLedger(opt('ledger')));
      for (const b of bad) console.log(`UNACCOUNTED_CARD ${b.id} (${b.why})`);
      process.exit(bad.length ? 1 : 0);
    } else if (a[0] === 'set') {
      const f = opt('ledger'); const l = readLedger(f);
      setDisposition(l, opt('card'), opt('disposition'), opt('unlock'));
      fs.writeFileSync(f, JSON.stringify(l, null, 2) + '\n');
    } else { console.error('usage: discover|check|set'); process.exit(1); }
  } catch (e) {
    if (e instanceof DrainError) { console.log(`${e.outcome} ${JSON.stringify(e.extra)}`); process.exit(e.exit); }
    throw e;
  }
}
