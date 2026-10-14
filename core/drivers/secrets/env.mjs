// Secrets driver `env` (D16): the credential is an environment variable. A ref
// made of capitals, digits and underscores is a name prefix; any other ref is ignored.
export function secretsEnvResolve(name, ref, ctx) {
  const prefix = typeof ref === 'string' && /^[A-Z0-9_]+$/.test(ref) ? ref : '';
  const value = ctx.env[prefix + name];
  if (typeof value !== 'string' || value === '') return { ok: false, detail: 'env_missing' };
  return { ok: true, value, length: value.length };
}
