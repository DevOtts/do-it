// Which session is calling? Core names no host (R3): the host layer says which environment
// variables carry its session id by exporting DO_IT_SESSION_ENV (comma-separated names).
// Order: --session, then DO_IT_SESSION_ID, then the first named variable that is set.
export function resolveSessionId(ctx, flags) {
  if (flags && typeof flags.session === 'string' && flags.session) return flags.session;
  const env = ctx.env || {};
  if (env.DO_IT_SESSION_ID) return env.DO_IT_SESSION_ID;
  for (const name of String(env.DO_IT_SESSION_ENV || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (env[name]) return env[name];
  }
  return null;
}
