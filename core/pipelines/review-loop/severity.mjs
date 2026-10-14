// Severity classes (G-10): blocker and major loop; minor and nit become backlog cards, never loop.
import fs from 'node:fs';
import path from 'node:path';

export const SEVERITIES = ['blocker', 'major', 'minor', 'nit'];
export const LOOPING = ['blocker', 'major'];

export function classify(findings) {
  const loop = findings.filter((f) => LOOPING.includes(f.severity));
  const backlog = findings.filter((f) => f.severity === 'minor' || f.severity === 'nit');
  const unknown = findings.filter((f) => !SEVERITIES.includes(f.severity));
  return { loop, backlog, unknown, loopCount: loop.length };
}

// Idempotent: a card is named by the finding fingerprint, so a replayed round never duplicates it.
export function writeBacklog(reviewDir, findings, round) {
  const dir = path.join(reviewDir, 'backlog');
  const created = [];
  for (const f of classify(findings).backlog) {
    const file = path.join(dir, `card-${String(f.fingerprint || f.id).replace(/[^\w.-]/g, '_')}.json`);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(dir, { recursive: true });
    const card = { id: f.id, fingerprint: f.fingerprint || null, title: f.title || f.id, severity: f.severity, tags: f.severity === 'nit' ? ['nit'] : [], round };
    fs.writeFileSync(file, JSON.stringify(card, null, 2) + '\n');
    created.push(file);
  }
  return created;
}
