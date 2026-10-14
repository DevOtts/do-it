import { fail } from './errors.mjs';
import { appendEvent } from './events.mjs';
import { REDACT_HITS, redactAdd, redactDeclaredNames } from './redact.mjs';
import { loadSettings } from './settings.mjs';
import { selectRunId } from './state.mjs';
import { secretsAwsResolve } from '../../drivers/secrets/aws-secrets-manager.mjs';
import { secretsEnvResolve } from '../../drivers/secrets/env.mjs';
import { secretsFileResolve } from '../../drivers/secrets/file.mjs';
import { secretsOnepasswordResolve } from '../../drivers/secrets/onepassword.mjs';

export const SECRET_DRIVERS = {
  file: secretsFileResolve,
  env: secretsEnvResolve,
  'aws-secrets-manager': secretsAwsResolve,
  '1password': secretsOnepasswordResolve,
};

// Resolve every named credential through the provider driver. The value goes
// into the redaction set and no further: results carry name, ok and length only.
export function resolveCredentials(ctx, _runId, names, secrets) {
  const provider = secrets && secrets.provider ? secrets.provider : 'file';
  const driver = SECRET_DRIVERS[provider];
  return names.map((name) => {
    if (!driver) return { name, ok: false, length: 0, detail: 'unknown_provider' };
    const r = driver(name, secrets.ref, ctx);
    if (r.ok) redactAdd(name, r.value);
    return { name, ok: r.ok, length: r.ok ? r.length : 0, detail: r.ok ? null : r.detail };
  });
}

// doctor --secrets [--name A,B]: names from the flag, READINESS and .env.example.
// Prints names, status and lengths only.
export function doctorSecrets(ctx, args) {
  const settings = loadSettings(ctx, args.sets);
  const flagNames = typeof args.flags.name === 'string' ? args.flags.name.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const names = Array.from(new Set([...flagNames, ...redactDeclaredNames(ctx)])).sort();
  const provider = settings.values.secrets.provider;
  if (!SECRET_DRIVERS[provider]) throw fail('CREDENTIAL_PROVIDER_UNKNOWN', 1, { provider, providers: Object.keys(SECRET_DRIVERS) });
  const results = resolveCredentials(ctx, null, names, settings.values.secrets);
  const secrets = results.map((r) => ({ name: r.name, status: r.ok ? 'ok' : 'missing', length: r.length, ...(r.ok ? {} : { detail: r.detail }) }));
  const missing = secrets.filter((s) => s.status !== 'ok');
  let runId = null;
  try { runId = selectRunId(ctx, {}); } catch { /* no run yet */ }
  if (runId) {
    try {
      appendEvent(ctx, runId, { event: 'secrets_checked', verdict: missing.length ? 'CREDENTIAL_MISSING' : 'SECRETS_OK', detail: { provider, names, missing: missing.map((m) => m.name) } });
    } catch { /* the check result matters more than the trace */ }
  }
  const out = { provider, ref: settings.values.secrets.ref, secrets };
  if (missing.length) return { outcome: 'CREDENTIAL_MISSING', exit: 3, ...out, missing: missing.map((m) => m.name) };
  return { outcome: 'SECRETS_OK', exit: 0, ...out };
}

// Names redacted during this command go to the run's events, names only.
export function redactFlushEvents(ctx, result) {
  if (!REDACT_HITS.size) return;
  const names = Array.from(REDACT_HITS).sort();
  REDACT_HITS.clear();
  try {
    const runId = result && typeof result.run_id === 'string' ? result.run_id : null;
    if (!runId) return;
    for (const name of names) appendEvent(ctx, runId, { event: 'secret_redacted', verdict: 'REDACTED', detail: { name } });
  } catch { /* redaction must never fail a command */ }
}
