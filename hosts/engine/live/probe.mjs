// Is a live Engine staging target reachable? Checks DO_IT_ENGINE_URL, local docker containers and the presence
// (never the content) of a .secrets file. G-3: a [REAL] case never passes on a mock; unreachable means
// IMPLEMENTED-NOT-VERIFIED with this record quoted.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function probeEngine({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  const rec = { reachable: false, checks: [] };
  const note = (name, ok, detail) => rec.checks.push({ name, ok, detail });

  const url = env.DO_IT_ENGINE_URL;
  note('env DO_IT_ENGINE_URL', !!url, url ? 'set' : 'unset');

  const dk = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', timeout: timeoutMs });
  const names = dk.status === 0 ? dk.stdout.split('\n').filter((n) => /engine|brain/i.test(n)) : [];
  note('docker ps', dk.status === 0 && names.length > 0, dk.status === 0 ? `${names.length} engine/brain containers` : String(dk.stderr || dk.error?.message || 'docker unavailable').trim().split('\n')[0]);

  const root = resolve(HERE, '../../..');
  const core = env.DO_IT_ENGINE_CORE || '/Users/macbook/Workspace/Engine/Engine-Core';
  const secrets = [join(root, '.secrets'), join(dirname(root), '.secrets'), join(core, '.secrets')].filter((p) => existsSync(p));
  note('.secrets file', secrets.length > 0, secrets.length ? 'present (content not read)' : 'none in repo root, parent or Engine-Core');

  const base = url || (names.length ? 'http://localhost:3001' : null);
  if (base) {
    try {
      const res = await fetchImpl(new URL('/', base), { signal: AbortSignal.timeout(timeoutMs) });
      note('http reach', true, `${new URL(base).host} answered ${res.status}`);
      rec.reachable = true; rec.baseUrl = base;
    } catch (e) {
      note('http reach', false, `${new URL(base).host}: ${String(e?.cause?.code || e?.message || e)}`);
    }
  } else note('http reach', false, 'no candidate URL (env unset, no engine containers)');

  rec.error = rec.reachable ? null : rec.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ');
  return rec;
}
