// Tolerant reader for `opencode run --format json` output (one JSON object per line, each with sessionID).
// A truncated last line (child killed mid-write) is ignored and counted. Shape observed on v2.0.18; usage not carried.
export function parseEvents(text) {
  const events = [];
  let truncated = 0;
  const lines = String(text ?? '').split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try { events.push(JSON.parse(line)); } catch { if (lines.slice(i + 1).every((l) => !l.trim())) truncated += 1; }
  });
  return { events, truncated };
}
export const sessionIdOf = (events) => events.find((e) => e && typeof e.sessionID === 'string')?.sessionID ?? null;
export const errorOf = (events) => {
  const e = events.find((x) => x && x.type === 'error');
  return e ? String(e.error?.message ?? e.error?.type ?? 'error').slice(0, 200) : null;
};
