#!/usr/bin/env node
// Test driver for the queue lane until the verdict lane wires `gate queue` into cli.mjs (CONTRACT §5, §11 A7):
// splits argv at the first `--`, parses the flags with the spine's parseArgs and calls the exported gateQueueCmd.
// Prints the result object as one JSON line on stdout and exits with its code.
import { parseArgs } from '../../src/cli.mjs';
import { makeCtx } from '../../src/ctx.mjs';
import { gateQueueCmd } from '../../src/gate-queue.mjs';

const argv = process.argv.slice(2);
const cut = argv.indexOf('--');
const args = parseArgs(cut === -1 ? argv : argv.slice(0, cut));
args.passthrough = cut === -1 ? [] : argv.slice(cut + 1);
const ctx = makeCtx({ cwd: process.cwd(), env: process.env });
let result;
try {
  result = await gateQueueCmd(ctx, args);
} catch (e) {
  if (e && e.outcome) result = { outcome: e.outcome, exit: e.exit, ...(e.extra || {}) };
  else throw e;
}
process.stdout.write(JSON.stringify(result) + '\n');
process.exitCode = result.exit;
