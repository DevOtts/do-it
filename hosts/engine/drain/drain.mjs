// Drain shape (D11): one parent card, dependent child cards only for cards that need a build, a disposition
// row on the parent for the rest. Discovery is read-only: card bodies are never written.
export function drain(cards, { parentId = 'drain-parent' } = {}) {
  const parent = { id: parentId, kind: 'parent', dispositions: [] };
  const children = [];
  for (const c of cards) {
    if (c.needs_build === true) children.push({ id: `${parentId}/${c.id}`, source: c.id, kind: 'child', parents: [parentId] });
    else parent.dispositions.push({ card: c.id, disposition: c.disposition ?? 'closed-by-verification' });
  }
  return { parent, children, writes_to_card_bodies: 0 };
}
