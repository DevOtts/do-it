// Tolerant JSONL reader for `codex exec --json` output. A truncated last line (child killed
// mid-write) is ignored and counted, never parsed.
export function parseJsonl(text) {
  const events = [];
  let truncated = 0;
  const lines = String(text ?? '').split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try { events.push(JSON.parse(line)); } catch { if (i === lines.length - 1 || lines.slice(i + 1).every((l) => !l.trim())) truncated += 1; }
  });
  return { events, truncated };
}

export const threadIdOf = (events) => events.find((e) => e.type === 'thread.started' && e.thread_id)?.thread_id ?? null;
export const hasTurnCompleted = (events) => events.some((e) => e.type === 'turn.completed');
