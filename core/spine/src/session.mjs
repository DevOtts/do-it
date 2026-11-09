// Which session is calling? Core names no host (R3): the host layer says which environment
// variables carry its session id by exporting DO_IT_SESSION_ENV (comma-separated names).
// Precedence (CONTRACT 2.1, unchanged): --session, then DO_IT_SESSION_ID, then the first named host
// variable that is set. An explicit id therefore outranks the host's live id, so a stale
// DO_IT_SESSION_ID export would bind the run to a session no hook ever reports; `start` says so in
// `session_conflict` (CP-03 S1-L1). A blank or whitespace-only value counts as absent and is never
// recorded (CP-03 S1-L2).
export function cleanSessionId(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function resolveSession(ctx, flags) {
  const env = ctx.env || {};
  let host = null;
  for (const name of String(env.DO_IT_SESSION_ENV || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    host = cleanSessionId(env[name]);
    if (host) break;
  }
  const id = cleanSessionId(flags && flags.session) || cleanSessionId(env.DO_IT_SESSION_ID) || host;
  return { id, host, conflict: id && host && id !== host ? { recorded: id, host } : null };
}

export function resolveSessionId(ctx, flags) {
  return resolveSession(ctx, flags).id;
}
