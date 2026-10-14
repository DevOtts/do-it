#!/usr/bin/env node
// PreToolUse hook (G-5). While the spine reports the context ceiling as blocked, the spawn tool is
// denied with a message naming the handoff. Every other tool, including the Write that produces
// runs/{run_id}/handoff.md, is allowed without consulting the spine.
import { callSpine, readStdinJson } from './_spine.mjs';

const SPAWN_TOOLS = new Set(['Agent', 'Task']);
const input = readStdinJson();
if (!SPAWN_TOOLS.has(input.tool_name)) process.exit(0);

const { exit, json } = callSpine(['gate', 'ceiling', '--status', '--json'], input.cwd);
if (json?.outcome === 'CEILING_BLOCKED' || (json == null && exit === 3)) {
  process.stderr.write('Context ceiling reached: spawning is blocked. Write the handoff (runs/<run_id>/handoff.md, `do-it handoff`) and continue in a fresh session.\n');
  process.exit(2);
}
process.exit(0);
