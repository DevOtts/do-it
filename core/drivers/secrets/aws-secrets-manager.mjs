import cp from 'node:child_process';

// Secrets driver `aws-secrets-manager` (D16): runs the user's own `aws` CLI.
// Its stderr is never surfaced. No SDK is bundled.
export function secretsAwsResolve(name, ref, ctx) {
  const base = String(ref || '').replace(/\/+$/, '');
  const id = base ? base + '/' + name : name;
  const argv = ['secretsmanager', 'get-secret-value', '--secret-id', id, '--query', 'SecretString', '--output', 'text'];
  const r = cp.spawnSync('aws', argv, { env: ctx.env, cwd: ctx.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
  if (r.error) return { ok: false, detail: r.error.code === 'ENOENT' ? 'cli_not_found' : 'cli_error' };
  if (r.status !== 0) return { ok: false, detail: 'cli_failed' };
  const value = String(r.stdout || '').replace(/\r?\n$/, '');
  if (!value || value === 'None') return { ok: false, detail: 'secret_empty' };
  return { ok: true, value, length: value.length };
}
