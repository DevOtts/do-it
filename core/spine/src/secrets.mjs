// S5 fills this in; until then a credential list resolves vacuously.
export function resolveCredentials(_ctx, _runId, names, _secrets) {
  return names.map((name) => ({ name, ok: true, length: 0 }));
}
