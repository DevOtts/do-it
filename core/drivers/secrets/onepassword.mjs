import cp from 'node:child_process';

// Secrets driver `1password` (D16): runs the user's own `op read <ref>/<name>`.
// Its stderr is never surfaced. No SDK is bundled.
export function secretsOnepasswordResolve(name, ref, ctx) {
  const base = String(ref || '').replace(/\/+$/, '');
  if (!base.startsWith('op://')) return { ok: false, detail: 'bad_reference' };
  const r = cp.spawnSync('op', ['read', base + '/' + name], { env: ctx.env, cwd: ctx.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
  if (r.error) return { ok: false, detail: r.error.code === 'ENOENT' ? 'cli_not_found' : 'cli_error' };
  if (r.status !== 0) return { ok: false, detail: 'cli_failed' };
  const value = String(r.stdout || '').replace(/\r?\n$/, '');
  if (!value) return { ok: false, detail: 'secret_empty' };
  return { ok: true, value, length: value.length };
}
