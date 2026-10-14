// do-it event recorder for opencode. Appends one row per `tool.execute.before` and `session.idle`;
// never throws and never returns a deny value (whether a plugin can block a tool is unknown).
// Rows carry the tool name and ids only: tool arguments may hold secrets (G-7). No credential lives in this file.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DoItEvents = async (ctx = {}) => {
  const file = process.env.DO_IT_EVENTS_FILE || ctx.eventsFile || join(ctx.directory || process.cwd(), '.do-it', 'events.jsonl');
  const append = (row) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), host: 'opencode', ...row }) + '\n');
    } catch { /* recording must never break the host */ }
  };
  return {
    'tool.execute.before': async (input = {}) => {
      append({ type: 'tool.execute.before', tool: input.tool ?? null, session: input.sessionID ?? null });
    },
    'session.idle': async (input = {}) => {
      append({ type: 'session.idle', session: input.sessionID ?? input.id ?? null });
    },
    event: async ({ event } = {}) => {
      if (event && event.type === 'session.idle') append({ type: 'session.idle', session: event.properties?.sessionID ?? null });
    },
  };
};
export default DoItEvents;
