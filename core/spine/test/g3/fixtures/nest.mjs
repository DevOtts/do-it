// Outer gate command for T-Q2-09: records gateQueueHeldBySelf as seen from inside the gate, then runs an inner
// `gate queue` (through the test driver) and exits with its code. argv: [outFile, ...inner driver args].
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCtx } from '../../../src/ctx.mjs';
import { gateQueueHeldBySelf } from '../../../src/gate-queue.mjs';

const DRIVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'driver.mjs');
const [outFile, ...inner] = process.argv.slice(2);
const held = gateQueueHeldBySelf(makeCtx({ cwd: process.cwd(), env: process.env }));
fs.writeFileSync(outFile, JSON.stringify({ seq: held ? held.seq : null }));
const r = cp.spawnSync(process.execPath, [DRIVER, ...inner], { stdio: ['ignore', 'ignore', 'inherit'], env: process.env });
process.exit(r.status == null ? 1 : r.status);
